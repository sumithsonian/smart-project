/**
 * redactFor — プレイヤーごとに秘匿情報を隠したビューを返す
 * ステージ2でサーバー側(Edge Function)がクライアントへ返す形。
 * 隠すもの:他人の個人目標カード、デッキの中身(山札の並び)、乱数シード。
 */
import type { GameState, PlayerState, DeckState } from './types/state'

/** 山札の並びを隠したデッキビュー(枚数と捨て札のみ公開) */
export interface DeckView {
  /** 山札の残り枚数 */
  drawCount: number
  /** 捨て札(公開情報) */
  discardPile: string[]
}

/** 他プレイヤーの個人ボードビュー(個人目標・選択肢は自分のぶんしか見えない) */
export interface PlayerBoardView extends Omit<PlayerState, 'personalGoalId' | 'goalOptionIds'> {
  /** 個人目標カードID(自分以外は null) */
  personalGoalId: string | null
  /** 個人目標の選択肢(自分以外は空配列) */
  goalOptionIds: string[]
}

/** プレイヤー1人から見えるゲーム状態 */
export interface PlayerView
  extends Omit<GameState, 'players' | 'decks' | 'rng'> {
  /** ビューの持ち主 */
  viewerId: string
  /** 個人ボード(他人の個人目標は隠される) */
  players: PlayerBoardView[]
  /** デッキ(山札の中身は隠される) */
  decks: {
    /** イベントデッキ */
    events: DeckView
    /** 要件カードデッキ */
    requirements: DeckView
    /** 限界イベントデッキ */
    limitEvents: DeckView
    /** 炎上デッキ(v2.1) */
    fires: DeckView
  }
}

function redactDeck(deck: DeckState): DeckView {
  return { drawCount: deck.drawPile.length, discardPile: [...deck.discardPile] }
}

/** playerId 視点のビューを作る */
export function redactFor(state: GameState, playerId: string): PlayerView {
  const { players, decks, rng: _rng, ...publicState } = state
  return {
    ...publicState,
    viewerId: playerId,
    players: players.map((p) => ({
      ...p,
      personalGoalId: p.id === playerId ? p.personalGoalId : null,
      goalOptionIds: p.id === playerId ? p.goalOptionIds : [],
    })),
    decks: {
      events: redactDeck(decks.events),
      requirements: redactDeck(decks.requirements),
      limitEvents: redactDeck(decks.limitEvents),
      fires: redactDeck(decks.fires),
    },
  }
}
