/**
 * プランニングステップ(RULES.md §2-2)
 * 手番なし・全員同時。トークン配置(応援の積み上げ可)、休憩、追加請求、学習、Ready 宣言。
 *
 * タイミングの暫定実装(RULES.md に明記がない点):
 * - 休憩・追加請求・学習の効果は配置時に即時適用する(配置済みトークンは回収不可)
 * - タスクへの配置トークンのみ RETRIEVE_TOKEN で回収できる
 * - 学習タイルは容量制限なし(learningTiles はステージ1では枚数表示のみ)
 */
import type { GameAction, TokenTarget } from '../types/actions'
import type { GameState, PlayerState } from '../types/state'
import type { RuleViolation } from '../types/violation'
import { violation } from '../types/violation'
import { applyWeight, changeBudget, changeCs, getClient, getPlayer, updatePlayer } from '../helpers'

/** プランニング中の共通ガード */
function guardPlanning(state: GameState, playerId: string): RuleViolation | PlayerState {
  if (state.step !== 'planning') {
    return violation('INVALID_STEP', 'プランニングステップ以外ではこの操作はできません。')
  }
  if (state.pendingEvent !== null) {
    return violation('PENDING_EVENT', '先にイベントを解決してください。')
  }
  const player = getPlayer(state, playerId)
  if (!player) {
    return violation('PLAYER_NOT_FOUND', `プレイヤーが見つかりません: ${playerId}`)
  }
  if (state.readyPlayerIds.includes(playerId)) {
    return violation('ALREADY_READY', '準備完了を宣言したプレイヤーは行動できません。')
  }
  return player
}

function isViolation(v: RuleViolation | PlayerState): v is RuleViolation {
  return (v as RuleViolation).type === 'RULE_VIOLATION'
}

/** PLACE_TOKEN — 行動トークンを1個配置(タスク or 学習タイル) */
export function handlePlaceToken(
  state: GameState,
  action: Extract<GameAction, { type: 'PLACE_TOKEN' }>,
): GameState | RuleViolation {
  const guard = guardPlanning(state, action.playerId)
  if (isViolation(guard)) return guard
  const player = guard
  if (player.tokens < 1) {
    return violation('NOT_ENOUGH_TOKENS', '行動トークンが足りません。')
  }

  if (action.target.kind === 'task') {
    const tileId = action.target.taskTileId
    const instance = state.taskArea.find((t) => t.tileId === tileId)
    if (!instance) {
      return violation('TASK_NOT_FOUND', `タスクがタスクエリアにありません: ${tileId}`)
    }
    if (instance.resolved) {
      return violation('TASK_ALREADY_RESOLVED', 'このタスクはすでに解決済みです。')
    }
    let next = updatePlayer(state, player.id, (p) => ({ ...p, tokens: p.tokens - 1 }))
    next = {
      ...next,
      taskArea: next.taskArea.map((t) =>
        t.tileId === tileId
          ? { ...t, tokens: { ...t.tokens, [player.id]: (t.tokens[player.id] ?? 0) + 1 } }
          : t,
      ),
    }
    return next
  }

  // ── 学習タイル(RULES.md §5 暫定:現在Lv+1 個のトークンで該当系統 +1Lv) ──
  const skill = action.target.skill
  if (player.skills[skill] >= state.config.skillMax) {
    return violation('SKILL_MAX', `${skill} はすでに上限レベルです。`)
  }
  return updatePlayer(state, player.id, (p) => {
    const progress = p.learningProgress[skill] + 1
    const cost = p.skills[skill] + 1
    if (progress >= cost) {
      // 充足:スキルアップしてタイル上のトークンは消費される
      return {
        ...p,
        tokens: p.tokens - 1,
        skills: { ...p.skills, [skill]: p.skills[skill] + 1 },
        learningProgress: { ...p.learningProgress, [skill]: 0 },
      }
    }
    return {
      ...p,
      tokens: p.tokens - 1,
      learningProgress: { ...p.learningProgress, [skill]: progress },
    }
  })
}

/** RETRIEVE_TOKEN — 自分が配置したトークンを1個回収(タスク上のみ。プランニング中) */
export function handleRetrieveToken(
  state: GameState,
  action: Extract<GameAction, { type: 'RETRIEVE_TOKEN' }>,
): GameState | RuleViolation {
  const guard = guardPlanning(state, action.playerId)
  if (isViolation(guard)) return guard
  const player = guard

  if (action.target.kind === 'learning') {
    const skill = action.target.skill
    if (player.learningProgress[skill] < 1) {
      return violation('NO_TOKEN_TO_RETRIEVE', '学習タイルに自分のトークンがありません。')
    }
    return updatePlayer(state, player.id, (p) => ({
      ...p,
      tokens: p.tokens + 1,
      learningProgress: { ...p.learningProgress, [skill]: p.learningProgress[skill] - 1 },
    }))
  }

  const tileId = action.target.taskTileId
  const instance = state.taskArea.find((t) => t.tileId === tileId)
  if (!instance) {
    return violation('TASK_NOT_FOUND', `タスクがタスクエリアにありません: ${tileId}`)
  }
  if (instance.resolved) {
    return violation('TASK_ALREADY_RESOLVED', '解決済みタスクからは回収できません。')
  }
  if ((instance.tokens[player.id] ?? 0) < 1) {
    return violation('NO_TOKEN_TO_RETRIEVE', 'このタスクに自分のトークンがありません。')
  }
  let next = updatePlayer(state, player.id, (p) => ({ ...p, tokens: p.tokens + 1 }))
  next = {
    ...next,
    taskArea: next.taskArea.map((t) =>
      t.tileId === tileId
        ? { ...t, tokens: { ...t.tokens, [player.id]: t.tokens[player.id]! - 1 } }
        : t,
    ),
  }
  return next
}

/** REST — 休憩スペースに配置(トークン1個で疲労 -restRecovery) */
export function handleRest(
  state: GameState,
  action: Extract<GameAction, { type: 'REST' }>,
): GameState | RuleViolation {
  const guard = guardPlanning(state, action.playerId)
  if (isViolation(guard)) return guard
  const player = guard
  if (player.tokens < 1) {
    return violation('NOT_ENOUGH_TOKENS', '行動トークンが足りません。')
  }
  return updatePlayer(state, player.id, (p) => ({
    ...p,
    tokens: p.tokens - 1,
    fatigue: Math.max(0, p.fatigue - state.config.restRecovery),
  }))
}

/** EXTRA_BILLING — 追加請求(CS と引き換えに予算回復。C 重みが CS コストに掛かる) */
export function handleExtraBilling(
  state: GameState,
  action: Extract<GameAction, { type: 'EXTRA_BILLING' }>,
): GameState | RuleViolation {
  const guard = guardPlanning(state, action.playerId)
  if (isViolation(guard)) return guard
  const player = guard
  if (player.tokens < 1) {
    return violation('NOT_ENOUGH_TOKENS', '行動トークンが足りません。')
  }
  const client = getClient(state)
  const csCost = applyWeight(
    state.config.extraBillingCsCost,
    client.weights.c,
    state.config.qcdWeightMode,
  )
  let next = updatePlayer(state, player.id, (p) => ({ ...p, tokens: p.tokens - 1 }))
  next = changeBudget(next, state.config.extraBillingBudget)
  next = changeCs(next, -csCost)
  return next
}

/** DECLARE_READY — 準備完了宣言。全員揃ったら実行ステップへ */
export function handleDeclareReady(
  state: GameState,
  action: Extract<GameAction, { type: 'DECLARE_READY' }>,
): GameState | RuleViolation {
  if (state.step !== 'planning') {
    return violation('INVALID_STEP', 'プランニングステップ以外では Ready 宣言できません。')
  }
  if (state.pendingEvent !== null) {
    return violation('PENDING_EVENT', '先にイベントを解決してください。')
  }
  if (!getPlayer(state, action.playerId)) {
    return violation('PLAYER_NOT_FOUND', `プレイヤーが見つかりません: ${action.playerId}`)
  }
  if (state.readyPlayerIds.includes(action.playerId)) {
    return violation('ALREADY_READY', 'すでに準備完了を宣言しています。')
  }
  const readyPlayerIds = [...state.readyPlayerIds, action.playerId]
  const allReady = readyPlayerIds.length === state.players.length
  return {
    ...state,
    readyPlayerIds,
    step: allReady ? 'execution' : 'planning',
  }
}

/** TokenTarget の表示用(エラーメッセージ等) */
export function describeTarget(target: TokenTarget): string {
  return target.kind === 'task' ? `タスク ${target.taskTileId}` : `学習タイル(${target.skill})`
}
