/**
 * イベント解決(週初トラブル・限界イベント)(rules-v4-core.md §1-2-1)
 */
import type { GameState } from '../types/state'
import type { RuleViolation } from '../types/violation'
import { violation } from '../types/violation'
import { drawCard, discard } from '../deck'
import { nextInt } from '../rng'
import {
  addFatigueAll,
  addLog,
  changeBudget,
  changeCs,
  getSlotDef,
  recheckMetAcceptance,
  updatePlayer,
  updateSlot,
} from '../helpers'

/**
 * 限界イベント処理待ちがあれば、次の1件のカードを引いて pendingEvent にセットする。
 */
export function maybeStartLimitEvent(state: GameState): GameState {
  if (state.pendingEvent !== null || state.result !== null) return state
  const [targetPlayerId, ...rest] = state.pendingLimitPlayerIds
  if (targetPlayerId === undefined) return state
  const { cardId, deck, rng } = drawCard(state.decks.limitEvents, state.rng)
  if (cardId === null) return state
  return {
    ...state,
    decks: { ...state.decks, limitEvents: deck },
    rng,
    pendingLimitPlayerIds: rest,
    pendingEvent: { kind: 'limit', cardId, targetPlayerId },
  }
}

/** RESOLVE_EVENT — 解決待ちイベントを解決する */
export function handleResolveEvent(state: GameState): GameState | RuleViolation {
  const pending = state.pendingEvent
  if (pending === null) {
    return violation('NO_PENDING_EVENT', '解決待ちのイベントはありません。')
  }
  let next: GameState = { ...state, pendingEvent: null }

  if (pending.kind === 'limit') {
    // ── 限界イベント:効果を適用し、対象プレイヤーは疲労 limitResetFatigue に戻る ──
    const card = next.content.limitEvents.find((c) => c.id === pending.cardId)
    if (!card) return violation('NO_PENDING_EVENT', `限界イベントが見つかりません: ${pending.cardId}`)
    const targetId = pending.targetPlayerId!
    const targetName = next.players.find((p) => p.id === targetId)?.name ?? targetId
    next = addLog(next, `😵 限界イベント「${card.name}」(${targetName})`)
    switch (card.effect.type) {
      case 'BUDGET':
        next = changeBudget(next, card.effect.amount)
        break
      case 'CS':
        next = changeCs(next, card.effect.amount)
        break
      case 'FATIGUE_ALL':
        next = addFatigueAll(next, card.effect.amount)
        break
      case 'OVERTIME_BAN':
        next = updatePlayer(next, targetId, (p) => ({ ...p, overtimeBanPhase: next.phase + 1 }))
        break
      case 'NONE':
        break
    }
    if (next.result !== null) return next
    next = updatePlayer(next, targetId, (p) => ({
      ...p,
      fatigue: Math.min(p.fatigue, next.config.limitResetFatigue),
    }))
    next = {
      ...next,
      decks: { ...next.decks, limitEvents: discard(next.decks.limitEvents, pending.cardId) },
    }
  } else {
    // ── 週初イベント ──
    const card = next.content.events.find((c) => c.id === pending.cardId)
    if (!card) return violation('NO_PENDING_EVENT', `イベントが見つかりません: ${pending.cardId}`)
    next = addLog(next, `⚡ イベント「${card.name}」:${card.description}`)
    for (const effect of card.effects) {
      if (next.result !== null) return next
      switch (effect.type) {
        case 'BUDGET':
          next = changeBudget(next, effect.amount)
          break
        case 'CS':
          next = changeCs(next, effect.amount)
          break
        case 'FATIGUE_ALL':
          next = addFatigueAll(next, effect.amount)
          break
        case 'INTERRUPT':
          next = applyInterrupt(next, effect.kind, effect.amount, effect.rewardBudget ?? 0)
          break
        case 'NONE':
          break
      }
    }
    next = { ...next, decks: { ...next.decks, events: discard(next.decks.events, pending.cardId) } }
  }

  if (next.result !== null) return next
  return maybeStartLimitEvent(next)
}

/** 差し込みの適用(rework: 納品済みスロットへ / bug・consult: 割り込みレーンにタスク) */
function applyInterrupt(
  state: GameState,
  kind: 'rework' | 'bug' | 'consult',
  amount: number,
  rewardBudget: number,
): GameState {
  if (kind === 'rework') {
    const delivered = state.slots.filter((s) => s.level > 0)
    if (delivered.length === 0) {
      return addLog(state, '💨 手戻り発生…のはずが、まだ何も納品していなかった(効果なし)')
    }
    const [index, rng] = nextInt(state.rng, delivered.length)
    const slot = delivered[index]!
    let next: GameState = { ...state, rng }
    next = updateSlot(next, slot.slotId, (s) => ({ ...s, reworkCubes: s.reworkCubes + amount }))
    const name = getSlotDef(next.content, slot.slotId)?.name ?? slot.slotId
    next = addLog(next, `🔁 手戻り!【${name}】に手戻り人日${amount}(解消まで検収上は未達)`)
    return recheckMetAcceptance(next)
  }
  const cardId = `interrupt-${state.placementCounter + 1}`
  const next: GameState = {
    ...state,
    board: [
      ...state.board,
      {
        cardId,
        cubes: 0,
        fire: 0,
        lane: 'interrupt',
        interrupt: kind,
        interruptEffort: amount,
        rewardBudget: kind === 'consult' ? rewardBudget : null,
        contributorIds: [],
        placedSeq: state.placementCounter + 1,
        effortReduction: 0,
      },
    ],
    placementCounter: state.placementCounter + 1,
  }
  return addLog(
    next,
    kind === 'bug'
      ? `🐛 バグ報告!対応タスク(人日${amount})が割り込み。放置するとフェーズ末ごとに CS-1`
      : `💬 相談ごと(人日${amount})。対応すれば予算+${rewardBudget}。放置しても罰はない`,
  )
}
