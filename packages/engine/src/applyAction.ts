/**
 * applyAction — エンジンの中核。アクションを適用して次の状態を返す。
 * ルール違反の場合は状態を変えず RuleViolation を返す(純粋関数)。
 */
import type { GameAction } from './types/actions'
import type { GameState } from './types/state'
import type { RuleViolation } from './types/violation'
import { violation } from './types/violation'
import { handleSetupGame } from './actions/setup'
import { handleResolveEvent } from './actions/events'

export function applyAction(state: GameState, action: GameAction): GameState | RuleViolation {
  if (state.result !== null && action.type !== 'SETUP_GAME') {
    return violation('GAME_FINISHED', 'ゲームはすでに終了しています。')
  }

  switch (action.type) {
    case 'SETUP_GAME':
      return handleSetupGame(state, action)
    case 'RESOLVE_EVENT':
      return handleResolveEvent(state)
    default:
      return violation('INVALID_STEP', `このアクションはまだ実装されていません: ${action.type}`)
  }
}
