/**
 * スコープ会議と計画ボード(RULES.md §5・§8-1)
 * 要件の公開、タスク候補の3週計画への配置、再計画。PM が FINISH_SCOPE で第1週へ。
 */
import type { GameAction } from '../types/actions'
import type { BoardTask, GameState } from '../types/state'
import type { RequirementCard } from '../types/content'
import type { RuleViolation } from '../types/violation'
import { violation } from '../types/violation'
import { shuffle } from '../rng'
import { addLog, getRequirementCard, getBoardTask, getTaskCard } from '../helpers'
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

/** 要件区分の日本語ラベル */
export function tierLabel(tier: 'must' | 'better' | 'dropped'): string {
  if (tier === 'must') return 'Must'
  if (tier === 'better') return 'Better'
  return '見送り'
}

/** 要件を場に公開する(重複時は何もしない) */
export function openRequirement(
  state: GameState,
  card: RequirementCard,
  options: {
    tier?: 'must' | 'better'
    deadlinePhase?: number
    addedByEvent?: boolean
    csOnFulfill?: number
    sourceEventId?: string | null
  } = {},
): GameState {
  if (state.requirements.some((r) => r.requirementId === card.id)) return state
  const tier = options.tier ?? card.tier
  const deadlinePhase = Math.min(
    state.config.phases,
    options.deadlinePhase ?? card.deadlinePhase,
  )
  const next: GameState = {
    ...state,
    requirements: [
      ...state.requirements,
      {
        requirementId: card.id,
        tier,
        deadlinePhase,
        met: false,
        settled: false,
        settledOutcome: null,
        addedByEvent: options.addedByEvent ?? false,
        csOnFulfill: options.csOnFulfill ?? 0,
        sourceEventId: options.sourceEventId ?? null,
      },
    ],
  }
  return addLog(
    next,
    `📋 要件が公開されました:「${card.name}」[${tierLabel(tier)}・期限フェーズ${deadlinePhase}]`,
  )
}

/**
 * スコープ会議を開く(セットアップ時・フェーズ進行時に呼ばれる):
 * 現フェーズの要件を公開し、現フェーズのタスクカードを山に混ぜ、候補プールを補充する。
 */
export function openScopeMeeting(state: GameState): GameState {
  let next: GameState = { ...state, step: 'scope_meeting', week: 0 }

  // ── 要件の公開(累積。イベント追加専用のカードは phase=0 で定義し、ここでは公開しない) ──
  for (const card of next.content.requirements) {
    if (card.phase !== next.phase) continue
    next = openRequirement(next, card)
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

/** 計画ボードへの操作ができるステップか(RULES.md §5-3:スコープ会議と週末のみ) */
function guardPlanningStep(state: GameState): RuleViolation | null {
  if (state.step !== 'scope_meeting' && state.step !== 'weekend') {
    return violation(
      'INVALID_STEP',
      '計画の変更はスコープ会議中か週末に行います(朝会中は今週の計画が確定しています)。',
    )
  }
  if (state.pendingEvent !== null) {
    return violation('PENDING_EVENT', '先にイベントを解決してください。')
  }
  return null
}

/** 週指定の検証(null = Backlog / 1〜roundsPerPhase) */
function validateWeek(state: GameState, week: number | null): RuleViolation | null {
  if (week === null) return null
  if (!Number.isInteger(week) || week < 1 || week > state.config.roundsPerPhase) {
    return violation(
      'INVALID_WEEK',
      `予定週は 1〜${state.config.roundsPerPhase} または Backlog(null)です。`,
    )
  }
  return null
}

/** PLAN_TASK — タスク候補を計画ボードへ配置する(PM) */
export function handlePlanTask(
  state: GameState,
  action: Extract<GameAction, { type: 'PLAN_TASK' }>,
): GameState | RuleViolation {
  const guard = guardPm(state, action.playerId)
  if (guard) return guard
  const stepGuard = guardPlanningStep(state)
  if (stepGuard) return stepGuard
  const weekGuard = validateWeek(state, action.week)
  if (weekGuard) return weekGuard

  if (!state.taskPool.includes(action.cardId)) {
    return violation('NOT_FOUND', `候補プールにないタスクです: ${action.cardId}`)
  }
  const card = getTaskCard(state.content, action.cardId)!
  const slot = state.slots.find((s) => s.slotId === card.slot)
  if (slot && slot.level > 0) {
    return violation(
      'INVALID_TARGET',
      `「${card.slot}」はすでに納品済みです(Lv 上げは改修で行います)。`,
    )
  }
  if (
    state.board.some(
      (b) => !b.interrupt && getTaskCard(state.content, b.cardId)?.slot === card.slot,
    )
  ) {
    return violation(
      'INVALID_TARGET',
      `同じ成果物に向けたタスクがすでに計画にあります: ${card.slot}`,
    )
  }

  const task: BoardTask = {
    cardId: action.cardId,
    cubes: 0,
    fire: 0,
    plannedWeek: action.week,
    interrupt: null,
    interruptEffort: null,
    interruptSkill: null,
    targetSlotId: null,
    rewardBudget: null,
    actualEffort: null,
    contributorIds: [],
    placedSeq: state.placementCounter + 1,
    effortReduction: 0,
    blockedUntilWeek: 0,
    csOnFulfill: 0,
    sourceEventId: null,
  }
  let next: GameState = {
    ...state,
    taskPool: state.taskPool.filter((id) => id !== action.cardId),
    board: [...state.board, task],
    placementCounter: state.placementCounter + 1,
  }
  next = addLog(
    next,
    `🗂 計画に「${card.name}」を配置(${weekLabel(action.week)}・見積${card.estimate}人日・リスク${riskLabel(card.risk)})`,
  )
  return next
}

/** 予定週の表示ラベル */
export function weekLabel(week: number | null): string {
  return week === null ? 'Backlog' : `第${week}週`
}

/** リスクの日本語ラベル */
export function riskLabel(risk: 'low' | 'medium' | 'high'): string {
  if (risk === 'low') return '低'
  if (risk === 'medium') return '中'
  return '高'
}

/** MOVE_TASK — 盤上タスクの予定週を変更する(PM。再計画) */
export function handleMoveTask(
  state: GameState,
  action: Extract<GameAction, { type: 'MOVE_TASK' }>,
): GameState | RuleViolation {
  const guard = guardPm(state, action.playerId)
  if (guard) return guard
  const stepGuard = guardPlanningStep(state)
  if (stepGuard) return stepGuard
  const weekGuard = validateWeek(state, action.week)
  if (weekGuard) return weekGuard

  const task = getBoardTask(state, action.cardId)
  if (!task) return violation('NOT_FOUND', `盤上にないタスクです: ${action.cardId}`)
  if (task.interrupt) {
    return violation('INVALID_TARGET', '割り込みカードは予定週を持ちません(いつでも着手できます)。')
  }
  if (task.plannedWeek === action.week) return state

  const card = getTaskCard(state.content, action.cardId)
  let next = updateBoardTaskWeek(state, action.cardId, action.week)
  next = addLog(next, `📅 「${card?.name}」の予定を ${weekLabel(action.week)} に変更`)
  return next
}

function updateBoardTaskWeek(
  state: GameState,
  cardId: string,
  week: number | null,
): GameState {
  return {
    ...state,
    board: state.board.map((t) => (t.cardId === cardId ? { ...t, plannedWeek: week } : t)),
  }
}

/** DROP_TASK — 盤上タスクを見送りにする(PM。積んだキューブは失われる) */
export function handleDropTask(
  state: GameState,
  action: Extract<GameAction, { type: 'DROP_TASK' }>,
): GameState | RuleViolation {
  const guard = guardPm(state, action.playerId)
  if (guard) return guard
  const stepGuard = guardPlanningStep(state)
  if (stepGuard) return stepGuard

  const task = getBoardTask(state, action.cardId)
  if (!task) return violation('NOT_FOUND', `盤上にないタスクです: ${action.cardId}`)
  if (task.interrupt) {
    return violation(
      'INVALID_TARGET',
      '割り込みカードは見送りではなく「謝絶」で取り下げます(RULES.md §8-4)。',
    )
  }
  const card = getTaskCard(state.content, action.cardId)
  let next: GameState = {
    ...state,
    board: state.board.filter((t) => t.cardId !== action.cardId),
    assignments: state.assignments.filter(
      (a) =>
        !(
          (a.target.kind === 'task' || a.target.kind === 'extinguish') &&
          a.target.cardId === action.cardId
        ),
    ),
    decks: {
      ...state.decks,
      tasks: {
        ...state.decks.tasks,
        discardPile: [...state.decks.tasks.discardPile, action.cardId],
      },
    },
  }
  next = addLog(
    next,
    task.cubes > 0
      ? `🗑 「${card?.name}」を見送り(積んだ${task.cubes}人日は失われました)`
      : `🗑 「${card?.name}」を見送り`,
  )
  return next
}

/** REDRAW_TASKS — タスク候補を引き直す(PM。スコープ会議中・フェーズ redrawPerPhase 回まで) */
export function handleRedrawTasks(
  state: GameState,
  action: Extract<GameAction, { type: 'REDRAW_TASKS' }>,
): GameState | RuleViolation {
  const guard = guardPm(state, action.playerId)
  if (guard) return guard
  if (state.step !== 'scope_meeting') {
    return violation('INVALID_STEP', 'カードの引き直しはスコープ会議中のみです。')
  }
  if (state.redrawUsedThisPhase >= state.config.redrawPerPhase) {
    return violation(
      'LIMIT_REACHED',
      `引き直しはフェーズ${state.config.redrawPerPhase}回までです。`,
    )
  }
  const cardIds = action.cardIds ?? []
  if (cardIds.length === 0 || cardIds.length > 2) {
    return violation('INVALID_TARGET', '引き直しは1〜2枚を指定してください。')
  }
  if (!cardIds.every((id) => state.taskPool.includes(id))) {
    return violation('NOT_FOUND', '候補プールにないカードが含まれています。')
  }
  let next: GameState = {
    ...state,
    redrawUsedThisPhase: state.redrawUsedThisPhase + 1,
    taskPool: state.taskPool.filter((id) => !cardIds.includes(id)),
    decks: {
      ...state.decks,
      tasks: {
        ...state.decks.tasks,
        discardPile: [...state.decks.tasks.discardPile, ...cardIds],
      },
    },
  }
  next = refillTaskPool(next)
  return addLog(next, `🔄 タスク候補${cardIds.length}枚を引き直した`)
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
  return startWeek(state, 1)
}

/** CHANGE_SCOPE — 要件の区分・期限を変更する(PM。RULES.md §3-5) */
export function handleChangeScope(
  state: GameState,
  action: Extract<GameAction, { type: 'CHANGE_SCOPE' }>,
): GameState | RuleViolation {
  const guard = guardPm(state, action.playerId)
  if (guard) return guard
  if (state.pendingEvent !== null) {
    return violation('PENDING_EVENT', '先にイベントを解決してください。')
  }
  const req = state.requirements.find((r) => r.requirementId === action.requirementId)
  if (!req) return violation('NOT_FOUND', `公開されていない要件です: ${action.requirementId}`)
  const card = getRequirementCard(state.content, action.requirementId)!
  if (req.settled) {
    return violation('SCOPE_LOCKED', `「${card.name}」は清算済みのため変更できません。`)
  }
  if (req.met) {
    return violation('SCOPE_LOCKED', `「${card.name}」は達成済みのため変更できません。`)
  }

  /** Must を緩める変更は回数とコストがかかる */
  const costly = action.mode === 'demote' || action.mode === 'drop' || action.mode === 'extend'
  if (costly && state.scopeChangeUsedThisPhase >= state.config.scopeChangePerPhase) {
    return violation(
      'LIMIT_REACHED',
      `スコープ交渉はフェーズ${state.config.scopeChangePerPhase}回までです。`,
    )
  }

  let next = state
  switch (action.mode) {
    case 'demote': {
      if (req.tier !== 'must') {
        return violation('INVALID_TARGET', 'Must の要件だけ Better 化できます。')
      }
      next = updateReq(next, req.requirementId, { tier: 'better' })
      next = changeCsWithLog(
        next,
        -next.config.demoteMustCs,
        `🤝 交渉:「${card.name}」を Must → Better に(CS-${next.config.demoteMustCs})`,
      )
      break
    }
    case 'drop': {
      if (req.tier === 'dropped') {
        return violation('INVALID_TARGET', 'すでに見送りです。')
      }
      const wasMust = req.tier === 'must'
      next = updateReq(next, req.requirementId, { tier: 'dropped' })
      if (wasMust) {
        next = changeCsWithLog(
          next,
          -next.config.dropMustCs,
          `🙇 交渉:「${card.name}」を見送りに(Must の取り下げ。CS-${next.config.dropMustCs})`,
        )
      } else {
        next = addLog(next, `🗑 「${card.name}」を見送りに(Better のため罰なし)`)
      }
      break
    }
    case 'extend': {
      if (req.tier !== 'must') {
        return violation('INVALID_TARGET', '期限の延長は Must の要件だけです。')
      }
      if (req.deadlinePhase >= state.config.phases) {
        return violation('INVALID_TARGET', '最終フェーズを超えて期限は延ばせません。')
      }
      if (state.budget < state.config.extendDeadlineBudget) {
        return violation(
          'NOT_ENOUGH_BUDGET',
          `期限の延長には予算${state.config.extendDeadlineBudget}が必要です。`,
        )
      }
      next = updateReq(next, req.requirementId, { deadlinePhase: req.deadlinePhase + 1 })
      next = {
        ...next,
        budget: Math.max(0, next.budget - next.config.extendDeadlineBudget),
      }
      next = addLog(
        next,
        `⏳ 交渉:「${card.name}」の期限をフェーズ${req.deadlinePhase + 1}まで延長(予算-${next.config.extendDeadlineBudget})`,
      )
      break
    }
    case 'promote': {
      if (req.tier === 'must') return violation('INVALID_TARGET', 'すでに Must です。')
      next = updateReq(next, req.requirementId, { tier: 'must' })
      next = addLog(next, `🔥 「${card.name}」を Must に引き上げた(自ら厳しくする分は無料)`)
      break
    }
    case 'restore': {
      if (req.tier !== 'dropped') {
        return violation('INVALID_TARGET', '見送りの要件だけスコープに戻せます。')
      }
      next = updateReq(next, req.requirementId, { tier: 'better' })
      next = addLog(next, `↩️ 「${card.name}」を Better としてスコープに戻した`)
      break
    }
  }
  if (next.result !== null) return next
  if (costly) {
    next = { ...next, scopeChangeUsedThisPhase: next.scopeChangeUsedThisPhase + 1 }
  }
  return next
}

function updateReq(
  state: GameState,
  requirementId: string,
  patch: Partial<{ tier: 'must' | 'better' | 'dropped'; deadlinePhase: number }>,
): GameState {
  return {
    ...state,
    requirements: state.requirements.map((r) =>
      r.requirementId === requirementId ? { ...r, ...patch } : r,
    ),
  }
}

function changeCsWithLog(state: GameState, delta: number, message: string): GameState {
  const cs = state.cs + delta
  const next: GameState = { ...state, cs }
  const logged = addLog(next, message)
  if (cs < 0 && state.config.csInstantLose) {
    return {
      ...logged,
      step: 'finished',
      result: {
        outcome: 'lose',
        reason: 'CS トラックが 0 未満になったため、チームは敗北しました。',
      },
    }
  }
  return logged
}
