/**
 * 炎上システム(RULES.md §10。v2.1)
 * - フェーズ開始時に炎上カードを引き、対象タスクに🔥を置く
 * - 🔥1個 = 必要トークン+1。閾値で延焼(子タスクへ + CS減)
 * - 大炎上:捨て札リシャッフル + PM が選んだタスクに🔥2個
 * - 消火:プランニング中にトークンで🔥除去
 */
import type { GameAction } from '../types/actions'
import type { GameState } from '../types/state'
import type { RuleViolation } from '../types/violation'
import { violation } from '../types/violation'
import { drawCard, discard } from '../deck'
import { shuffle } from '../rng'
import { changeCs, getPlayer, getTile, updatePlayer } from '../helpers'

/** 大炎上カードのID接頭辞 */
const EPIDEMIC_PREFIX = 'epidemic-'

/** 炎上フェーズ(ドロー or 大炎上ターゲット選択)が進行中か */
export function firePhaseActive(state: GameState): boolean {
  return state.remainingFireDraws > 0 || state.pendingEpidemicCount > 0
}

/**
 * 🔥を1個置く。閾値到達なら延焼(チェーン可。同一連鎖内で同じタスクは1回まで)。
 */
export function addFire(state: GameState, tileId: string, visited: Set<string>): GameState {
  if (state.result !== null) return state
  const instance = state.taskArea.find((t) => t.tileId === tileId)
  const tile = getTile(state.content, tileId)
  if (!instance || !tile || instance.resolved || visited.has(tileId)) return state

  if (instance.fire >= state.config.fireOutbreakThreshold - 1) {
    // ── 延焼:この🔥は置かず、子タスクへ飛び火 + CS 減少 ──
    visited.add(tileId)
    let next = changeCs(state, -state.config.fireOutbreakCsPenalty)
    next = {
      ...next,
      fireLog: [
        ...next.fireLog,
        `🚨「${tile.name}」が延焼!(CS -${state.config.fireOutbreakCsPenalty})`,
      ],
    }
    if (next.result !== null) return next
    // 盤面上の未解決の子タスク。いなければ同フェーズの他の未解決タスク
    let targets = next.taskArea.filter((t) => {
      const def = getTile(next.content, t.tileId)
      return !t.resolved && def !== undefined && def.dependsOn.includes(tileId)
    })
    if (targets.length === 0) {
      targets = next.taskArea.filter((t) => {
        const def = getTile(next.content, t.tileId)
        return !t.resolved && t.tileId !== tileId && def !== undefined && def.phase === tile.phase
      })
    }
    for (const target of targets) {
      next = addFire(next, target.tileId, visited)
      if (next.result !== null) return next
    }
    return next
  }

  return {
    ...state,
    taskArea: state.taskArea.map((t) =>
      t.tileId === tileId ? { ...t, fire: t.fire + 1 } : t,
    ),
    fireLog: [...state.fireLog, `🔥「${tile.name}」に炎上トークン(計${instance.fire + 1}個)`],
  }
}

/**
 * 炎上ドローを進める。大炎上を引いたら PM のターゲット選択待ちで中断する。
 * すべて引き終わったらフェーズ開始イベントのドローへ進む。
 */
export function continueFireDraws(state: GameState): GameState {
  let next = state
  while (next.remainingFireDraws > 0 && next.pendingEpidemicCount === 0 && next.result === null) {
    const { cardId, deck, rng } = drawCard(next.decks.fires, next.rng)
    if (cardId === null) {
      next = { ...next, remainingFireDraws: 0 }
      break
    }
    next = {
      ...next,
      decks: { ...next.decks, fires: deck },
      rng,
      remainingFireDraws: next.remainingFireDraws - 1,
    }
    if (cardId.startsWith(EPIDEMIC_PREFIX)) {
      // ── 大炎上:捨て札をリシャッフルして山に戻し、PM のターゲット選択待ちに ──
      const pile = [...next.decks.fires.drawPile, ...next.decks.fires.discardPile]
      const [reshuffled, rng2] = shuffle(next.rng, pile)
      next = {
        ...next,
        rng: rng2,
        decks: { ...next.decks, fires: { drawPile: reshuffled, discardPile: [] } },
        pendingEpidemicCount: next.pendingEpidemicCount + 1,
        fireLog: [
          ...next.fireLog,
          '🌋 大炎上!捨て札が山に戻りました。PM はターゲットを選んでください(🔥2個)',
        ],
      }
      // 大炎上カード自体はゲームから除外(山にも捨て札にも戻さない)
    } else {
      const onBoard = next.taskArea.some((t) => t.tileId === cardId && !t.resolved)
      if (onBoard) {
        next = addFire(next, cardId, new Set())
      } else {
        const tile = getTile(next.content, cardId)
        next = {
          ...next,
          fireLog: [...next.fireLog, `💨「${tile?.name ?? cardId}」は盤面にないため延焼なし`],
        }
      }
      next = { ...next, decks: { ...next.decks, fires: discard(next.decks.fires, cardId) } }
    }
  }

  if (next.result !== null) return next
  // 炎上フローが完了したら、フェーズ開始イベントを引く
  if (!firePhaseActive(next) && next.phaseStartReplenish !== null) {
    next = drawPhaseStartEvent(next, next.phaseStartReplenish)
    next = { ...next, phaseStartReplenish: null }
  }
  return next
}

/** フェーズ開始イベントを引いて pendingEvent にセットする(炎上フロー完了後 or 炎上無効時) */
export function drawPhaseStartEvent(state: GameState, replenish: boolean): GameState {
  const { cardId, deck, rng } = drawCard(state.decks.events, state.rng)
  if (cardId === null) {
    // イベントデッキが完全に尽きている場合は補充のみ
    if (!replenish) return state
    return {
      ...state,
      players: state.players.map((p) => {
        const lv2Penalty = p.fatigue >= 2 ? state.config.fatigueLv2TokenPenalty : 0
        const gained = Math.max(
          0,
          state.config.tokensPerPhase - lv2Penalty - p.nextPhaseTokenPenalty,
        )
        return { ...p, tokens: p.tokens + gained, nextPhaseTokenPenalty: 0 }
      }),
    }
  }
  return {
    ...state,
    decks: { ...state.decks, events: deck },
    rng,
    pendingEvent: { kind: 'phase_start', cardId, targetPlayerId: null },
    replenishAfterEvent: replenish,
  }
}

/**
 * フェーズ開始フロー(タスク公開後に呼ぶ):炎上ドロー → イベント。
 * 炎上無効時はイベントのみ。
 */
export function beginPhaseStart(state: GameState, replenish: boolean): GameState {
  if (!state.config.fireEnabled) {
    return drawPhaseStartEvent(state, replenish)
  }
  // このフェーズのタスクカードを炎上デッキに混ぜてシャッフル
  const phaseTaskIds = state.content.tasks
    .filter((t) => t.phase === state.phase)
    .slice(0, state.config.tasksPerPhase)
    .map((t) => t.id)
    .filter((id) => !state.decks.fires.drawPile.includes(id) && !state.decks.fires.discardPile.includes(id))
  const [drawPile, rng] = shuffle(state.rng, [...state.decks.fires.drawPile, ...phaseTaskIds])
  let next: GameState = {
    ...state,
    rng,
    decks: { ...state.decks, fires: { ...state.decks.fires, drawPile } },
    remainingFireDraws: state.config.firePerPhase,
    phaseStartReplenish: replenish,
    fireLog: [],
  }
  next = continueFireDraws(next)
  return next
}

/** SELECT_EPIDEMIC_TARGET — PM が大炎上のターゲットを選ぶ */
export function handleSelectEpidemicTarget(
  state: GameState,
  action: Extract<GameAction, { type: 'SELECT_EPIDEMIC_TARGET' }>,
): GameState | RuleViolation {
  if (state.pendingEpidemicCount === 0) {
    return violation('NO_PENDING_EPIDEMIC', '大炎上のターゲット選択待ちはありません。')
  }
  const player = getPlayer(state, action.playerId)
  if (!player) {
    return violation('PLAYER_NOT_FOUND', `プレイヤーが見つかりません: ${action.playerId}`)
  }
  if (player.role !== 'pm') {
    return violation('NOT_PM', '大炎上のターゲットを選べるのは PM だけです。')
  }
  const instance = state.taskArea.find((t) => t.tileId === action.taskTileId)
  if (!instance || instance.resolved) {
    return violation('TASK_NOT_FOUND', '未解決のタスクをターゲットに選んでください。')
  }
  const tile = getTile(state.content, action.taskTileId)!
  let next: GameState = {
    ...state,
    pendingEpidemicCount: state.pendingEpidemicCount - 1,
    fireLog: [...state.fireLog, `🌋 大炎上のターゲット:「${tile.name}」`],
  }
  next = addFire(next, action.taskTileId, new Set())
  if (next.result !== null) return next
  next = addFire(next, action.taskTileId, new Set())
  if (next.result !== null) return next
  // 残りの炎上ドローを続行
  return continueFireDraws(next)
}

/** EXTINGUISH_FIRE — 消火(プランニング中) */
export function handleExtinguishFire(
  state: GameState,
  action: Extract<GameAction, { type: 'EXTINGUISH_FIRE' }>,
): GameState | RuleViolation {
  if (state.step !== 'planning') {
    return violation('INVALID_STEP', '消火はプランニングステップ中のみ可能です。')
  }
  if (firePhaseActive(state)) {
    return violation('FIRE_PHASE_ACTIVE', '炎上フェーズの処理が終わるまで待ってください。')
  }
  if (state.pendingEvent !== null) {
    return violation('PENDING_EVENT', '先にイベントを解決してください。')
  }
  const player = getPlayer(state, action.playerId)
  if (!player) {
    return violation('PLAYER_NOT_FOUND', `プレイヤーが見つかりません: ${action.playerId}`)
  }
  if (state.readyPlayerIds.includes(player.id)) {
    return violation('ALREADY_READY', '準備完了を宣言したプレイヤーは行動できません。')
  }
  if (player.tokens < state.config.extinguishCost) {
    return violation('NOT_ENOUGH_TOKENS', '行動トークンが足りません。')
  }
  const instance = state.taskArea.find((t) => t.tileId === action.taskTileId)
  if (!instance) {
    return violation('TASK_NOT_FOUND', `タスクがタスクエリアにありません: ${action.taskTileId}`)
  }
  if (instance.fire < 1) {
    return violation('NO_FIRE', 'このタスクに🔥はありません。')
  }
  let next = updatePlayer(state, player.id, (p) => ({
    ...p,
    tokens: p.tokens - state.config.extinguishCost,
    extinguishCount: p.extinguishCount + 1,
  }))
  next = {
    ...next,
    taskArea: next.taskArea.map((t) =>
      t.tileId === action.taskTileId
        ? {
            ...t,
            fire: t.fire - 1,
            extinguisherIds: t.extinguisherIds.includes(player.id)
              ? t.extinguisherIds
              : [...t.extinguisherIds, player.id],
          }
        : t,
    ),
  }
  return next
}

/** 炎上デッキの初期構成(第1フェーズのタスク + 大炎上カード) */
export function buildFireDeckCardIds(state: GameState): string[] {
  return Array.from({ length: state.config.epidemicCount }, (_, i) => `${EPIDEMIC_PREFIX}${i + 1}`)
}
