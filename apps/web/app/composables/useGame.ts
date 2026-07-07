/**
 * ホットシートUIのゲーム状態管理。
 * イベントソーシング:アクションログが正で、状態は replay で導出する。
 * undo は「最後のアクションを除いてリプレイ」。
 */
import { ref, shallowRef, computed } from 'vue'
import {
  applyAction,
  createInitialState,
  isRuleViolation,
  replay,
  DEFAULT_CONTENT,
} from '@smart-project/engine'
import type {
  GameAction,
  GameState,
  RuleViolation,
  SkillKind,
  WeekAssignment,
  WorkerTarget,
} from '@smart-project/engine'

const actions = ref<GameAction[]>([])
const state = shallowRef<GameState>(createInitialState())
const lastViolation = ref<RuleViolation | null>(null)
/** UI 上で選択中のタスク(配置・回収 / v3.0 では配属先タスクの選択に使う) */
const selectedTaskId = ref<string | null>(null)

/** プレイヤーカラー(個人ボード・トークンチップで共通使用) */
export const PLAYER_COLORS = ['#2563eb', '#16a34a', '#ea580c', '#9333ea', '#0891b2']

/** スキル系統の日本語ラベル(タスクエリア・個人ボード・v3.0 席表示で共通使用) */
export const SKILL_LABELS: Record<SkillKind, string> = {
  direction: 'ディレクション',
  design: 'デザイン',
  engineering: 'エンジニアリング',
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
    selectedTaskId.value = null
  }

  function exportLogJson(): string {
    return JSON.stringify(actions.value, null, 2)
  }

  const started = computed(() => state.value.phase > 0)

  // ── コンテンツ参照ヘルパ(UI 表示用) ──
  const content = computed(() => (started.value ? state.value.content : DEFAULT_CONTENT))
  function tile(tileId: string) {
    return content.value.tasks.find((t) => t.id === tileId)
  }
  function eventCard(cardId: string) {
    return content.value.events.find((c) => c.id === cardId)
  }
  function limitEventCard(cardId: string) {
    return content.value.limitEvents.find((c) => c.id === cardId)
  }
  function requirementCard(cardId: string) {
    return content.value.requirements.find((c) => c.id === cardId)
  }
  function personalGoal(cardId: string) {
    return content.value.personalGoals.find((c) => c.id === cardId)
  }
  function roleName(role: string) {
    return content.value.roles.find((r) => r.role === role)?.name ?? role
  }
  /** プレイヤーIDから表示カラーを引く */
  function playerColor(playerId: string): string {
    const index = state.value.players.findIndex((p) => p.id === playerId)
    return PLAYER_COLORS[index >= 0 ? index % PLAYER_COLORS.length : 0]!
  }

  // ── v3.0 週次ワーカーコミット:配属(assignments)参照ヘルパ ──
  // packages/engine の helpers.ts(seatOccupants/supportCount 相当)は index.ts から
  // 公開されていないため、UI 表示用に state.assignments から同じロジックをここで導出する。
  /** ワーカーモードが有効か */
  const workerMode = computed(() => state.value.config.workerCommitEnabled)

  /** タスクの席の占有者(seatIndex → playerId) */
  function seatOccupants(taskTileId: string): Map<number, string> {
    const map = new Map<number, string>()
    for (const a of state.value.assignments) {
      if (a.target.kind === 'seat' && a.target.taskTileId === taskTileId) {
        map.set(a.target.seatIndex, a.playerId)
      }
    }
    return map
  }
  /** 指定席の占有者(未配属なら undefined) */
  function seatOccupant(taskTileId: string, seatIndex: number): string | undefined {
    return seatOccupants(taskTileId).get(seatIndex)
  }
  /** タスクの空席インデックス一覧 */
  function openSeatIndices(taskTileId: string): number[] {
    const t = tile(taskTileId)
    if (!t) return []
    const occupied = seatOccupants(taskTileId)
    return t.seats.map((_, i) => i).filter((i) => !occupied.has(i))
  }
  /** タスクへ応援配属しているプレイヤーID */
  function supportWorkerIds(taskTileId: string): string[] {
    return state.value.assignments
      .filter((a) => a.target.kind === 'support' && a.target.taskTileId === taskTileId)
      .map((a) => a.playerId)
  }
  /** タスクへの応援(support)人数 */
  function supportCountOf(taskTileId: string): number {
    return supportWorkerIds(taskTileId).length
  }
  /** タスクへの消火宣言数(v3.0。今週末に🔥を1個ずつ除去する) */
  function extinguishPledgeCountOf(taskTileId: string): number {
    return state.value.assignments.filter(
      (a) => a.target.kind === 'extinguish' && a.target.taskTileId === taskTileId,
    ).length
  }
  /** プレイヤーの今週の配属(主担当 or 残業)を引く */
  function assignmentOf(playerId: string, overtime: boolean): WeekAssignment | undefined {
    return state.value.assignments.find((a) => a.playerId === playerId && a.overtime === overtime)
  }
  /** 配属先の表示ラベル */
  function targetLabel(target: WorkerTarget): string {
    switch (target.kind) {
      case 'seat': {
        const t = tile(target.taskTileId)
        const seat = t?.seats[target.seatIndex]
        const seatLabel = seat?.skill ? `${SKILL_LABELS[seat.skill]}Lv${seat.level}` : '人手'
        return `${t?.name ?? target.taskTileId} — ${seatLabel}席`
      }
      case 'support':
        return `${tile(target.taskTileId)?.name ?? target.taskTileId} — 応援`
      case 'learning':
        return `学習(${SKILL_LABELS[target.skill]})`
      case 'rest':
        return '休憩'
      case 'extinguish':
        return `${tile(target.taskTileId)?.name ?? target.taskTileId} — 消火`
    }
  }

  return {
    actions,
    state,
    lastViolation,
    selectedTaskId,
    started,
    content,
    dispatch,
    undo,
    reset,
    exportLogJson,
    tile,
    eventCard,
    limitEventCard,
    requirementCard,
    personalGoal,
    roleName,
    playerColor,
    // v3.0 週次ワーカーコミット
    skillLabels: SKILL_LABELS,
    workerMode,
    seatOccupants,
    seatOccupant,
    openSeatIndices,
    supportWorkerIds,
    supportCountOf,
    extinguishPledgeCountOf,
    assignmentOf,
    targetLabel,
  }
}
