/**
 * ホットシートUIのゲーム状態管理(エンジン v5)。
 * イベントソーシング:アクションログが正で、状態は replay で導出する。
 * undo は「最後のアクションを除いてリプレイ」。
 *
 * UI 固有の関心事(選択中のミープル・配置プレビュー・表示ラベル)もここに集約する。
 */
import { ref, shallowRef, computed } from 'vue'
import {
  applyAction,
  createInitialState,
  cubesForSlot,
  cubesForTask,
  estimatedCubes,
  isRuleViolation,
  isTaskBlocked,
  replay,
  requiredCubes,
  riskyPrerequisites,
  taskSkill,
  unmetPrerequisites,
  weekLoad,
  DEFAULT_CONTENT,
} from '@smart-project/engine'
import type {
  BoardTask,
  EventCard,
  GameAction,
  GameState,
  LimitEventCard,
  MemberCard,
  ProjectSheet,
  RequirementCard,
  RequirementState,
  RequirementTier,
  RiskLevel,
  RuleViolation,
  SkillKind,
  SlotDef,
  SlotState,
  TaskCard,
  WeekAssignment,
  WeekLoad,
  WorkerTarget,
} from '@smart-project/engine'

const actions = ref<GameAction[]>([])
const state = shallowRef<GameState>(createInitialState())
const lastViolation = ref<RuleViolation | null>(null)

/** クリック配置で選択中のミープル(null = 未選択)。RULES.md §10-1 */
export interface SelectedMeeple {
  playerId: string
  overtime: boolean
}
const selectedMeeple = ref<SelectedMeeple | null>(null)

/** プレイヤーカラー(個人ボード・トークンチップで共通使用) */
export const PLAYER_COLORS = ['#2563eb', '#16a34a', '#ea580c', '#9333ea', '#0891b2']

/** スキル系統の日本語ラベル */
export const SKILL_LABELS: Record<SkillKind, string> = {
  direction: 'ディレクション',
  design: 'デザイン',
  engineering: 'エンジニアリング',
}

/** スキル系統の短縮ラベル(チップ・pip 用) */
export const SKILL_SHORT_LABELS: Record<SkillKind, string> = {
  direction: 'ディ',
  design: 'デザ',
  engineering: 'エン',
}

/** スキル系統のアイコン */
export const SKILL_ICONS: Record<SkillKind, string> = {
  direction: '📋',
  design: '🎨',
  engineering: '⚙',
}

/**
 * スキル系統カラー(全UIで統一。人日ドット・系統チップ・pip に使う)
 * ディレクション=アンバー / デザイン=ピンク / エンジニアリング=ブルー
 */
export const SKILL_COLORS: Record<SkillKind, string> = {
  direction: '#f59e0b',
  design: '#ec4899',
  engineering: '#3b82f6',
}

/** 要件区分のラベルと色(RULES.md §3-2) */
export const TIER_LABELS: Record<RequirementTier, string> = {
  must: 'Must',
  better: 'Better',
  dropped: '見送り',
}
export const TIER_COLORS: Record<RequirementTier, string> = {
  must: '#dc2626',
  better: '#0891b2',
  dropped: '#94a3b8',
}

/** リスクのラベル(RULES.md §2-2) */
export const RISK_LABELS: Record<RiskLevel, string> = {
  low: 'リスク低',
  medium: 'リスク中',
  high: 'リスク高',
}
export const RISK_COLORS: Record<RiskLevel, string> = {
  low: '#16a34a',
  medium: '#d97706',
  high: '#dc2626',
}

/** フェーズテーマの日本語ラベル */
export const PHASE_NAMES = ['企画・要件定義', '設計・デザイン', '開発', 'テスト']

/** 手番ステップの日本語ラベル */
export const STEP_LABELS: Record<GameState['step'], string> = {
  setup: 'セットアップ',
  scope_meeting: 'スコープ会議',
  standup: '朝会(配属)',
  weekend: '週末',
  phase_end: 'フェーズ終了',
  finished: 'ゲーム終了',
}

/** 配置プレビュー(RULES.md §10-2) */
export interface AssignPreview {
  /** 見出し(配置先の名前) */
  title: string
  /** 進捗:このタスクの人日がどう変わるか */
  progress: { before: number; after: number; needed: number } | null
  /** 疲労:このプレイヤーの疲労がどう変わるか */
  fatigue: { before: number; after: number; max: number }
  /** 納品見込み(週末に納品したときの Lv。null = 今週は納品できない) */
  delivery: { level: 1 | 2; remaining: 0 } | { level: null; remaining: number } | null
  /** 予算影響(納品したときのコスト。0 = 影響なし) */
  budgetCost: number
  /** 補足(学習・休憩・消火など) */
  note: string | null
}

export function useGame() {
  function dispatch(action: GameAction): boolean {
    const next = applyAction(state.value, action)
    if (isRuleViolation(next)) {
      lastViolation.value = next
      return false
    }
    actions.value = [...actions.value, action]
    state.value = next
    lastViolation.value = null
    return true
  }

  /** 状態を変えずにアクションが通るか試す(クリック配置の発光・無効理由の表示に使う) */
  function dryRun(action: GameAction): RuleViolation | null {
    const next = applyAction(state.value, action)
    return isRuleViolation(next) ? next : null
  }

  function undo(): void {
    if (actions.value.length === 0) return
    actions.value = actions.value.slice(0, -1)
    state.value = replay(actions.value)
    lastViolation.value = null
    selectedMeeple.value = null
  }

  function reset(): void {
    actions.value = []
    state.value = createInitialState()
    lastViolation.value = null
    selectedMeeple.value = null
  }

  function exportLogJson(): string {
    return JSON.stringify(actions.value, null, 2)
  }

  const started = computed(() => state.value.phase > 0)

  // ── コンテンツ参照ヘルパ(UI 表示用) ──
  const content = computed(() => (started.value ? state.value.content : DEFAULT_CONTENT))
  function taskCard(cardId: string): TaskCard | undefined {
    return content.value.tasks.find((t) => t.id === cardId)
  }
  function slotDef(slotId: string): SlotDef | undefined {
    return content.value.slots.find((s) => s.id === slotId)
  }
  /** スロットの表示名(内部 ID は画面に出さない。RULES.md §10-4) */
  function slotName(slotId: string): string {
    return slotDef(slotId)?.name ?? slotId
  }
  function requirementCard(id: string): RequirementCard | undefined {
    return content.value.requirements.find((r) => r.id === id)
  }
  function eventCardOf(id: string): EventCard | undefined {
    return content.value.events.find((c) => c.id === id)
  }
  function limitEventCardOf(id: string): LimitEventCard | undefined {
    return content.value.limitEvents.find((c) => c.id === id)
  }
  function memberCard(id: string): MemberCard | undefined {
    return content.value.members.find((m) => m.id === id)
  }
  function projectSheetOf(id: string): ProjectSheet | undefined {
    return content.value.projectSheets.find((s) => s.id === id)
  }
  /** プレイヤーIDから表示カラーを引く */
  function playerColor(playerId: string): string {
    const index = state.value.players.findIndex((p) => p.id === playerId)
    return PLAYER_COLORS[index >= 0 ? index % PLAYER_COLORS.length : 0]!
  }
  function playerName(playerId: string): string {
    return state.value.players.find((p) => p.id === playerId)?.name ?? playerId
  }

  // ── 盤上タスク・スロット参照 ──
  function boardTask(cardId: string): BoardTask | undefined {
    return state.value.board.find((t) => t.cardId === cardId)
  }
  function slotState(slotId: string): SlotState | undefined {
    return state.value.slots.find((s) => s.slotId === slotId)
  }
  /** 差し込み込みのタスク表示名(内部 ID を出さない) */
  function displayTaskName(task: BoardTask): string {
    if (task.interrupt === 'rework') {
      return `🔁 手戻り対応(${task.targetSlotId ? slotName(task.targetSlotId) : ''})`
    }
    if (task.interrupt === 'bug') return '🐛 バグ対応'
    if (task.interrupt === 'consult') return '💬 相談ごと'
    return taskCard(task.cardId)?.name ?? task.cardId
  }
  /** 必要人日(実工数が公開済みならそれ、未公開なら見積) */
  function requiredCubesOf(task: BoardTask): number {
    return requiredCubes(state.value, task)
  }
  /** 見積ベースの必要人日(実工数が公開されるまでの表示) */
  function estimatedCubesOf(task: BoardTask): number {
    return estimatedCubes(state.value, task)
  }
  /** 実工数が公開済みか(RULES.md §2-2) */
  function isEffortRevealed(task: BoardTask): boolean {
    return task.interrupt !== null || task.actualEffort !== null
  }
  /** 対応に必要な系統(null = 系統不問) */
  function requiredSkillOf(task: BoardTask): SkillKind | null {
    return taskSkill(state.value, task)
  }
  /** ブロック中か(前提未達 or クライアント確認待ち。RULES.md §6-2) */
  function isBlocked(task: BoardTask): boolean {
    return isTaskBlocked(state.value, task)
  }
  /**
   * 品質リスクのある前提成果物の表示名(RULES.md §2-4-6)。
   * これがあると、このタスクは前提1つにつき必要人日が増えている。
   */
  function riskyPrereqNames(task: BoardTask): string[] {
    return riskyPrerequisites(state.value, task).map(slotName)
  }
  /** 満たされていない前提成果物の表示名一覧 */
  function blockReason(task: BoardTask): string | null {
    if (!isBlocked(task)) return null
    const unmet = unmetPrerequisites(state.value, task).map(slotName)
    if (unmet.length > 0) return `前提が未納品:${unmet.join('・')}`
    return 'クライアント確認待ち(今週は着手できません)'
  }
  /** 週末の納品プレビュー:現在の人日で Lv1/Lv2 どちらになるか(null = 納品不可) */
  function deliveryPreview(task: BoardTask): 1 | 2 | null {
    if (task.interrupt) return null
    const card = taskCard(task.cardId)
    if (!card) return null
    const needed = requiredCubesOf(task)
    if (task.cubes < needed) return null
    return card.maxLevel === 2 && task.cubes >= needed + state.value.config.qualityOvershoot ? 2 : 1
  }
  /** 盤上タスクへの今週の配属者 */
  function taskAssignees(cardId: string): WeekAssignment[] {
    return state.value.assignments.filter(
      (a) => a.target.kind === 'task' && a.target.cardId === cardId,
    )
  }
  /** 計画ボードの1列(週。null = Backlog)に並ぶタスク */
  function plannedTasks(week: number | null): BoardTask[] {
    return state.value.board
      .filter((t) => t.interrupt === null && t.plannedWeek === week)
      .sort((a, b) => a.placedSeq - b.placedSeq)
  }
  /** 割り込みレーンのカード */
  const interruptTasks = computed(() =>
    state.value.board.filter((t) => t.interrupt !== null).sort((a, b) => a.placedSeq - b.placedSeq),
  )
  /** 指定スロットを対象とする手戻りカードが場にあるか */
  function slotHasRework(slotId: string): boolean {
    return state.value.board.some((t) => t.interrupt === 'rework' && t.targetSlotId === slotId)
  }
  /** 改修(kind:'slot')の対象になりうるか(納品済み Lv1 のみ) */
  function isSlotSelectable(slotId: string): boolean {
    const slot = slotState(slotId)
    return !!slot && slot.level === 1
  }
  /** 指定週の予定工数と供給能力(RULES.md §5-2) */
  function loadOfWeek(week: number): WeekLoad {
    return weekLoad(state.value, week)
  }

  // ── 要件(RULES.md §3) ──
  const requirements = computed(() => state.value.requirements)
  function requirementState(id: string): RequirementState | undefined {
    return state.value.requirements.find((r) => r.requirementId === id)
  }
  /** 区分ごとの要件(表示順:Must → Better → 見送り) */
  const requirementsByTier = computed(() => ({
    must: state.value.requirements.filter((r) => r.tier === 'must'),
    better: state.value.requirements.filter((r) => r.tier === 'better'),
    dropped: state.value.requirements.filter((r) => r.tier === 'dropped'),
  }))
  /** 今週の目標:期限が近い未達 Must(HUD 用) */
  const urgentMusts = computed(() =>
    state.value.requirements
      .filter((r) => r.tier === 'must' && !r.met && !r.settled)
      .sort((a, b) => a.deadlinePhase - b.deadlinePhase),
  )
  /** 達成候補の Better(HUD 用) */
  const openBetters = computed(() =>
    state.value.requirements.filter((r) => r.tier === 'better' && !r.met && !r.settled),
  )

  // ── 配属(assignments)参照ヘルパ ──
  function assignmentOf(playerId: string, overtime: boolean): WeekAssignment | undefined {
    return state.value.assignments.find((a) => a.playerId === playerId && a.overtime === overtime)
  }
  /** 同一の配属先(WorkerTarget)かどうか */
  function sameWorkerTarget(a: WorkerTarget, b: WorkerTarget): boolean {
    if (a.kind !== b.kind) return false
    switch (a.kind) {
      case 'task':
        return b.kind === 'task' && a.cardId === b.cardId
      case 'slot':
        return b.kind === 'slot' && a.slotId === b.slotId
      case 'extinguish':
        return b.kind === 'extinguish' && a.cardId === b.cardId
      case 'learn':
        return b.kind === 'learn' && a.skill === b.skill
      case 'rest':
        return true
    }
  }
  /** 指定の配属先に今週配属されているプレイヤー一覧(卓面のミープル表示用) */
  function assignmentsForTarget(target: WorkerTarget): WeekAssignment[] {
    return state.value.assignments.filter((a) => sameWorkerTarget(a.target, target))
  }
  /** 配属先の表示ラベル */
  function targetLabel(target: WorkerTarget): string {
    switch (target.kind) {
      case 'task': {
        const t = boardTask(target.cardId)
        return t ? `${displayTaskName(t)} — 担当する` : target.cardId
      }
      case 'slot':
        return `${slotName(target.slotId)} — 改修`
      case 'learn':
        return `学習(${SKILL_LABELS[target.skill]})`
      case 'rest':
        return '休憩'
      case 'extinguish': {
        const t = boardTask(target.cardId)
        return t ? `${displayTaskName(t)} — 消火` : target.cardId
      }
    }
  }

  // ── クリック配置(RULES.md §10-1) ──
  /** ミープルを選択する(すでに同じものを選んでいたら解除) */
  function selectMeeple(playerId: string, overtime: boolean): void {
    const current = selectedMeeple.value
    if (current && current.playerId === playerId && current.overtime === overtime) {
      selectedMeeple.value = null
      return
    }
    selectedMeeple.value = { playerId, overtime }
  }
  function clearSelection(): void {
    selectedMeeple.value = null
  }
  /** 選択中のミープルをこの配置先に置けるか(理由つき) */
  function canPlaceAt(target: WorkerTarget): { ok: boolean; reason: string | null } {
    const sel = selectedMeeple.value
    if (!sel) return { ok: false, reason: null }
    // すでに配属済みなら、いったん外してから試す必要がある
    const existing = assignmentOf(sel.playerId, sel.overtime)
    let base = state.value
    if (existing) {
      const removed = applyAction(base, {
        type: 'UNASSIGN_WORKER',
        playerId: sel.playerId,
        overtime: sel.overtime,
      })
      if (!isRuleViolation(removed)) base = removed
    }
    const result = applyAction(base, {
      type: 'ASSIGN_WORKER',
      playerId: sel.playerId,
      target,
      overtime: sel.overtime,
    })
    return isRuleViolation(result)
      ? { ok: false, reason: result.message }
      : { ok: true, reason: null }
  }
  /** 選択中のミープルをこの配置先に置く */
  function placeSelectedAt(target: WorkerTarget): boolean {
    const sel = selectedMeeple.value
    if (!sel) return false
    const existing = assignmentOf(sel.playerId, sel.overtime)
    if (existing) {
      dispatch({ type: 'UNASSIGN_WORKER', playerId: sel.playerId, overtime: sel.overtime })
    }
    const ok = dispatch({
      type: 'ASSIGN_WORKER',
      playerId: sel.playerId,
      target,
      overtime: sel.overtime,
    })
    if (ok) selectedMeeple.value = null
    return ok
  }

  // ── 配置プレビュー(RULES.md §10-2) ──
  /** この配置を確定したら何が起きるかを数値で返す */
  function previewFor(playerId: string, overtime: boolean, target: WorkerTarget): AssignPreview {
    const player = state.value.players.find((p) => p.id === playerId)!
    const config = state.value.config
    const base: AssignPreview = {
      title: targetLabel(target),
      progress: null,
      fatigue: { before: player.fatigue, after: player.fatigue, max: config.fatigueMax },
      delivery: null,
      budgetCost: 0,
      note: null,
    }
    const overtimeFatigue = overtime ? config.overtimeFatigue : 0
    const memberAbility = memberCard(player.memberId)?.ability
    const overtimeCost = memberAbility === 'multitask' ? 0 : overtimeFatigue

    switch (target.kind) {
      case 'task': {
        const task = boardTask(target.cardId)
        if (!task) return base
        const gain =
          cubesForTask(state.value, playerId, task) +
          (state.value.expeditedPlayerIds.includes(playerId) ? 1 : 0)
        const needed = requiredCubesOf(task)
        const after = task.cubes + gain
        const card = task.interrupt ? undefined : taskCard(task.cardId)
        const seatFatigue = task.interrupt ? 1 : (card?.fatigue ?? 1)
        const level =
          card && card.maxLevel === 2 && after >= needed + config.qualityOvershoot ? 2 : 1
        return {
          ...base,
          progress: { before: task.cubes, after, needed },
          fatigue: {
            before: player.fatigue,
            after: Math.min(config.fatigueMax, player.fatigue + seatFatigue + overtimeCost),
            max: config.fatigueMax,
          },
          delivery:
            after >= needed
              ? task.interrupt
                ? { level: 1, remaining: 0 }
                : { level: level as 1 | 2, remaining: 0 }
              : { level: null, remaining: needed - after },
          budgetCost: after >= needed ? (card?.cost ?? 0) : 0,
          note: isEffortRevealed(task)
            ? null
            : '実工数は未公開です(着手した週の週末に判明します)',
        }
      }
      case 'slot': {
        const gain =
          cubesForSlot(state.value, playerId, target.slotId) +
          (state.value.expeditedPlayerIds.includes(playerId) ? 1 : 0)
        const slot = slotState(target.slotId)
        const before = slot?.upgradeCubes ?? 0
        return {
          ...base,
          progress: { before, after: before + gain, needed: config.upgradeCost },
          fatigue: {
            before: player.fatigue,
            after: Math.min(config.fatigueMax, player.fatigue + 1 + overtimeCost),
            max: config.fatigueMax,
          },
          note:
            before + gain >= config.upgradeCost
              ? '改修が完了して Lv2 になり、品質リスクが消えます'
              : '改修が完了すると Lv2 になり、品質リスクが消えます',
        }
      }
      case 'learn':
        return {
          ...base,
          fatigue: {
            before: player.fatigue,
            after: Math.min(config.fatigueMax, player.fatigue + overtimeCost),
            max: config.fatigueMax,
          },
          note: `${SKILL_LABELS[target.skill]}が来週から +1(${player.skills[target.skill]} → ${Math.min(
            config.skillMax,
            player.skills[target.skill] + 1,
          )})`,
        }
      case 'rest':
        return {
          ...base,
          fatigue: {
            before: player.fatigue,
            after: Math.max(0, player.fatigue - config.restRecovery),
            max: config.fatigueMax,
          },
          note: `疲労が ${config.restRecovery} 回復します`,
        }
      case 'extinguish': {
        const task = boardTask(target.cardId)
        return {
          ...base,
          fatigue: {
            before: player.fatigue,
            after: Math.min(config.fatigueMax, player.fatigue + overtimeCost),
            max: config.fatigueMax,
          },
          note: task
            ? `🔥が1個消えて、必要人日が ${requiredCubesOf(task)} → ${Math.max(
                1,
                requiredCubesOf(task) - 1,
              )} になります`
            : null,
        }
      }
    }
  }

  /** 選択中のミープルに対するプレビュー(未選択なら null) */
  function previewForSelected(target: WorkerTarget): AssignPreview | null {
    const sel = selectedMeeple.value
    if (!sel) return null
    return previewFor(sel.playerId, sel.overtime, target)
  }

  return {
    actions,
    state,
    lastViolation,
    selectedMeeple,
    started,
    content,
    dispatch,
    dryRun,
    undo,
    reset,
    exportLogJson,
    taskCard,
    slotDef,
    slotName,
    requirementCard,
    eventCardOf,
    limitEventCardOf,
    memberCard,
    projectSheetOf,
    playerColor,
    playerName,
    boardTask,
    slotState,
    displayTaskName,
    requiredCubesOf,
    estimatedCubesOf,
    isEffortRevealed,
    requiredSkillOf,
    isBlocked,
    blockReason,
    riskyPrereqNames,
    deliveryPreview,
    taskAssignees,
    plannedTasks,
    interruptTasks,
    isSlotSelectable,
    slotHasRework,
    loadOfWeek,
    requirements,
    requirementState,
    requirementsByTier,
    urgentMusts,
    openBetters,
    assignmentOf,
    assignmentsForTarget,
    targetLabel,
    selectMeeple,
    clearSelection,
    canPlaceAt,
    placeSelectedAt,
    previewFor,
    previewForSelected,
    skillLabels: SKILL_LABELS,
    skillShortLabels: SKILL_SHORT_LABELS,
    skillIcons: SKILL_ICONS,
    skillColors: SKILL_COLORS,
    tierLabels: TIER_LABELS,
    tierColors: TIER_COLORS,
    riskLabels: RISK_LABELS,
    riskColors: RISK_COLORS,
    phaseNames: PHASE_NAMES,
    stepLabels: STEP_LABELS,
  }
}
