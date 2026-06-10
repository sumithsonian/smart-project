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

/** セットアップ + フェーズ開始イベント解決まで進めた状態を返す */
export function newGame(seed = 42, overrides: Partial<Extract<GameAction, { type: 'SETUP_GAME' }>> = {}): GameState {
  const setup: GameAction = {
    type: 'SETUP_GAME',
    seed,
    players: PLAYERS,
    clientId: 'cl-komakai',
    projectCardId: 'pj-corporate',
    projectSheetId: 'ps-standard',
    ...overrides,
  }
  let state = must(applyAction(createInitialState(), setup))
  while (state.pendingEvent !== null) {
    state = must(applyAction(state, { type: 'RESOLVE_EVENT' }))
  }
  return state
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
