/**
 * applyAction — エンジンの中核。アクションを適用して次の状態を返す。
 * ルール違反の場合は状態を変えず RuleViolation を返す(純粋関数)。
 */
import type { GameAction } from './types/actions'
import type { GameState } from './types/state'
import type { RuleViolation } from './types/violation'
import { violation } from './types/violation'
import { handleSetupGame } from './actions/setup'
import {
  handleChangeScope,
  handleDropTask,
  handleFinishScope,
  handleMoveTask,
  handlePlanTask,
  handleRedrawTasks,
} from './actions/scope'
import {
  handleAssignWorker,
  handleCancelReady,
  handleDeclareReady,
  handleUnassignWorker,
} from './actions/week'
import { handleDeliverTask, handleEndWeekend } from './actions/weekend'
import { handleResolveEvent } from './actions/events'
import { handleAdvancePhase } from './actions/phaseEnd'
import { handleDeclineInterrupt, handleExtraBilling } from './actions/pm'
import { handleUseAbility } from './actions/abilities'

export function applyAction(state: GameState, action: GameAction): GameState | RuleViolation {
  if (state.result !== null && action.type !== 'SETUP_GAME') {
    return violation('GAME_FINISHED', 'ゲームはすでに終了しています。')
  }
  switch (action.type) {
    case 'SETUP_GAME':
      return handleSetupGame(state, action)
    case 'PLAN_TASK':
      return handlePlanTask(state, action)
    case 'MOVE_TASK':
      return handleMoveTask(state, action)
    case 'DROP_TASK':
      return handleDropTask(state, action)
    case 'REDRAW_TASKS':
      return handleRedrawTasks(state, action)
    case 'FINISH_SCOPE':
      return handleFinishScope(state, action)
    case 'CHANGE_SCOPE':
      return handleChangeScope(state, action)
    case 'RESOLVE_EVENT':
      return handleResolveEvent(state, action)
    case 'ASSIGN_WORKER':
      return handleAssignWorker(state, action)
    case 'UNASSIGN_WORKER':
      return handleUnassignWorker(state, action)
    case 'DECLARE_READY':
      return handleDeclareReady(state, action)
    case 'CANCEL_READY':
      return handleCancelReady(state, action)
    case 'DELIVER_TASK':
      return handleDeliverTask(state, action)
    case 'END_WEEKEND':
      return handleEndWeekend(state, action)
    case 'ADVANCE_PHASE':
      return handleAdvancePhase(state)
    case 'EXTRA_BILLING':
      return handleExtraBilling(state, action)
    case 'DECLINE_INTERRUPT':
      return handleDeclineInterrupt(state, action)
    case 'USE_ABILITY':
      return handleUseAbility(state, action)
    default: {
      // 網羅性チェック:GameAction に新しい型を足したらここでコンパイルエラーになる
      const exhaustive: never = action
      return violation('INVALID_STEP', `未知のアクションです: ${JSON.stringify(exhaustive)}`)
    }
  }
}
