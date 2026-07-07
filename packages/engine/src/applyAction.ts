/**
 * applyAction — エンジンの中核。アクションを適用して次の状態を返す。
 * ルール違反の場合は状態を変えず RuleViolation を返す(純粋関数)。
 */
import type { GameAction } from './types/actions'
import type { GameState } from './types/state'
import type { RuleViolation } from './types/violation'
import { isRuleViolation, violation } from './types/violation'
import { handleSetupGame, handleSelectPersonalGoal } from './actions/setup'
import { handleResolveEvent } from './actions/events'
import {
  handleDeclareReady,
  handleExtraBilling,
  handleOutsourceTask,
  handlePlaceToken,
  handleRest,
  handleRetrieveToken,
} from './actions/planning'
import {
  handleDeclareTaskOrder,
  handleResolveNextTask,
  handleSelectRequirementCard,
} from './actions/execution'
import { handleAdvancePhase } from './actions/phaseEnd'
import { handleExtinguishFire, handleSelectEpidemicTarget } from './actions/fire'
import { handleAssignWorker, handleUnassignWorker } from './actions/worker'
import { checkMilestones } from './actions/milestones'

export function applyAction(state: GameState, action: GameAction): GameState | RuleViolation {
  if (state.result !== null && action.type !== 'SETUP_GAME') {
    return violation('GAME_FINISHED', 'ゲームはすでに終了しています。')
  }
  // 個人目標の選択中は他のアクションを受け付けない(v2.1)
  if (
    state.step === 'goal_selection' &&
    action.type !== 'SELECT_PERSONAL_GOAL' &&
    action.type !== 'SETUP_GAME'
  ) {
    return violation('GOAL_SELECTION_PENDING', '全員の個人目標選択が終わるまで待ってください。')
  }

  const result = dispatch(state, action)
  if (isRuleViolation(result)) return result
  // マイルストーンの達成チェック(早取り。状態が変わるたびに判定)
  return checkMilestones(result)
}

function dispatch(state: GameState, action: GameAction): GameState | RuleViolation {
  switch (action.type) {
    case 'SETUP_GAME':
      return handleSetupGame(state, action)
    case 'SELECT_PERSONAL_GOAL':
      return handleSelectPersonalGoal(state, action)
    case 'RESOLVE_EVENT':
      return handleResolveEvent(state)
    case 'PLACE_TOKEN':
      return handlePlaceToken(state, action)
    case 'RETRIEVE_TOKEN':
      return handleRetrieveToken(state, action)
    case 'REST':
      return handleRest(state, action)
    case 'EXTRA_BILLING':
      return handleExtraBilling(state, action)
    case 'DECLARE_READY':
      return handleDeclareReady(state, action)
    case 'DECLARE_TASK_ORDER':
      return handleDeclareTaskOrder(state, action)
    case 'RESOLVE_NEXT_TASK':
      return handleResolveNextTask(state)
    case 'SELECT_REQUIREMENT_CARD':
      return handleSelectRequirementCard(state, action)
    case 'ADVANCE_PHASE':
      return handleAdvancePhase(state)
    case 'EXTINGUISH_FIRE':
      return handleExtinguishFire(state, action)
    case 'SELECT_EPIDEMIC_TARGET':
      return handleSelectEpidemicTarget(state, action)
    case 'OUTSOURCE_TASK':
      return handleOutsourceTask(state, action)
    case 'ASSIGN_WORKER':
      return handleAssignWorker(state, action)
    case 'UNASSIGN_WORKER':
      return handleUnassignWorker(state, action)
    default: {
      // 網羅性チェック:GameAction に新しい型を足したらここでコンパイルエラーになる
      const exhaustive: never = action
      return violation('INVALID_STEP', `未知のアクションです: ${JSON.stringify(exhaustive)}`)
    }
  }
}
