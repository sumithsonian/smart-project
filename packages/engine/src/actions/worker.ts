/**
 * 週次ワーカーコミット(v3.0。rules-v3-proposal.md §1・§2)
 * - フェーズ = roundsPerPhase 週。各週:週初トラブル(炎上+イベント)→ 朝会(配属)→ 週末解決
 * - 配置の単位は「プレイヤー本人」。主担当1 + 任意の残業(即時ではなく週末に疲労)
 * - 配属は宣言のみで効果は週末(全員Ready)に一括適用。朝会中は自由に組み替えられる
 */
import type { GameAction, WorkerTarget } from '../types/actions'
import type { GameState, WeekAssignment } from '../types/state'
import type { RuleViolation } from '../types/violation'
import { violation } from '../types/violation'
import {
  addFatigue,
  getPlayer,
  getTile,
  maybeStartLimitEvent,
  seatOccupants,
  supportCount,
} from '../helpers'
import { drawCard } from '../deck'
import { firePhaseActive, continueFireDraws } from './fire'
import { maybeFinishExecution } from './execution'

/** 朝会(配属操作)の共通ガード */
function guardStandup(state: GameState, playerId: string): RuleViolation | null {
  if (!state.config.workerCommitEnabled) {
    return violation('WORKER_MODE', 'ワーカーモードが無効です(workerCommitEnabled が false)。')
  }
  if (state.step !== 'planning') {
    return violation('INVALID_STEP', '朝会(プランニング)以外では配属できません。')
  }
  if (firePhaseActive(state)) {
    return violation('FIRE_PHASE_ACTIVE', '週初のトラブル処理が終わるまで待ってください。')
  }
  if (state.pendingEvent !== null) {
    return violation('PENDING_EVENT', '先にイベントを解決してください。')
  }
  if (!getPlayer(state, playerId)) {
    return violation('PLAYER_NOT_FOUND', `プレイヤーが見つかりません: ${playerId}`)
  }
  if (state.readyPlayerIds.includes(playerId)) {
    return violation('ALREADY_READY', '準備完了を宣言したプレイヤーは配属を変えられません。')
  }
  return null
}

/** プレイヤーの今週の配属を引く */
function assignmentOf(
  state: GameState,
  playerId: string,
  overtime: boolean,
): WeekAssignment | undefined {
  return state.assignments.find((a) => a.playerId === playerId && a.overtime === overtime)
}

/** タスクへの消火宣言数 */
function extinguishPledges(state: GameState, taskTileId: string): number {
  return state.assignments.filter(
    (a) => a.target.kind === 'extinguish' && a.target.taskTileId === taskTileId,
  ).length
}

/** 配属先の検証(タスク系ターゲットの存在・空き) */
function validateTarget(state: GameState, target: WorkerTarget): RuleViolation | null {
  if (target.kind === 'rest' || target.kind === 'learning') return null
  const instance = state.taskArea.find((t) => t.tileId === target.taskTileId)
  if (!instance) {
    return violation('TASK_NOT_FOUND', `タスクがタスクエリアにありません: ${target.taskTileId}`)
  }
  if (instance.resolved) {
    return violation('TASK_ALREADY_RESOLVED', 'このタスクはすでに解決済みです。')
  }
  if (target.kind === 'seat') {
    const tile = getTile(state.content, target.taskTileId)!
    if (target.seatIndex < 0 || target.seatIndex >= tile.seats.length) {
      return violation('SEAT_UNAVAILABLE', `席が存在しません(index: ${target.seatIndex})。`)
    }
    if (seatOccupants(state, target.taskTileId).has(target.seatIndex)) {
      return violation('SEAT_UNAVAILABLE', 'その席にはすでに誰かが立っています。')
    }
  }
  if (target.kind === 'support') {
    if (supportCount(state, target.taskTileId) >= instance.fire) {
      return violation('NO_SUPPORT_DEMAND', '応援の需要(🔥)を超えています。')
    }
  }
  if (target.kind === 'extinguish') {
    if (extinguishPledges(state, target.taskTileId) >= instance.fire) {
      return violation('NO_FIRE', '消火できる🔥が残っていません。')
    }
  }
  return null
}

/** ASSIGN_WORKER — 今週の配属を宣言する */
export function handleAssignWorker(
  state: GameState,
  action: Extract<GameAction, { type: 'ASSIGN_WORKER' }>,
): GameState | RuleViolation {
  const guard = guardStandup(state, action.playerId)
  if (guard) return guard
  const player = getPlayer(state, action.playerId)!
  const overtime = action.overtime ?? false

  if (assignmentOf(state, player.id, overtime)) {
    return violation(
      'ALREADY_ASSIGNED',
      overtime ? '残業枠はすでに配属済みです。' : '主担当はすでに配属済みです。先に取り消してください。',
    )
  }
  if (overtime) {
    if (!assignmentOf(state, player.id, false)) {
      return violation('OVERTIME_FORBIDDEN', '残業は主担当を決めてからです。')
    }
    const overtimeCount = state.assignments.filter(
      (a) => a.playerId === player.id && a.overtime,
    ).length
    if (overtimeCount >= state.config.overtimeMaxPerWeek) {
      return violation('OVERTIME_FORBIDDEN', `残業は週${state.config.overtimeMaxPerWeek}枠までです。`)
    }
    if (player.fatigue >= state.config.noOvertimeAtFatigueLv) {
      return violation('OVERTIME_FORBIDDEN', `疲労Lv${player.fatigue}では残業できません。`)
    }
    if (player.overtimeBanPhase === state.phase) {
      return violation('OVERTIME_FORBIDDEN', '体調不良のため、このフェーズは残業できません。')
    }
    // 残業で休憩・学習は選べない(残業=現場仕事)
    if (action.target.kind === 'rest' || action.target.kind === 'learning') {
      return violation('OVERTIME_FORBIDDEN', '残業枠で休憩・学習はできません。')
    }
  }
  const invalid = validateTarget(state, action.target)
  if (invalid) return invalid
  // 1人=1体:同じタスクの席/応援に同一人物が重複して立つことはできない
  // (2席タスク=協業(異なる2人)の担保。主担当+残業での「自己協業」を防ぐ)
  if (action.target.kind === 'seat' || action.target.kind === 'support') {
    const tileId = action.target.taskTileId
    const alreadyOnTask = state.assignments.some(
      (a) =>
        a.playerId === player.id &&
        (a.target.kind === 'seat' || a.target.kind === 'support') &&
        a.target.taskTileId === tileId,
    )
    if (alreadyOnTask) {
      return violation('ALREADY_ASSIGNED', '同じタスクに2枠で立つことはできません(1人=1体)。')
    }
  }
  if (action.target.kind === 'learning' && player.skills[action.target.skill] >= state.config.skillMax) {
    return violation('SKILL_MAX', `${action.target.skill} はすでに上限レベルです。`)
  }

  const isTaskWork = action.target.kind === 'seat' || action.target.kind === 'support'
  let next: GameState = {
    ...state,
    assignments: [
      ...state.assignments,
      { playerId: player.id, target: action.target, overtime },
    ],
  }
  if (isTaskWork) {
    next = {
      ...next,
      players: next.players.map((p) =>
        p.id === player.id ? { ...p, tokensPlacedThisPhase: p.tokensPlacedThisPhase + 1 } : p,
      ),
    }
  }
  return next
}

/** UNASSIGN_WORKER — 今週の配属を取り消す(主担当を消すには先に残業を消す) */
export function handleUnassignWorker(
  state: GameState,
  action: Extract<GameAction, { type: 'UNASSIGN_WORKER' }>,
): GameState | RuleViolation {
  const guard = guardStandup(state, action.playerId)
  if (guard) return guard
  const overtime = action.overtime ?? false
  const assignment = assignmentOf(state, action.playerId, overtime)
  if (!assignment) {
    return violation('NO_ASSIGNMENT', '取り消せる配属がありません。')
  }
  if (!overtime && assignmentOf(state, action.playerId, true)) {
    return violation('OVERTIME_FORBIDDEN', '先に残業枠を取り消してください。')
  }
  const wasTaskWork = assignment.target.kind === 'seat' || assignment.target.kind === 'support'
  let next: GameState = {
    ...state,
    assignments: state.assignments.filter((a) => a !== assignment),
  }
  if (wasTaskWork) {
    next = {
      ...next,
      players: next.players.map((p) =>
        p.id === action.playerId
          ? { ...p, tokensPlacedThisPhase: Math.max(0, p.tokensPlacedThisPhase - 1) }
          : p,
      ),
    }
  }
  return next
}

/**
 * 週末処理(全員Ready時に呼ばれる):
 * 配属の効果を一括適用(残業疲労 → 休憩 → 学習 → 消火)し、解決キューを組んで実行ステップへ。
 * タスク解決そのものは execution.ts(RESOLVE_NEXT_TASK)が担う。
 */
export function startWeekend(state: GameState): GameState {
  let next = state

  // 1. 残業疲労
  for (const a of next.assignments) {
    if (a.overtime) {
      next = addFatigue(next, a.playerId, next.config.overtimeFatigue)
    }
  }
  // 2. 休憩
  for (const a of next.assignments) {
    if (a.target.kind === 'rest') {
      next = {
        ...next,
        players: next.players.map((p) =>
          p.id === a.playerId
            ? { ...p, fatigue: Math.max(0, p.fatigue - next.config.restRecovery) }
            : p,
        ),
      }
    }
  }
  // 3. 学習(週数を積む。Lv反映はフェーズ終了時)
  for (const a of next.assignments) {
    if (a.target.kind === 'learning') {
      const skill = a.target.skill
      next = {
        ...next,
        players: next.players.map((p) =>
          p.id === a.playerId
            ? { ...p, learningProgress: { ...p.learningProgress, [skill]: p.learningProgress[skill] + 1 } }
            : p,
        ),
      }
    }
  }
  // 4. 消火(タスク解決より先に処理する=消してから解決できる)
  for (const a of next.assignments) {
    if (a.target.kind === 'extinguish') {
      const tileId = a.target.taskTileId
      const instance = next.taskArea.find((t) => t.tileId === tileId)
      if (instance && instance.fire > 0) {
        next = {
          ...next,
          players: next.players.map((p) =>
            p.id === a.playerId ? { ...p, extinguishCount: p.extinguishCount + 1 } : p,
          ),
          taskArea: next.taskArea.map((t) =>
            t.tileId === tileId
              ? {
                  ...t,
                  fire: t.fire - 1,
                  extinguisherIds: t.extinguisherIds.includes(a.playerId)
                    ? t.extinguisherIds
                    : [...t.extinguisherIds, a.playerId],
                }
              : t,
          ),
        }
      }
    }
  }

  // 解決キュー:未解決タスク全部をコンテンツ定義順(親→子に並んでいる)で積む。
  // 席が埋まっていないタスクは resolveTask 側で「未解決のまま」ログされる
  const order = next.content.tasks
    .filter((tile) => next.taskArea.some((t) => t.tileId === tile.id && !t.resolved))
    .map((tile) => tile.id)
  next = { ...next, step: 'execution', resolutionQueue: order }

  // 残業疲労で Lv3 到達者がいれば限界イベントを先に解決する
  next = maybeStartLimitEvent(next)
  return maybeFinishExecution(next)
}

/**
 * 次の週を開始する(週末処理の完了後。maybeFinishExecution から呼ばれる):
 * 週カウンタを進め、配属をクリアし、週初トラブル(炎上 firePerRound 枚 → イベント1枚)を引く。
 */
export function startNextWeek(state: GameState): GameState {
  let next: GameState = {
    ...state,
    week: state.week + 1,
    step: 'planning',
    readyPlayerIds: [],
    resolutionQueue: null,
    assignments: [],
    fireLog: [],
  }
  if (next.config.fireEnabled) {
    next = {
      ...next,
      remainingFireDraws: next.config.firePerRound,
      phaseStartReplenish: false, // ワーカーモードにトークン補充はない
    }
    return continueFireDraws(next)
  }
  // 炎上無効時は週初イベントのみ
  return drawWeeklyEvent(next)
}

/** 週初イベントを1枚引く(炎上無効時の startNextWeek 用) */
function drawWeeklyEvent(state: GameState): GameState {
  const { cardId, deck, rng } = drawCard(state.decks.events, state.rng)
  if (cardId === null) return state
  return {
    ...state,
    decks: { ...state.decks, events: deck },
    rng,
    pendingEvent: { kind: 'phase_start', cardId, targetPlayerId: null },
    replenishAfterEvent: false,
  }
}
