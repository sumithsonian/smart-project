/**
 * PM 帽子の権限:交渉・追加請求(rules-v4-core.md §3)
 */
import type { GameAction } from '../types/actions'
import type { GameState } from '../types/state'
import type { RuleViolation } from '../types/violation'
import { violation } from '../types/violation'
import { addLog, changeBudget, changeCs, checkAcceptance, getAcceptance, getBoardTask } from '../helpers'
import { guardPm, refillTaskPool } from './scope'

/** NEGOTIATE — PM 交渉(フェーズ1回。猶予/取り下げ/引き直し) */
export function handleNegotiate(
  state: GameState,
  action: Extract<GameAction, { type: 'NEGOTIATE' }>,
): GameState | RuleViolation {
  const guard = guardPm(state, action.playerId)
  if (guard) return guard
  if (state.pendingEvent !== null) {
    return violation('PENDING_EVENT', '先にイベントを解決してください。')
  }
  if (state.negotiationUsedPhase === state.phase) {
    return violation('LIMIT_REACHED', '交渉はフェーズに1回までです。')
  }

  if (action.mode === 'redraw') {
    if (state.step !== 'scope_meeting') {
      return violation('INVALID_STEP', 'カードの引き直しはスコープ会議中のみです。')
    }
    const cardIds = action.cardIds ?? []
    if (cardIds.length === 0 || cardIds.length > 2) {
      return violation('INVALID_TARGET', '引き直しは1〜2枚を指定してください。')
    }
    if (!cardIds.every((id) => state.taskPool.includes(id))) {
      return violation('NOT_FOUND', '候補プールにないカードが含まれています。')
    }
    let next: GameState = {
      ...state,
      negotiationUsedPhase: state.phase,
      taskPool: state.taskPool.filter((id) => !cardIds.includes(id)),
      decks: {
        ...state.decks,
        tasks: {
          ...state.decks.tasks,
          discardPile: [...state.decks.tasks.discardPile, ...cardIds],
        },
      },
    }
    next = refillTaskPool(next)
    return addLog(next, `🔄 交渉:タスク候補${cardIds.length}枚を引き直した`)
  }

  const commitment = state.commitments.find((c) => c.acceptanceId === action.acceptanceId)
  if (!commitment) {
    return violation('NOT_FOUND', '約束していない検収条件です。')
  }
  const card = getAcceptance(state.content, commitment.acceptanceId)

  if (action.mode === 'grace') {
    let next: GameState = {
      ...state,
      negotiationUsedPhase: state.phase,
      commitments: state.commitments.map((c) =>
        c.acceptanceId === commitment.acceptanceId ? { ...c, graceUntilPhase: state.phase } : c,
      ),
    }
    next = addLog(next, `🙏 交渉:「${card?.name}」の納期を1フェーズ待ってもらった`)
    return next
  }

  // withdraw:約束の取り下げ(即時 CS-1、以後の罰なし)
  let next: GameState = {
    ...state,
    negotiationUsedPhase: state.phase,
    commitments: state.commitments.filter((c) => c.acceptanceId !== commitment.acceptanceId),
  }
  next = changeCs(next, -1)
  if (next.result !== null) return next
  return addLog(next, `🙇 交渉:「${card?.name}」の約束を取り下げた(お客様に謝罪。CS-1)`)
}

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
    return violation('LIMIT_REACHED', `追加請求はフェーズ${state.config.extraBillingPerPhase}回までです。`)
  }
  let next: GameState = { ...state, extraBillingUsedThisPhase: state.extraBillingUsedThisPhase + 1 }
  next = changeBudget(next, next.config.extraBillingBudget)
  next = changeCs(next, -next.config.extraBillingCsCost)
  if (next.result !== null) return next
  return addLog(
    next,
    `💴 追加請求(予算+${next.config.extraBillingBudget} / CS-${next.config.extraBillingCsCost})`,
  )
}

/** 差し込みの種類の日本語ラベル(謝絶ログ用) */
function interruptLabel(kind: 'rework' | 'bug' | 'consult'): string {
  if (kind === 'rework') return '手戻り'
  if (kind === 'bug') return 'バグ報告'
  return '相談ごと'
}

/**
 * DECLINE_INTERRUPT — PM 謝絶(rules-v4-core.md §3)。
 * 割り込みレーンのカード1枚を取り下げる。回数無制限・いつでも可(pendingEvent 中は不可)。
 * 積んだキューブは失われ、即時 CS-declineCs。rework 謝絶時はスロットの検収が復帰しうる。
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
  if (!task || task.lane !== 'interrupt' || !task.interrupt) {
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
    next = checkAcceptance(next)
  }
  return next
}
