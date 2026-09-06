/**
 * テスト用ヘルパ(v5)
 */
import type {
  BoardTask,
  GameAction,
  GameState,
  PlayerSetup,
  PlayerState,
  RequirementState,
  SlotState,
} from '../src/types'
import { isRuleViolation } from '../src/types'
import { applyAction } from '../src/applyAction'
import { createInitialState } from '../src/initialState'

export const PLAYERS: PlayerSetup[] = [
  { id: 'a', name: 'あきら', memberId: 'm-pm-expedite' },
  { id: 'b', name: 'ばなな', memberId: 'm-allrounder' },
  { id: 'c', name: 'ちひろ', memberId: 'm-designer-polish' },
  { id: 'd', name: 'だいち', memberId: 'm-engineer-automate' },
]

/** RuleViolation なら例外にして GameState を返す */
export function must(result: GameState | ReturnType<typeof applyAction>): GameState {
  if (isRuleViolation(result)) {
    throw new Error(`ルール違反: ${result.code}: ${result.message}`)
  }
  return result
}

/** アクション列を順に適用(途中の違反は例外) */
export function apply(state: GameState, ...actions: GameAction[]): GameState {
  let current = state
  for (const action of actions) {
    current = must(applyAction(current, action))
  }
  return current
}

/** 解決待ちイベントをすべて流す(選択肢があれば先頭を選ぶ) */
export function drainPending(state: GameState): GameState {
  let current = state
  let guard = 0
  while (current.pendingEvent !== null && guard++ < 50) {
    const pending = current.pendingEvent
    const card =
      pending.kind === 'weekend'
        ? current.content.events.find((e) => e.id === pending.cardId)
        : undefined
    const choiceId = card?.choices?.[0]?.id
    current = must(applyAction(current, { type: 'RESOLVE_EVENT', choiceId }))
  }
  return current
}

/** セットアップ(スコープ会議まで)。PM は 'a' */
export function newGame(
  seed = 42,
  overrides: Partial<Extract<GameAction, { type: 'SETUP_GAME' }>> = {},
): GameState {
  return must(
    applyAction(createInitialState(), {
      type: 'SETUP_GAME',
      seed,
      players: PLAYERS,
      pmPlayerId: 'a',
      projectSheetId: 'ps-standard',
      ...overrides,
    }),
  )
}

/** 全員 Ready(週末処理まで進む)。未配属の人は休憩にしておく */
export function allReady(state: GameState): GameState {
  let s = state
  for (const p of s.players) {
    if (!s.assignments.some((a) => a.playerId === p.id && !a.overtime)) {
      s = must(applyAction(s, { type: 'ASSIGN_WORKER', playerId: p.id, target: { kind: 'rest' } }))
    }
    s = must(applyAction(s, { type: 'DECLARE_READY', playerId: p.id }))
    s = drainPending(s)
  }
  return s
}

/** スコープ会議から FINISH_SCOPE で朝会(週1)まで進める(PM で締める。週初トラブルも解決) */
export function toStandup(state: GameState): GameState {
  return drainPending(apply(state, { type: 'FINISH_SCOPE', playerId: state.pmPlayerId }))
}

/**
 * 週末を締めきる(END_WEEKEND を2回:1回目で週末イベント、2回目で締め)。
 * イベントは drainPending が先頭の選択肢で解決する。
 */
export function endWeekend(state: GameState): GameState {
  let s = drainPending(state)
  s = must(applyAction(s, { type: 'END_WEEKEND', playerId: s.pmPlayerId }))
  s = drainPending(s)
  if (s.step !== 'weekend') return s
  s = must(applyAction(s, { type: 'END_WEEKEND', playerId: s.pmPlayerId }))
  return drainPending(s)
}

/** 週を1つ進める(朝会 → 全員 Ready → 週末を締める) */
export function playWeek(state: GameState): GameState {
  return endWeekend(allReady(state))
}

/** 局面捏造:1プレイヤーだけフィールドを差し替える */
export function withPlayer(
  state: GameState,
  playerId: string,
  patch: Partial<PlayerState>,
): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, ...patch } : p)),
  }
}

/** 局面捏造:1スロットだけフィールドを差し替える */
export function withSlot(state: GameState, slotId: string, patch: Partial<SlotState>): GameState {
  return {
    ...state,
    slots: state.slots.map((s) => (s.slotId === slotId ? { ...s, ...patch } : s)),
  }
}

/** 局面捏造:要件を1つ差し替える */
export function withRequirement(
  state: GameState,
  requirementId: string,
  patch: Partial<RequirementState>,
): GameState {
  return {
    ...state,
    requirements: state.requirements.map((r) =>
      r.requirementId === requirementId ? { ...r, ...patch } : r,
    ),
  }
}

/** 局面捏造:要件を1つ場に足す */
export function addRequirement(
  state: GameState,
  requirementId: string,
  patch: Partial<RequirementState> = {},
): GameState {
  const card = state.content.requirements.find((r) => r.id === requirementId)!
  return {
    ...state,
    requirements: [
      ...state.requirements,
      {
        requirementId,
        tier: card.tier,
        deadlinePhase: card.deadlinePhase,
        met: false,
        settled: false,
        settledOutcome: null,
        addedByEvent: false,
        csOnFulfill: 0,
        sourceEventId: null,
        ...patch,
      },
    ],
  }
}

/** 局面捏造:盤上タスクのデフォルト値付き生成 */
export function makeBoardTask(cardId: string, overrides: Partial<BoardTask> = {}): BoardTask {
  return {
    cardId,
    cubes: 0,
    fire: 0,
    plannedWeek: 1,
    interrupt: null,
    interruptEffort: null,
    interruptSkill: null,
    targetSlotId: null,
    rewardBudget: null,
    actualEffort: null,
    contributorIds: [],
    placedSeq: 0,
    effortReduction: 0,
    blockedUntilWeek: 0,
    csOnFulfill: 0,
    sourceEventId: null,
    ...overrides,
  }
}

/** 局面捏造:盤上にタスクを直接追加する */
export function addBoardTask(state: GameState, task: BoardTask): GameState {
  return {
    ...state,
    board: [...state.board, task],
    placementCounter: state.placementCounter + 1,
  }
}

/** 局面捏造:前提成果物を満たしておく(納品済み Lv1 にする) */
export function deliverSlots(state: GameState, ...slotIds: string[]): GameState {
  let s = state
  for (const slotId of slotIds) {
    s = withSlot(s, slotId, { level: 1, qualityRisk: true })
  }
  return s
}
