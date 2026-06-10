/**
 * デッキ操作(山札・捨て札)
 */
import type { DeckState, RngState } from './types/state'
import { shuffle } from './rng'

/** カードID列からシャッフル済みデッキを作る */
export function buildDeck(cardIds: readonly string[], rng: RngState): [DeckState, RngState] {
  const [drawPile, nextRng] = shuffle(rng, cardIds)
  return [{ drawPile, discardPile: [] }, nextRng]
}

/**
 * 山札から1枚引く。山札が尽きていたら捨て札をシャッフルして山札に戻す。
 * 両方空の場合は cardId: null を返す。
 */
export function drawCard(
  deck: DeckState,
  rng: RngState,
): { cardId: string | null; deck: DeckState; rng: RngState } {
  let drawPile = deck.drawPile
  let discardPile = deck.discardPile
  let currentRng = rng
  if (drawPile.length === 0) {
    if (discardPile.length === 0) return { cardId: null, deck, rng }
    const [reshuffled, nextRng] = shuffle(currentRng, discardPile)
    drawPile = reshuffled
    discardPile = []
    currentRng = nextRng
  }
  const [cardId, ...rest] = drawPile
  return { cardId: cardId!, deck: { drawPile: rest, discardPile }, rng: currentRng }
}

/** カードを捨て札に置く */
export function discard(deck: DeckState, cardId: string): DeckState {
  return { drawPile: deck.drawPile, discardPile: [...deck.discardPile, cardId] }
}
