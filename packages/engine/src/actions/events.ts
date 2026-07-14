/**
 * RESOLVE_EVENT — 解決待ちイベント(フェーズ開始/タスク/限界)の解決
 */
import type { GameState } from '../types/state'
import type { RuleViolation } from '../types/violation'
import { violation } from '../types/violation'
import { discard } from '../deck'
import {
  applyEventEffects,
  changeBudget,
  changeCs,
  addFatigueAll,
  getEventCard,
  getLimitEventCard,
  getTile,
  maybeStartLimitEvent,
  updatePlayer,
} from '../helpers'
import { maybeFinishExecution } from './execution'

/** フェーズ開始時の行動トークン補充(RULES.md §2-1。疲労Lv2は -1、限界イベントのペナルティも適用) */
function replenishTokens(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((p) => {
      const lv2Penalty = p.fatigue >= 2 ? state.config.fatigueLv2TokenPenalty : 0
      const gained = Math.max(0, state.config.tokensPerPhase - lv2Penalty - p.nextPhaseTokenPenalty)
      return { ...p, tokens: p.tokens + gained, nextPhaseTokenPenalty: 0 }
    }),
  }
}

export function handleResolveEvent(state: GameState): GameState | RuleViolation {
  if (state.result !== null) {
    return violation('GAME_FINISHED', 'ゲームはすでに終了しています。')
  }
  const pending = state.pendingEvent
  if (pending === null) {
    return violation('NO_PENDING_EVENT', '解決待ちのイベントはありません。')
  }

  let next: GameState = { ...state, pendingEvent: null }

  if (pending.kind === 'limit') {
    // ── 限界イベント(RULES.md §4):効果を適用後、対象プレイヤーは Lv2 に戻る ──
    const card = getLimitEventCard(state, pending.cardId)
    if (!card) return violation('NO_PENDING_EVENT', `限界イベントカードが見つかりません: ${pending.cardId}`)
    const targetId = pending.targetPlayerId!
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
      case 'TOKEN_PENALTY_NEXT': {
        const amount = card.effect.amount
        next = updatePlayer(next, targetId, (p) => ({
          ...p,
          nextPhaseTokenPenalty: p.nextPhaseTokenPenalty + amount,
        }))
        break
      }
      case 'QUALITY_DOWN': {
        // チームの Lv2 成果物を1つ Lv1 に劣化(獲得が新しいものから)
        const index = [...next.deliverables]
          .map((d, i) => ({ d, i }))
          .filter(({ d }) => d.level === 2)
          .map(({ i }) => i)
          .pop()
        if (index !== undefined) {
          const target = next.deliverables[index]!
          const sourceTile = getTile(next.content, target.sourceTileId)
          next = {
            ...next,
            deliverables: next.deliverables.map((d, i) =>
              i === index ? { ...d, level: 1 as const } : d,
            ),
            // 「見えない時限爆弾」防止:どの成果物が劣化したかをログに残す
            // (フェーズ末の品質判定まで発覚しない事故を防ぐ。設計原則「脅威は可視」)
            resolutionLog: [
              ...next.resolutionLog,
              {
                tileId: target.sourceTileId,
                resolved: false,
                failReason: 'QUALITY_DOWN',
                message: `⚠ 限界イベント「品質の妥協」:「${sourceTile?.name ?? target.sourceTileId}」の Lv2 成果物が Lv1 に劣化しました(品質判定に影響)。`,
              },
            ],
          }
        }
        break
      }
      case 'NONE':
        break
    }
    if (next.result !== null) return next
    // 対象プレイヤーの疲労を Lv2(limitEventResetLevel)に戻し、二重処理を防ぐ
    next = updatePlayer(next, targetId, (p) => ({
      ...p,
      fatigue: Math.min(p.fatigue, next.config.limitEventResetLevel),
    }))
    next = {
      ...next,
      pendingLimitPlayerIds: next.pendingLimitPlayerIds.filter((id) => id !== targetId),
      decks: { ...next.decks, limitEvents: discard(next.decks.limitEvents, pending.cardId) },
    }
  } else {
    // ── 通常イベント(フェーズ開始 / タスクのイベントマーク) ──
    const card = getEventCard(state, pending.cardId)
    if (!card) return violation('NO_PENDING_EVENT', `イベントカードが見つかりません: ${pending.cardId}`)
    next = applyEventEffects(next, card.effects)
    if (next.result !== null) return next
    next = {
      ...next,
      decks: { ...next.decks, events: discard(next.decks.events, pending.cardId) },
    }
    // フェーズ開始イベントなら、解決後にトークン補充(§2-1 の順序)
    if (pending.kind === 'phase_start' && next.replenishAfterEvent) {
      next = replenishTokens(next)
      next = { ...next, replenishAfterEvent: false }
    }
  }

  // 疲労 Lv3 到達者がいれば次の限界イベントを開始する
  next = maybeStartLimitEvent(next)
  if (next.result !== null) return next
  // 実行ステップ中なら、解決待ちがなくなった時点でフェーズ終了処理へ進む
  return maybeFinishExecution(next)
}
