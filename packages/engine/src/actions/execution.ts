/**
 * 実行ステップ(RULES.md §2-3)
 * 配置されたタスクを1つずつ全員で解決する。
 * - 依存関係(親→子)を強制。処理順は PM が DECLARE_TASK_ORDER で宣言する
 * - 各タスクは8手順(トークン確認→条件→要件カード→コスト→成果物→疲労→イベント→特殊効果)で解決
 */
import type { GameAction } from '../types/actions'
import type { GameState, TaskInstance, TaskResolutionEntry } from '../types/state'
import type { DeliverableLevel, RequirementCard, SkillRequirement, TaskTile } from '../types/content'
import type { RuleViolation } from '../types/violation'
import { violation } from '../types/violation'
import { drawCard, discard } from '../deck'
import {
  addFatigue,
  applyWeight,
  changeBudget,
  changeCs,
  getClient,
  getPlayer,
  getRequirementCard,
  getTile,
  maybeStartLimitEvent,
  seatOccupants,
  supportCount,
  taskWorkerIds,
} from '../helpers'
import { processPhaseEnd } from './phaseEnd'
import { startNextWeek } from './worker'

/** タスクエリアの未解決タスク一覧 */
function unresolvedTasks(state: GameState): TaskInstance[] {
  return state.taskArea.filter((t) => !t.resolved)
}

/** DECLARE_TASK_ORDER — PM がタスク処理順を宣言する */
export function handleDeclareTaskOrder(
  state: GameState,
  action: Extract<GameAction, { type: 'DECLARE_TASK_ORDER' }>,
): GameState | RuleViolation {
  if (state.config.workerCommitEnabled) {
    return violation('WORKER_MODE', 'ワーカーモードでは処理順は自動(定義順=親→子)です。')
  }
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

  const workerMode = state.config.workerCommitEnabled
  const ids = workerMode ? taskWorkerIds(state, tileId) : participantIds(instance)

  if (workerMode) {
    // ── 1'. 席の充足確認(v3.0):全席に人が立ち、🔥ぶんの応援がいること ──
    const occupants = seatOccupants(state, tileId)
    // 外注は専門席1つを埋める(未充足の専門席のうち先頭)
    let contractorSeat = -1
    if (instance.outsourced) {
      contractorSeat = tile.seats.findIndex((s, i) => s.skill !== null && !occupants.has(i))
    }
    const emptySeats = tile.seats.filter((_, i) => !occupants.has(i) && i !== contractorSeat)
    if (emptySeats.length > 0) {
      return failTask(
        state,
        tile,
        'SEAT_NOT_FILLED',
        `「${tile.name}」は席が埋まっていない(空席${emptySeats.length})ため未解決のまま残りました。`,
      )
    }
    if (supportCount(state, tileId) < instance.fire) {
      return failTask(
        state,
        tile,
        'NOT_ENOUGH_SUPPORT',
        `「${tile.name}」は🔥${instance.fire}個ぶんの応援が足りないため未解決のまま残りました。`,
      )
    }
  } else {
    // ── 1. 必要トークン数の確認(🔥1個につき +1。不足ならこのフェーズは未解決のまま) ──
    const requiredTokens = tile.requiredTokens + instance.fire
    const totalTokens = Object.values(instance.tokens).reduce((a, b) => a + b, 0)
    if (totalTokens < requiredTokens) {
      return failTask(
        state,
        tile,
        'NOT_ENOUGH_TOKENS',
        `「${tile.name}」はトークン不足(${totalTokens}/${requiredTokens}${instance.fire > 0 ? `、🔥+${instance.fire}` : ''})のため未解決のまま残りました。`,
      )
    }
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

  // ── 協業フラグ(暫定:複数プレイヤーのトークンが必須。ワーカーモードでは席に吸収済み) ──
  if (!workerMode && tile.collaboration && ids.length < 2) {
    return failTask(
      state,
      tile,
      'COLLABORATION_REQUIRED',
      `「${tile.name}」は協業タスクのため、2人以上のトークンが必要です。`,
    )
  }

  // ── 2. 実行条件チェック(必要スキル・レベル) ──
  // 配属トリアージ(v2.2):未達でも mismatchEnabled なら「やっつけ」で代償付き解決。
  // 外注済み(instance.outsourced)は専門席が充足されたものとして扱う。
  let understaffed = false
  if (workerMode) {
    // v3.0:専門席ごとに、立っている本人が系統×Lvを満たすか確認する(外注席は免除)
    const occupants = seatOccupants(state, tileId)
    for (let i = 0; i < tile.seats.length; i++) {
      const seat = tile.seats[i]!
      if (seat.skill === null) continue
      const occupantId = occupants.get(i)
      if (occupantId === undefined) continue // 外注が埋めた席
      const occupant = getPlayer(state, occupantId)!
      if (occupant.skills[seat.skill] < seat.level) {
        if (!state.config.mismatchEnabled) {
          return failTask(
            state,
            tile,
            'SKILL_NOT_MET',
            `「${tile.name}」の専門席(${seat.skill} Lv${seat.level})に立つ ${occupant.name} のスキルが足りません。`,
          )
        }
        understaffed = true
      }
    }
  } else if (
    tile.skillRequirement &&
    !instance.outsourced &&
    !meetsSkill(state, ids, tile.skillRequirement)
  ) {
    if (!state.config.mismatchEnabled) {
      return failTask(
        state,
        tile,
        'SKILL_NOT_MET',
        `「${tile.name}」のスキル条件(${tile.skillRequirement.skill} Lv${tile.skillRequirement.level})を満たす参加者がいません。`,
      )
    }
    understaffed = true
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

  // 要件カードの追加スキル条件(v2.2:未達でも mismatchEnabled なら やっつけ。外注済みは充足扱い)
  if (
    requirement?.effect.type === 'EXTRA_SKILL' &&
    !instance.outsourced &&
    !meetsSkill(state, ids, requirement.effect.requirement)
  ) {
    if (!state.config.mismatchEnabled) {
      return failTask(
        state,
        tile,
        'SKILL_NOT_MET',
        `要件カード「${requirement.name}」の追加スキル条件(${requirement.effect.requirement.skill} Lv${requirement.effect.requirement.level})を満たす参加者がいません。`,
      )
    }
    understaffed = true
  }

  // ── 4. 実行コスト(予算)を支払う ──
  const extraCost = requirement?.effect.type === 'EXTRA_COST' ? requirement.effect.amount : 0
  const discountByCard = requirement?.effect.type === 'COST_DISCOUNT' ? requirement.effect.amount : 0
  // 過剰スペック割引(v2.2):必要Lvを超える参加者がいれば実行コスト減(やっつけ・外注時は対象外)
  let overqualDiscount = 0
  if (!understaffed && !instance.outsourced && state.config.overqualifiedDiscount > 0) {
    if (workerMode) {
      // v3.0:専門席に必要Lv超のプレイヤーが立っていれば割引
      const occupants = seatOccupants(state, tileId)
      const hasOverqualified = tile.seats.some((seat, i) => {
        if (seat.skill === null) return false
        const occupantId = occupants.get(i)
        if (occupantId === undefined) return false
        return (getPlayer(state, occupantId)?.skills[seat.skill] ?? 0) > seat.level
      })
      if (hasOverqualified) overqualDiscount = state.config.overqualifiedDiscount
    } else if (
      tile.skillRequirement &&
      ids.some(
        (id) => (getPlayer(state, id)?.skills[tile.skillRequirement!.skill] ?? 0) > tile.skillRequirement!.level,
      )
    ) {
      overqualDiscount = state.config.overqualifiedDiscount
    }
  }
  const cost = Math.max(
    0,
    tile.cost + extraCost - discountByCard - overqualDiscount + state.nextTaskCostModifier,
  )
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
  let levels: DeliverableLevel[] = [...tile.deliverables]
  if (requirement?.effect.type === 'BONUS_DELIVERABLE') {
    levels.push(requirement.effect.level)
  }
  // 配属トリアージ(v2.2):やっつけ解決は成果物を1段ダウン(Lv2→Lv1、Lv1→消失)
  if (understaffed && state.config.understaffDowngrade) {
    levels = levels.flatMap((lv) => (lv > 1 ? [(lv - 1) as DeliverableLevel] : []))
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

  // ── 6. 参加プレイヤーに実行時疲労を加算(やっつけは understaffFatigue を上乗せ) ──
  const extraFatigue =
    (requirement?.effect.type === 'EXTRA_FATIGUE' ? requirement.effect.amount : 0) +
    (understaffed ? state.config.understaffFatigue : 0)
  for (const id of ids) {
    next = addFatigue(next, id, tile.fatigue + extraFatigue)
  }

  // ── 解決済みにする(トークンは盤上に残し、フェーズ終了時に回収) ──
  next = {
    ...next,
    taskArea: next.taskArea.map((t) =>
      t.tileId === tileId ? { ...t, resolved: true, resolvedPhase: next.phase } : t,
    ),
    taskParticipants: { ...next.taskParticipants, [tileId]: ids },
    resolutionLog: [
      ...next.resolutionLog,
      {
        tileId: tile.id,
        resolved: true,
        failReason: null,
        message: understaffed
          ? `「${tile.name}」を やっつけ で解決しました(スキル未達:成果物ダウン/疲労+/品質債務)。`
          : instance.outsourced
            ? `「${tile.name}」を外注で解決しました。`
            : `「${tile.name}」を解決しました。`,
      },
    ],
  }

  // 配属トリアージ(v2.2):やっつけ解決の品質債務 CS ペナルティ(クライアントQ重み適用)
  if (understaffed && state.config.understaffCsPenalty > 0) {
    const penalty = applyWeight(
      state.config.understaffCsPenalty,
      getClient(next).weights.q,
      next.config.qcdWeightMode,
    )
    next = changeCs(next, -penalty)
    if (next.result !== null) return next
  }

  // ── EP 付与(RULES.md §11):自分の仕事が他人に使われた ──
  if (next.config.epEnabled) {
    const epGains = new Map<string, number>()
    // 1. 親タスクの参加者(このタスクに不参加)に +1
    for (const dep of tile.dependsOn) {
      for (const parentParticipant of next.taskParticipants[dep] ?? []) {
        if (!ids.includes(parentParticipant)) {
          epGains.set(parentParticipant, (epGains.get(parentParticipant) ?? 0) + 1)
        }
      }
    }
    // 2. このタスクを今フェーズ消火した人(不参加)に +1
    for (const extinguisher of instance.extinguisherIds) {
      if (!ids.includes(extinguisher)) {
        epGains.set(extinguisher, (epGains.get(extinguisher) ?? 0) + 1)
      }
    }
    if (epGains.size > 0) {
      next = {
        ...next,
        players: next.players.map((p) =>
          epGains.has(p.id) ? { ...p, ep: p.ep + epGains.get(p.id)! } : p,
        ),
      }
    }
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
  // v3.0 ワーカーモード:週が残っていれば次の週へ。最終週ならフェーズ終了処理へ
  if (state.config.workerCommitEnabled && state.week < state.config.roundsPerPhase) {
    return startNextWeek(state)
  }
  return processPhaseEnd(state)
}
