/**
 * スコープ会議(rules-v4-core.md §1-1)
 * 検収条件の公開・約束、タスク候補の WBS 配置。PM が最終決定し、FINISH_SCOPE で第1週へ。
 */
import type { GameAction } from '../types/actions'
import type { GameState } from '../types/state'
import type { Lane } from '../types/content'
import type { RuleViolation } from '../types/violation'
import { violation } from '../types/violation'
import { shuffle } from '../rng'
import { addLog, getAcceptance, getTaskCard } from '../helpers'
import { startWeek } from './week'

/** PM 帽子チェック */
export function guardPm(state: GameState, playerId: string): RuleViolation | null {
  if (!state.players.some((p) => p.id === playerId)) {
    return violation('PLAYER_NOT_FOUND', `プレイヤーが見つかりません: ${playerId}`)
  }
  if (state.pmPlayerId !== playerId) {
    return violation('NOT_PM', 'PM 帽子のプレイヤーだけが行えます。')
  }
  return null
}

/**
 * スコープ会議を開く(セットアップ時・フェーズ進行時に呼ばれる):
 * 現フェーズの検収条件を公開し、現フェーズのタスクカードを山に混ぜ、候補プールを補充する。
 */
export function openScopeMeeting(state: GameState): GameState {
  let next: GameState = { ...state, step: 'scope_meeting', week: 0 }

  // ── 検収条件の公開(累積) ──
  const newAcceptance = next.content.acceptance.filter(
    (a) => a.phase === next.phase && !next.openAcceptanceIds.includes(a.id),
  )
  next = {
    ...next,
    openAcceptanceIds: [...next.openAcceptanceIds, ...newAcceptance.map((a) => a.id)],
  }
  for (const a of newAcceptance) {
    next = addLog(next, `📋 検収条件が公開されました:「${a.name}」(${a.slot} を Lv${a.level})`)
  }

  // ── 現フェーズのタスクカードを山に混ぜてシャッフル ──
  const newTaskIds = next.content.tasks
    .filter((t) => t.phase === next.phase)
    .map((t) => t.id)
    .filter(
      (id) =>
        !next.decks.tasks.drawPile.includes(id) &&
        !next.decks.tasks.discardPile.includes(id) &&
        !next.taskPool.includes(id) &&
        !next.board.some((b) => b.cardId === id),
    )
  const [drawPile, rng] = shuffle(next.rng, [...next.decks.tasks.drawPile, ...newTaskIds])
  next = { ...next, rng, decks: { ...next.decks, tasks: { ...next.decks.tasks, drawPile } } }

  // ── 候補プールを draftPool 枚まで補充 ──
  return refillTaskPool(next)
}

/** 候補プールを draftPool 枚まで山から補充する */
export function refillTaskPool(state: GameState): GameState {
  const pool = [...state.taskPool]
  const drawPile = [...state.decks.tasks.drawPile]
  while (pool.length < state.config.draftPool && drawPile.length > 0) {
    pool.push(drawPile.shift()!)
  }
  return {
    ...state,
    taskPool: pool,
    decks: { ...state.decks, tasks: { ...state.decks.tasks, drawPile } },
  }
}

/** COMMIT_ACCEPTANCE — 検収条件を約束する(PM。スコープ会議中のみ) */
export function handleCommitAcceptance(
  state: GameState,
  action: Extract<GameAction, { type: 'COMMIT_ACCEPTANCE' }>,
): GameState | RuleViolation {
  const guard = guardPm(state, action.playerId)
  if (guard) return guard
  if (state.step !== 'scope_meeting') {
    return violation('INVALID_STEP', '約束はスコープ会議中に行います。')
  }
  const card = getAcceptance(state.content, action.acceptanceId)
  if (!card || !state.openAcceptanceIds.includes(action.acceptanceId)) {
    return violation('NOT_FOUND', `公開されている検収条件ではありません: ${action.acceptanceId}`)
  }
  if (state.metAcceptanceIds.includes(action.acceptanceId)) {
    return violation('ALREADY_COMMITTED', 'この検収条件はすでに達成済みです。')
  }
  if (state.commitments.some((c) => c.acceptanceId === action.acceptanceId)) {
    return violation('ALREADY_COMMITTED', 'この検収条件はすでに約束済みです。')
  }
  let next: GameState = {
    ...state,
    commitments: [
      ...state.commitments,
      { acceptanceId: action.acceptanceId, committedPhase: state.phase, graceUntilPhase: 0 },
    ],
  }
  next = addLog(next, `🤝 「${card.name}」をお客様に約束しました。`)
  return next
}

/** レーン文法:middle は start に、finish は middle に累計1枚以上の配置が必要 */
function laneAllowed(state: GameState, lane: Lane): boolean {
  if (lane === 'start') return true
  if (lane === 'middle') return state.lanePlacedCount.start >= 1
  return state.lanePlacedCount.middle >= 1
}

/** PLACE_TASK — タスク候補を WBS レーンに配置する(PM。スコープ会議中のみ) */
export function handlePlaceTask(
  state: GameState,
  action: Extract<GameAction, { type: 'PLACE_TASK' }>,
): GameState | RuleViolation {
  const guard = guardPm(state, action.playerId)
  if (guard) return guard
  if (state.step !== 'scope_meeting') {
    return violation('INVALID_STEP', 'タスクの配置はスコープ会議中に行います。')
  }
  if (!state.taskPool.includes(action.cardId)) {
    return violation('NOT_FOUND', `候補プールにないタスクです: ${action.cardId}`)
  }
  const card = getTaskCard(state.content, action.cardId)!
  const slot = state.slots.find((s) => s.slotId === card.slot)
  if (slot && slot.level > 0) {
    return violation(
      'INVALID_TARGET',
      `スロット「${card.slot}」は納品済みです(Lv上げは改修で行います)。`,
    )
  }
  if (state.board.some((b) => !b.interrupt && getTaskCard(state.content, b.cardId)?.slot === card.slot)) {
    return violation('INVALID_TARGET', `スロット「${card.slot}」に向けたタスクがすでに盤上にあります。`)
  }
  if (!laneAllowed(state, card.lane)) {
    return violation('LANE_GRAMMAR', `「${card.lane}」列は、直前の列にタスクが配置されてから置けます。`)
  }
  let next: GameState = {
    ...state,
    taskPool: state.taskPool.filter((id) => id !== action.cardId),
    board: [
      ...state.board,
      {
        cardId: action.cardId,
        cubes: 0,
        fire: 0,
        lane: card.lane,
        interrupt: null,
        interruptEffort: null,
        rewardBudget: null,
        contributorIds: [],
        placedSeq: state.placementCounter + 1,
        effortReduction: 0,
      },
    ],
    placementCounter: state.placementCounter + 1,
    lanePlacedCount: {
      ...state.lanePlacedCount,
      [card.lane]: state.lanePlacedCount[card.lane] + 1,
    },
  }
  next = addLog(next, `🗂 WBS にタスク「${card.name}」を配置(${card.skill} ${card.effort})`)
  return next
}

/** FINISH_SCOPE — スコープ会議を締めて第1週へ(PM) */
export function handleFinishScope(
  state: GameState,
  action: Extract<GameAction, { type: 'FINISH_SCOPE' }>,
): GameState | RuleViolation {
  const guard = guardPm(state, action.playerId)
  if (guard) return guard
  if (state.step !== 'scope_meeting') {
    return violation('INVALID_STEP', 'スコープ会議中ではありません。')
  }
  return startWeek({ ...state }, 1)
}
