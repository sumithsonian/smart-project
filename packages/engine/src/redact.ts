/**
 * redactFor — プレイヤーごとに秘匿情報を隠したビューを返す
 * v4.0 のホットシートに個人秘匿情報はないが、山札の並びと乱数シードは隠す
 * (ステージ2でサーバー側がクライアントへ返す形の骨組みを維持)。
 */
import type { GameState, DeckState } from './types/state'

/** 山札の並びを隠したデッキビュー(枚数と捨て札のみ公開) */
export interface DeckView {
  /** 山札の残り枚数 */
  drawCount: number
  /** 捨て札(公開情報) */
  discardPile: string[]
}

/** プレイヤー1人から見えるゲーム状態 */
export interface PlayerView extends Omit<GameState, 'decks' | 'rng'> {
  /** ビューの持ち主 */
  viewerId: string
  /** デッキ(山札の中身は隠される) */
  decks: {
    tasks: DeckView
    events: DeckView
    fires: DeckView
    limitEvents: DeckView
  }
}

function redactDeck(deck: DeckState): DeckView {
  return { drawCount: deck.drawPile.length, discardPile: [...deck.discardPile] }
}

/** playerId 視点のビューを作る */
export function redactFor(state: GameState, playerId: string): PlayerView {
  const { decks, rng: _rng, ...publicState } = state
  return {
    ...publicState,
    viewerId: playerId,
    decks: {
      tasks: redactDeck(decks.tasks),
      events: redactDeck(decks.events),
      fires: redactDeck(decks.fires),
      limitEvents: redactDeck(decks.limitEvents),
    },
  }
}
