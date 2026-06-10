/**
 * 実行ステップ(RULES.md §2-3)
 * 配置されたタスクを1つずつ全員で解決する。
 * - 依存関係(親→子)を強制。処理順は PM が DECLARE_TASK_ORDER で宣言する
 * - 各タスクは8手順(トークン確認→条件→要件カード→コスト→成果物→疲労→イベント→特殊効果)で解決
 */
import type { GameAction } from '../types/actions'
import type { GameState, TaskInstance, TaskResolutionEntry } from '../types/state'
import type { RequirementCard, SkillRequirement, TaskTile } from '../types/content'
import type { RuleViolation } from '../types/violation'
import { violation } from '../types/violation'
import { drawCard, discard } from '../deck'
import {
  addFatigue,
  changeBudget,
  getPlayer,
  getRequirementCard,
  getTile,
  maybeStartLimitEvent,
} from '../helpers'
import { processPhaseEnd } from './phaseEnd'

/** タスクエリアの未解決タスク一覧 */
function unresolvedTasks(state: GameState): TaskInstance[] {
  return state.taskArea.filter((t) => !t.resolved)
}

/** DECLARE_TASK_ORDER — PM がタスク処理順を宣言する */
export function handleDeclareTaskOrder(
  state: GameState,
  action: Extract<GameAction, { type: 'DECLARE_TASK_ORDER' }>,
): GameState | RuleViolation {
  if (state.step !== 'execution') {
    return violation('INVALID_STEP', '実行ステップ以外ではタスク処理順を宣言できません。')
  }
  if (state.pendingEvent !== null) {
    return violation('PENDING_EVENT', '先にイベントを解決してください。')
  }
  const player = getPlayer(state, action.playerId)
  if (!player) {
    return violation('PLAYER_NOT_FOUND', `プレイヤーが見つかりません: ${action.playerId}`)
  }
  if (player.role !== 'pm') {
    return violation('NOT_PM', 'タスク処理順を宣言できるのは PM だけです。')
  }
  if (state.resolutionQueue !== null) {
    return violation('INVALID_STEP', 'タスク処理順はすでに宣言されています。')
  }

  // 宣言順は「未解決タスク全部の順列」であること
  const unresolved = unresolvedTasks(state).map((t) => t.tileId)
  if (
    action.order.length !== unresolved.length ||
    new Set(action.order).size !== action.order.length ||
    !action.order.every((id) => unresolved.includes(id))
  ) {
    return violation(
      'INVALID_TASK_ORDER',
      '処理順は未解決タスクすべてを1回ずつ含む必要があります。',
    )
  }

  // 依存順(親→子)の強制:未解決の親は子より先に並ぶこと
  const position = new Map(action.order.map((id, i) => [id, i]))
  for (const tileId of action.order) {
    const tile = getTile(state.content, tileId)!
    for (const dep of tile.dependsOn) {
      const depInstance = state.taskArea.find((t) => t.tileId === dep)
      if (depInstance && !depInstance.resolved) {
        if ((position.get(dep) ?? -1) > position.get(tileId)!) {
          return violation(
            'INVALID_TASK_ORDER',
            `依存順違反:「${getTile(state.content, dep)!.name}」は「${tile.name}」より先に処理する必要があります。`,
          )
        }
      }
    }
  }

  const next: GameState = { ...state, resolutionQueue: [...action.order] }
  return maybeFinishExecution(next)
}

/** 参加プレイヤー(トークンを1個以上置いているプレイヤー)のID */
function participantIds(instance: TaskInstance): string[] {
  return Object.entries(instance.tokens)
    .filter(([, count]) => count > 0)
    .map(([playerId]) => playerId)
}

/** スキル条件:参加プレイヤーの誰かが系統×レベルを満たしているか */
function meetsSkill(state: GameState, ids: string[], req: SkillRequirement): boolean {
  return ids.some((id) => {
    const player = getPlayer(state, id)
    return player !== undefined && player.skills[req.skill] >= req.level
  })
}

/** 解決失敗をログに積んで返す */
function failTask(
  state: GameState,
  tile: TaskTile,
  failReason: string,
  message: string,
): GameState {
  const entry: TaskResolutionEntry = { tileId: tile.id, resolved: false, failReason, message }
  return maybeFinishExecution({ ...state, resolutionLog: [...state.resolutionLog, entry] })
}

/**
 * タスク解決の本体(RULES.md §2-3 の8手順)。
 * 秘匿要件が未選択の場合は pendingRequirementChoice をセットして中断する。
 */
function resolveTask(state: GameState, tileId: string): GameState | RuleViolation {
  const tile = getTile(state.content, tileId)
  const instance = state.taskArea.find((t) => t.tileId === tileId)
  if (!tile || !instance) {
    return violation('TASK_NOT_FOUND', `タスクが見つかりません: ${tileId}`)
  }

  const ids = participantIds(instance)

  // ── 1. 必要トークン数の確認(不足ならこのフェーズは未解決のまま) ──
  const totalTokens = Object.values(instance.tokens).reduce((a, b) => a + b, 0)
  if (totalTokens < tile.requiredTokens) {
    return failTask(
      state,
      tile,
      'NOT_ENOUGH_TOKENS',
      `「${tile.name}」はトークン不足(${totalTokens}/${tile.requiredTokens})のため未解決のまま残りました。`,
    )
  }

  // ── 依存チェック:未解決の親が残っていたら解決できない ──
  for (const dep of tile.dependsOn) {
    const depInstance = state.taskArea.find((t) => t.tileId === dep)
    if (depInstance && !depInstance.resolved) {
      return failTask(
        state,
        tile,
        'DEPENDENCY_UNRESOLVED',
        `「${tile.name}」は親タスク「${getTile(state.content, dep)!.name}」が未解決のため実行できません。`,
      )
    }
  }

  // ── 協業フラグ(暫定:複数プレイヤーのトークンが必須) ──
  if (tile.collaboration && ids.length < 2) {
    return failTask(
      state,
      tile,
      'COLLABORATION_REQUIRED',
      `「${tile.name}」は協業タスクのため、2人以上のトークンが必要です。`,
    )
  }

  // ── 2. 実行条件チェック(必要スキル・レベル) ──
  if (tile.skillRequirement && !meetsSkill(state, ids, tile.skillRequirement)) {
    return failTask(
      state,
      tile,
      'SKILL_NOT_MET',
      `「${tile.name}」のスキル条件(${tile.skillRequirement.skill} Lv${tile.skillRequirement.level})を満たす参加者がいません。`,
    )
  }

  // ── 3. 秘匿要件:要件カードを2枚引き、1枚選んで適用 ──
  let requirement: RequirementCard | null = null
  if (tile.hiddenRequirement) {
    if (instance.appliedRequirementId === null) {
      // まだ選ばれていない → 2枚引いて選択待ちにする(このタスクはキュー先頭に戻す)
      const draw1 = drawCard(state.decks.requirements, state.rng)
      const draw2 = drawCard(draw1.deck, draw1.rng)
      if (draw1.cardId === null || draw2.cardId === null) {
        return violation('NO_PENDING_REQUIREMENT', '要件カードデッキが尽きています。')
      }
      return {
        ...state,
        decks: { ...state.decks, requirements: draw2.deck },
        rng: draw2.rng,
        resolutionQueue: [tileId, ...(state.resolutionQueue ?? [])],
        pendingRequirementChoice: {
          taskTileId: tileId,
          optionIds: [draw1.cardId, draw2.cardId],
        },
      }
    }
    requirement = getRequirementCard(state, instance.appliedRequirementId) ?? null
  }

  // 要件カードの追加スキル条件
  if (requirement?.effect.type === 'EXTRA_SKILL' && !meetsSkill(state, ids, requirement.effect.requirement)) {
    return failTask(
      state,
      tile,
      'SKILL_NOT_MET',
      `要件カード「${requirement.name}」の追加スキル条件(${requirement.effect.requirement.skill} Lv${requirement.effect.requirement.level})を満たす参加者がいません。`,
    )
  }

  // ── 4. 実行コスト(予算)を支払う ──
  const extraCost = requirement?.effect.type === 'EXTRA_COST' ? requirement.effect.amount : 0
  const discountByCard = requirement?.effect.type === 'COST_DISCOUNT' ? requirement.effect.amount : 0
  const cost = Math.max(0, tile.cost + extraCost - discountByCard + state.nextTaskCostModifier)
  if (state.budget < cost) {
    return failTask(
      state,
      tile,
      'BUDGET_SHORT',
      `「${tile.name}」の実行コスト(${cost})に対して予算が不足しています。追加請求を検討してください。`,
    )
  }
  let next = changeBudget(state, -cost)
  next = { ...next, nextTaskCostModifier: 0 } // コスト修正は次に解決した1タスクで消費

  // ── 5. 成果物トークンを獲得 ──
  const levels = [...tile.deliverables]
  if (requirement?.effect.type === 'BONUS_DELIVERABLE') {
    levels.push(requirement.effect.level)
  }
  next = {
    ...next,
    deliverables: [
      ...next.deliverables,
      ...levels.map((level) => ({
        level,
        acquiredPhase: next.phase,
        sourceTileId: tile.id,
        participants: ids,
      })),
    ],
  }

  // ── 6. 参加プレイヤーに実行時疲労を加算 ──
  const extraFatigue = requirement?.effect.type === 'EXTRA_FATIGUE' ? requirement.effect.amount : 0
  for (const id of ids) {
    next = addFatigue(next, id, tile.fatigue + extraFatigue)
  }

  // ── 解決済みにする(トークンは盤上に残し、フェーズ終了時に回収) ──
  next = {
    ...next,
    taskArea: next.taskArea.map((t) =>
      t.tileId === tileId ? { ...t, resolved: true, resolvedPhase: next.phase } : t,
    ),
    resolutionLog: [
      ...next.resolutionLog,
      {
        tileId: tile.id,
        resolved: true,
        failReason: null,
        message: `「${tile.name}」を解決しました。`,
      },
    ],
  }

  // ── 8. 特殊効果(例:次タスクコスト減)。イベントより先に確定させる ──
  if (tile.specialEffect?.type === 'NEXT_TASK_COST_DOWN') {
    next = { ...next, nextTaskCostModifier: next.nextTaskCostModifier - tile.specialEffect.amount }
  }

  // ── 7. イベントマークがあればイベントカードを引く(解決は RESOLVE_EVENT) ──
  if (tile.eventMark) {
    const { cardId, deck, rng } = drawCard(next.decks.events, next.rng)
    if (cardId !== null) {
      next = {
        ...next,
        decks: { ...next.decks, events: deck },
        rng,
        pendingEvent: { kind: 'task', cardId, targetPlayerId: null },
      }
    }
  }

  // 疲労 Lv3 到達者がいれば限界イベントを開始(タスクイベントが先に解決される)
  next = maybeStartLimitEvent(next)
  return maybeFinishExecution(next)
}

/** RESOLVE_NEXT_TASK — 宣言順の次のタスクを解決する */
export function handleResolveNextTask(state: GameState): GameState | RuleViolation {
  if (state.step !== 'execution') {
    return violation('INVALID_STEP', '実行ステップ以外ではタスクを解決できません。')
  }
  if (state.pendingEvent !== null) {
    return violation('PENDING_EVENT', '先にイベントを解決してください。')
  }
  if (state.pendingRequirementChoice !== null) {
    return violation('PENDING_REQUIREMENT', '先に要件カードを選択してください。')
  }
  if (state.resolutionQueue === null) {
    return violation('ORDER_NOT_DECLARED', '先に PM がタスク処理順を宣言してください。')
  }
  const [tileId, ...rest] = state.resolutionQueue
  if (tileId === undefined) {
    return violation('NO_MORE_TASKS', '解決すべきタスクは残っていません。')
  }
  return resolveTask({ ...state, resolutionQueue: rest }, tileId)
}

/** SELECT_REQUIREMENT_CARD — 提示された2枚から1枚選んで適用し、タスク解決を続行する */
export function handleSelectRequirementCard(
  state: GameState,
  action: Extract<GameAction, { type: 'SELECT_REQUIREMENT_CARD' }>,
): GameState | RuleViolation {
  const choice = state.pendingRequirementChoice
  if (choice === null) {
    return violation('NO_PENDING_REQUIREMENT', '要件カードの選択待ちはありません。')
  }
  const chosenId = choice.optionIds[action.choiceIndex]
  const otherId = choice.optionIds[action.choiceIndex === 0 ? 1 : 0]

  // 選ばれなかったカードは捨て札へ。選ばれたカードはタスクに付く
  let next: GameState = {
    ...state,
    pendingRequirementChoice: null,
    decks: { ...state.decks, requirements: discard(state.decks.requirements, otherId) },
    taskArea: state.taskArea.map((t) =>
      t.tileId === choice.taskTileId ? { ...t, appliedRequirementId: chosenId } : t,
    ),
  }

  // 中断していたタスク解決を続行(キュー先頭に戻してある)
  const [tileId, ...rest] = next.resolutionQueue ?? []
  if (tileId !== choice.taskTileId) {
    return violation('NO_PENDING_REQUIREMENT', '内部状態が不正です(選択待ちタスクの不一致)。')
  }
  next = { ...next, resolutionQueue: rest }
  return resolveTask(next, tileId)
}

/**
 * 実行ステップの完了判定:キューが空で、解決待ち(イベント/要件/限界)が何もなければ
 * フェーズ終了処理(RULES.md §2-4)へ進む。
 */
export function maybeFinishExecution(state: GameState): GameState {
  if (state.step !== 'execution' || state.result !== null) return state
  if (state.resolutionQueue === null || state.resolutionQueue.length > 0) return state
  if (
    state.pendingEvent !== null ||
    state.pendingRequirementChoice !== null ||
    state.pendingLimitPlayerIds.length > 0
  ) {
    return state
  }
  return processPhaseEnd(state)
}
