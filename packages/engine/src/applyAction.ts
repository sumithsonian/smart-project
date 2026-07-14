/**
 * applyAction — エンジンの中核。アクションを適用して次の状態を返す。
 * ルール違反の場合は状態を変えず RuleViolation を返す(純粋関数)。
 */
import type { GameAction } from './types/actions'
import type { GameState } from './types/state'
import type { RuleViolation } from './types/violation'
import { violation } from './types/violation'
import { handleSetupGame } from './actions/setup'
import { handleCommitAcceptance, handleFinishScope, handlePlaceTask } from './actions/scope'
import { handleAssignWorker, handleDeclareReady, handleUnassignWorker } from './actions/week'
import { handleDeliverTask, handleEndWeekend } from './actions/weekend'
import { handleResolveEvent } from './actions/events'
import { handleAdvancePhase } from './actions/phaseEnd'
import { handleExtraBilling, handleNegotiate } from './actions/pm'
import { handleUseAbility } from './actions/abilities'

export function applyAction(state: GameState, action: GameAction): GameState | RuleViolation {
  if (state.result !== null && action.type !== 'SETUP_GAME') {
    return violation('GAME_FINISHED', 'ゲームはすでに終了しています。')
  }
  switch (action.type) {
    case 'SETUP_GAME':
      return handleSetupGame(state, action)
    case 'COMMIT_ACCEPTANCE':
      return handleCommitAcceptance(state, action)
    case 'PLACE_TASK':
      return handlePlaceTask(state, action)
    case 'FINISH_SCOPE':
      return handleFinishScope(state, action)
    case 'RESOLVE_EVENT':
      return handleResolveEvent(state)
    case 'ASSIGN_WORKER':
      return handleAssignWorker(state, action)
    case 'UNASSIGN_WORKER':
      return handleUnassignWorker(state, action)
    case 'DECLARE_READY':
      return handleDeclareReady(state, action)
    case 'DELIVER_TASK':
      return handleDeliverTask(state, action)
    case 'END_WEEKEND':
      return handleEndWeekend(state, action)
    case 'ADVANCE_PHASE':
      return handleAdvancePhase(state)
    case 'NEGOTIATE':
      return handleNegotiate(state, action)
    case 'EXTRA_BILLING':
      return handleExtraBilling(state, action)
    case 'USE_ABILITY':
      return handleUseAbility(state, action)
    default: {
      // 網羅性チェック:GameAction に新しい型を足したらここでコンパイルエラーになる
      const exhaustive: never = action
      return violation('INVALID_STEP', `未知のアクションです: ${JSON.stringify(exhaustive)}`)
    }
  }
}
