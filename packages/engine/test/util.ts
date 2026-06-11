/**
 * テスト用ヘルパ
 */
import type { GameAction, GameState, PlayerSetup } from '../src/types'
import { isRuleViolation } from '../src/types'
import { applyAction } from '../src/applyAction'
import { createInitialState } from '../src/initialState'

export const PLAYERS: PlayerSetup[] = [
  { id: 'a', name: 'あきら', role: 'pm' },
  { id: 'b', name: 'ばなな', role: 'director' },
  { id: 'c', name: 'ちひろ', role: 'designer' },
  { id: 'd', name: 'だいち', role: 'engineer' },
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

/** v1 ルール相当の設定(既存テスト用。v2.1 の新システムはオフ) */
export const V1_CONFIG = {
  fireEnabled: false,
  epEnabled: false,
  milestonesEnabled: false,
  personalGoalChoices: 1,
} as const

/** セットアップ + フェーズ開始イベント解決まで進めた状態を返す(既定で v1 ルール) */
export function newGame(seed = 42, overrides: Partial<Extract<GameAction, { type: 'SETUP_GAME' }>> = {}): GameState {
  const setup: GameAction = {
    type: 'SETUP_GAME',
    seed,
    players: PLAYERS,
    clientId: 'cl-komakai',
    projectCardId: 'pj-corporate',
    projectSheetId: 'ps-standard',
    ...overrides,
    config: { ...V1_CONFIG, ...overrides.config },
  }
  let state = must(applyAction(createInitialState(), setup))
  while (state.pendingEvent !== null) {
    state = must(applyAction(state, { type: 'RESOLVE_EVENT' }))
  }
  return state
}

/** 解決待ち(大炎上ターゲット → イベント)をすべて処理する */
export function drainPending(state: GameState): GameState {
  let guard = 0
  let current = state
  while (guard++ < 50) {
    if (current.pendingEpidemicCount > 0) {
      const pm = current.players.find((p) => p.role === 'pm')!
      const target = current.taskArea.find((t) => !t.resolved)!
      current = must(
        applyAction(current, {
          type: 'SELECT_EPIDEMIC_TARGET',
          playerId: pm.id,
          taskTileId: target.tileId,
        }),
      )
      continue
    }
    if (current.pendingEvent !== null) {
      current = must(applyAction(current, { type: 'RESOLVE_EVENT' }))
      continue
    }
    break
  }
  return current
}

/** v2.1 ルール(デフォルト設定)でセットアップし、目標選択・炎上・イベントを処理した状態を返す */
export function newGameV2(
  seed = 42,
  overrides: Partial<Extract<GameAction, { type: 'SETUP_GAME' }>> = {},
): GameState {
  let state = must(
    applyAction(createInitialState(), {
      type: 'SETUP_GAME',
      seed,
      players: PLAYERS,
      clientId: 'cl-komakai',
      projectCardId: 'pj-corporate',
      projectSheetId: 'ps-standard',
      ...overrides,
    }),
  )
  if (state.step === 'goal_selection') {
    for (const p of state.players) {
      state = must(
        applyAction(state, { type: 'SELECT_PERSONAL_GOAL', playerId: p.id, choiceIndex: 0 }),
      )
    }
  }
  return drainPending(state)
}

/** テスト用:プレイヤーの状態を直接書き換えた状態を返す(局面の捏造) */
export function withPlayer(
  state: GameState,
  playerId: string,
  patch: Partial<GameState['players'][number]>,
): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, ...patch } : p)),
  }
}
