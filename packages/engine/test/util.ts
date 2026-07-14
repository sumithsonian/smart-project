/**
 * テスト用ヘルパ(v4)
 */
import type { BoardTask, GameAction, GameState, PlayerSetup, PlayerState, SlotState } from '../src/types'
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

/** 解決待ちイベントをすべて流す */
export function drainPending(state: GameState): GameState {
  let current = state
  let guard = 0
  while (current.pendingEvent !== null && guard++ < 50) {
    current = must(applyAction(current, { type: 'RESOLVE_EVENT' }))
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

/** 全員 Ready(週末処理まで進む) */
export function allReady(state: GameState): GameState {
  let s = state
  for (const p of s.players) {
    s = must(applyAction(s, { type: 'DECLARE_READY', playerId: p.id }))
    s = drainPending(s)
  }
  return s
}

/** スコープ会議から FINISH_SCOPE で朝会(週1)まで進める(PM で締める。週初トラブルも解決) */
export function toStandup(state: GameState): GameState {
  return drainPending(apply(state, { type: 'FINISH_SCOPE', playerId: state.pmPlayerId }))
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

/** 局面捏造:盤上タスクのデフォルト値付き生成 */
export function makeBoardTask(cardId: string, overrides: Partial<BoardTask> = {}): BoardTask {
  return {
    cardId,
    cubes: 0,
    fire: 0,
    lane: 'start',
    interrupt: null,
    interruptEffort: null,
    rewardBudget: null,
    contributorIds: [],
    placedSeq: 0,
    effortReduction: 0,
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
