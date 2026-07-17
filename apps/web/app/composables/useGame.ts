/**
 * ホットシートUIのゲーム状態管理(エンジン v4:工数モデル)。
 * イベントソーシング:アクションログが正で、状態は replay で導出する。
 * undo は「最後のアクションを除いてリプレイ」。
 */
import { ref, shallowRef, computed } from 'vue'
import {
  applyAction,
  createInitialState,
  isRuleViolation,
  replay,
  requiredCubes,
  taskLabel,
  DEFAULT_CONTENT,
} from '@smart-project/engine'
import type {
  AcceptanceCard,
  BoardTask,
  Commitment,
  EventCard,
  GameAction,
  GameState,
  Lane,
  LimitEventCard,
  MemberCard,
  ProjectSheet,
  RuleViolation,
  SkillKind,
  SlotDef,
  SlotState,
  TaskCard,
  WeekAssignment,
  WorkerTarget,
} from '@smart-project/engine'

const actions = ref<GameAction[]>([])
const state = shallowRef<GameState>(createInitialState())
const lastViolation = ref<RuleViolation | null>(null)

/** UI 上で選択中の対象(盤上タスク or 納品済みスロット)。配属・消火・能力の対象選択に使う */
export type UiTarget = { kind: 'task'; cardId: string } | { kind: 'slot'; slotId: string }
const selectedTarget = ref<UiTarget | null>(null)

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

/**
 * スキル系統カラー(全UIで統一。人日ドット・系統チップ・pip に使う)
 * ディレクション=アンバー / デザイン=ピンク / エンジニアリング=ブルー
 */
export const SKILL_COLORS: Record<SkillKind, string> = {
  direction: '#f59e0b',
  design: '#ec4899',
  engineering: '#3b82f6',
}

/** 列(レーン)の日本語ラベル(差し込みレーン込み) */
export const LANE_LABELS: Record<Lane | 'interrupt', string> = {
  start: '起点',
  middle: '中盤',
  finish: '仕上げ',
  interrupt: '差し込み',
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

  function undo(): void {
    if (actions.value.length === 0) return
    actions.value = actions.value.slice(0, -1)
    state.value = replay(actions.value)
    lastViolation.value = null
  }

  function reset(): void {
    actions.value = []
    state.value = createInitialState()
    lastViolation.value = null
    selectedTarget.value = null
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
  function acceptanceCard(id: string): AcceptanceCard | undefined {
    return content.value.acceptance.find((a) => a.id === id)
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
  /** 差し込み(bug/consult)込みのタスク表示名(手戻りは盤上タスクにならない) */
  function displayTaskName(task: BoardTask): string {
    if (task.interrupt === 'bug') return '🐛 バグ対応'
    if (task.interrupt === 'consult') return '💬 相談ごと'
    return taskLabel(state.value, task)
  }
  /** 必要工数(engine の requiredCubes をそのまま利用) */
  function requiredCubesOf(task: BoardTask): number {
    return requiredCubes(state.value, task)
  }
  /** 週末の納品プレビュー:現在のキューブ数で Lv1/Lv2 どちらになるか(通常タスクのみ。null=納品不可) */
  function deliveryPreview(task: BoardTask): 1 | 2 | null {
    if (task.interrupt) return null
    const card = taskCard(task.cardId)
    if (!card) return null
    const needed = requiredCubesOf(task)
    if (task.cubes < needed) return null
    return card.maxLevel === 2 && task.cubes >= needed + state.value.config.qualityOvershoot ? 2 : 1
  }
  /** 盤上タスクへの今週の配属者(kind='task') */
  function taskAssignees(cardId: string): WeekAssignment[] {
    return state.value.assignments.filter((a) => a.target.kind === 'task' && a.target.cardId === cardId)
  }
  /** レーン別に並べた盤上タスク(表示順=placedSeq) */
  function boardByLane(lane: Lane | 'interrupt'): BoardTask[] {
    return state.value.board.filter((t) => t.lane === lane).sort((a, b) => a.placedSeq - b.placedSeq)
  }
  /** スロットが標準(kind:'slot')の配属対象として選択可能か(改修・手戻り対応) */
  function isSlotSelectable(slotId: string): boolean {
    const slot = slotState(slotId)
    if (!slot || slot.level === 0) return false
    if (slot.reworkCubes === 0 && slot.level >= 2) return false
    return true
  }

  // ── 検収条件・約束 ──
  function commitmentOf(acceptanceId: string): Commitment | undefined {
    return state.value.commitments.find((c) => c.acceptanceId === acceptanceId)
  }

  // ── 配属(assignments)参照ヘルパ ──
  function assignmentOf(playerId: string, overtime: boolean): WeekAssignment | undefined {
    return state.value.assignments.find((a) => a.playerId === playerId && a.overtime === overtime)
  }
  /** 配属先の表示ラベル */
  function targetLabel(target: WorkerTarget): string {
    switch (target.kind) {
      case 'task': {
        const t = boardTask(target.cardId)
        return `${t ? displayTaskName(t) : target.cardId} — 担当する`
      }
      case 'slot': {
        const s = slotDef(target.slotId)
        return `${s?.name ?? target.slotId} — 改修/手戻り`
      }
      case 'learn':
        return `学習(${SKILL_LABELS[target.skill]})`
      case 'rest':
        return '休憩'
      case 'extinguish': {
        const t = boardTask(target.cardId)
        return `${t ? displayTaskName(t) : target.cardId} — 消火`
      }
    }
  }

  return {
    actions,
    state,
    lastViolation,
    selectedTarget,
    started,
    content,
    dispatch,
    undo,
    reset,
    exportLogJson,
    taskCard,
    slotDef,
    acceptanceCard,
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
    deliveryPreview,
    taskAssignees,
    boardByLane,
    isSlotSelectable,
    commitmentOf,
    assignmentOf,
    targetLabel,
    skillLabels: SKILL_LABELS,
    skillShortLabels: SKILL_SHORT_LABELS,
    skillColors: SKILL_COLORS,
    laneLabels: LANE_LABELS,
    phaseNames: PHASE_NAMES,
    stepLabels: STEP_LABELS,
  }
}
