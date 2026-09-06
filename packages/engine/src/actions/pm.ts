/**
 * PM 帽子の権限:追加請求・謝絶(RULES.md §9-2・§8-4)
 * スコープ交渉(CHANGE_SCOPE)と候補の引き直し(REDRAW_TASKS)は actions/scope.ts にある。
 */
import type { GameAction } from '../types/actions'
import type { GameState } from '../types/state'
import type { RuleViolation } from '../types/violation'
import { violation } from '../types/violation'
import { addLog, changeBudget, changeCs, getBoardTask, refreshRequirements } from '../helpers'
import { guardPm } from './scope'
import { interruptLabel } from './events'

/** EXTRA_BILLING — 追加請求(PM。フェーズ1回。CS と引き換えに予算回復) */
export function handleExtraBilling(
  state: GameState,
  action: Extract<GameAction, { type: 'EXTRA_BILLING' }>,
): GameState | RuleViolation {
  const guard = guardPm(state, action.playerId)
  if (guard) return guard
  if (state.pendingEvent !== null) {
    return violation('PENDING_EVENT', '先にイベントを解決してください。')
  }
  if (state.extraBillingUsedThisPhase >= state.config.extraBillingPerPhase) {
    return violation(
      'LIMIT_REACHED',
      `追加請求はフェーズ${state.config.extraBillingPerPhase}回までです。`,
    )
  }
  let next: GameState = {
    ...state,
    extraBillingUsedThisPhase: state.extraBillingUsedThisPhase + 1,
  }
  next = changeBudget(next, next.config.extraBillingBudget)
  next = changeCs(next, -next.config.extraBillingCsCost)
  if (next.result !== null) return next
  return addLog(
    next,
    `💴 追加請求(予算+${next.config.extraBillingBudget} / CS-${next.config.extraBillingCsCost})`,
  )
}

/**
 * DECLINE_INTERRUPT — PM 謝絶(RULES.md §8-4)。
 * 割り込みレーンのカード1枚を取り下げる。回数無制限・いつでも可(pendingEvent 中は不可)。
 * 積んだキューブは失われ、即時 CS-declineCs。rework 謝絶時は要件の判定が復帰しうる。
 */
export function handleDeclineInterrupt(
  state: GameState,
  action: Extract<GameAction, { type: 'DECLINE_INTERRUPT' }>,
): GameState | RuleViolation {
  const guard = guardPm(state, action.playerId)
  if (guard) return guard
  if (state.pendingEvent !== null) {
    return violation('PENDING_EVENT', '先にイベントを解決してください。')
  }
  const task = getBoardTask(state, action.cardId)
  if (!task || task.interrupt === null) {
    return violation('NOT_FOUND', `割り込みレーンにないカードです: ${action.cardId}`)
  }

  let next: GameState = {
    ...state,
    board: state.board.filter((t) => t.cardId !== action.cardId),
    // 朝会中に謝絶した場合、配属済みのアサインも除去する
    assignments: state.assignments.filter(
      (a) =>
        !(
          (a.target.kind === 'task' || a.target.kind === 'extinguish') &&
          a.target.cardId === action.cardId
        ),
    ),
  }
  next = changeCs(next, -next.config.declineCs)
  if (next.result !== null) return next
  next = addLog(
    next,
    `🙇 謝絶:「${interruptLabel(task.interrupt)}(人日${task.interruptEffort})」を丁重にお断り(CS-${next.config.declineCs})`,
  )
  if (task.interrupt === 'rework') {
    next = refreshRequirements(next)
  }
  return next
}
