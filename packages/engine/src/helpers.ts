/**
 * エンジン内部の共通ヘルパ(すべて純粋関数)
 */
import type {
  ClientCard,
  EventCard,
  EventEffect,
  GameContent,
  LimitEventCard,
  ProjectSheet,
  RequirementCard,
  TaskTile,
} from './types/content'
import type { GameState, PlayerState } from './types/state'
import type { QcdWeightMode } from './types/config'
import { drawCard } from './deck'

/** タイルIDからタスクタイル定義を引く */
export function getTile(content: GameContent, tileId: string): TaskTile | undefined {
  return content.tasks.find((t) => t.id === tileId)
}

/** プレイヤーを引く */
export function getPlayer(state: GameState, playerId: string): PlayerState | undefined {
  return state.players.find((p) => p.id === playerId)
}

/** 使用中のプロジェクトシート */
export function getSheet(state: GameState): ProjectSheet {
  return state.content.projectSheets.find((s) => s.id === state.projectSheetId)!
}

/** 公開中のクライアントカード */
export function getClient(state: GameState): ClientCard {
  return state.content.clients.find((c) => c.id === state.clientId)!
}

/** イベントカードを引く */
export function getEventCard(state: GameState, cardId: string): EventCard | undefined {
  return state.content.events.find((c) => c.id === cardId)
}

/** 限界イベントカードを引く */
export function getLimitEventCard(state: GameState, cardId: string): LimitEventCard | undefined {
  return state.content.limitEvents.find((c) => c.id === cardId)
}

/** 要件カードを引く */
export function getRequirementCard(state: GameState, cardId: string): RequirementCard | undefined {
  return state.content.requirements.find((c) => c.id === cardId)
}

/** タスクの席の占有者(v3.0 ワーカーモード。seatIndex → playerId) */
export function seatOccupants(state: GameState, taskTileId: string): Map<number, string> {
  const map = new Map<number, string>()
  for (const a of state.assignments) {
    if (a.target.kind === 'seat' && a.target.taskTileId === taskTileId) {
      map.set(a.target.seatIndex, a.playerId)
    }
  }
  return map
}

/** タスクへの応援(support)人数(v3.0。🔥ぶんの追加工数) */
export function supportCount(state: GameState, taskTileId: string): number {
  return state.assignments.filter(
    (a) => a.target.kind === 'support' && a.target.taskTileId === taskTileId,
  ).length
}

/** タスクに関与している(席 or 応援)プレイヤーID(v3.0。重複なし) */
export function taskWorkerIds(state: GameState, taskTileId: string): string[] {
  const ids: string[] = []
  for (const a of state.assignments) {
    if (
      (a.target.kind === 'seat' || a.target.kind === 'support') &&
      a.target.taskTileId === taskTileId &&
      !ids.includes(a.playerId)
    ) {
      ids.push(a.playerId)
    }
  }
  return ids
}

/** 1人のプレイヤーだけ差し替えた players 配列を返す */
export function updatePlayer(
  state: GameState,
  playerId: string,
  update: (player: PlayerState) => PlayerState,
): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? update(p) : p)),
  }
}

/**
 * クライアント QCD 重みを CS 基本増減量に適用する(RULES.md §3 暫定)
 * base は正の「大きさ」を渡す(符号は呼び出し側で管理)。
 */
export function applyWeight(base: number, weight: number, mode: QcdWeightMode): number {
  return mode === 'multiply' ? base * weight : base + weight
}

/**
 * CS を増減する。csInstantLose が有効で CS が 0 未満になったら即時敗北にする。
 */
export function changeCs(state: GameState, delta: number): GameState {
  const cs = state.cs + delta
  const next = { ...state, cs }
  if (cs < 0 && state.config.csInstantLose && next.result === null) {
    return {
      ...next,
      step: 'finished',
      result: {
        outcome: 'lose',
        reason: 'CS トラックが 0 未満になったため、チームは敗北しました。',
        personalResults: Object.fromEntries(state.players.map((p) => [p.id, false])),
      },
    }
  }
  return next
}

/** 予算を増減する(0 未満にはならない) */
export function changeBudget(state: GameState, delta: number): GameState {
  return { ...state, budget: Math.max(0, state.budget + delta) }
}

/**
 * プレイヤーに疲労を加算する(上限 fatigueMax)。
 * 上限に到達したプレイヤーは限界イベント処理待ちキューに積む(RULES.md §4)。
 */
export function addFatigue(state: GameState, playerId: string, amount: number): GameState {
  const player = getPlayer(state, playerId)
  if (!player || amount === 0) return state
  if (amount < 0) {
    return updatePlayer(state, playerId, (p) => ({
      ...p,
      fatigue: Math.max(0, p.fatigue + amount),
    }))
  }
  const before = player.fatigue
  const after = Math.min(state.config.fatigueMax, before + amount)
  let next = updatePlayer(state, playerId, (p) => ({ ...p, fatigue: after }))
  if (
    after >= state.config.fatigueMax &&
    before < state.config.fatigueMax &&
    !next.pendingLimitPlayerIds.includes(playerId)
  ) {
    next = { ...next, pendingLimitPlayerIds: [...next.pendingLimitPlayerIds, playerId] }
  }
  return next
}

/** 全員に疲労を加算する */
export function addFatigueAll(state: GameState, amount: number): GameState {
  let next = state
  for (const player of state.players) {
    next = addFatigue(next, player.id, amount)
  }
  return next
}

/** イベントカードの効果列を適用する */
export function applyEventEffects(state: GameState, effects: EventEffect[]): GameState {
  let next = state
  for (const effect of effects) {
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
      case 'NONE':
        break
    }
  }
  return next
}

/**
 * 限界イベント処理待ちがあれば、次の1件の限界イベントカードを引いて pendingEvent にセットする。
 * すでに別の解決待ちイベントがある場合は何もしない。
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
