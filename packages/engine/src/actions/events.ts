/**
 * イベント解決(週末イベント・限界イベント)(RULES.md §7)
 * 週末イベントは選択肢を持ちうる(受ける/交渉する/断る)。選択はログに残り再現できる。
 */
import type { GameAction } from '../types/actions'
import type { EventChoice, EventEffect, InterruptKind, SkillKind } from '../types/content'
import type { BoardTask, GameState } from '../types/state'
import type { RuleViolation } from '../types/violation'
import { violation } from '../types/violation'
import { drawCard, discard } from '../deck'
import { nextInt } from '../rng'
import {
  addFatigueAll,
  addLog,
  changeBudget,
  changeCs,
  getRequirementCard,
  getSlotDef,
  refreshRequirements,
  updatePlayer,
} from '../helpers'
import { openRequirement, tierLabel } from './scope'
import { skillName } from './week'

/**
 * 限界イベント処理待ちがあれば、次の1件のカードを引いて pendingEvent にセットする。
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

/** RESOLVE_EVENT — 解決待ちイベントを解決する(選択肢があれば choiceId で選ぶ) */
export function handleResolveEvent(
  state: GameState,
  action: Extract<GameAction, { type: 'RESOLVE_EVENT' }>,
): GameState | RuleViolation {
  const pending = state.pendingEvent
  if (pending === null) {
    return violation('NO_PENDING_EVENT', '解決待ちのイベントはありません。')
  }

  if (pending.kind === 'limit') {
    return resolveLimitEvent(state, pending.cardId, pending.targetPlayerId!)
  }

  // ── 週末イベント ──
  const card = state.content.events.find((c) => c.id === pending.cardId)
  if (!card) {
    return violation('NO_PENDING_EVENT', `イベントが見つかりません: ${pending.cardId}`)
  }

  let effects: EventEffect[]
  let choice: EventChoice | undefined
  if (card.choices && card.choices.length > 0) {
    if (action.choiceId === undefined) {
      return violation('INVALID_TARGET', 'このイベントは選択肢を選ぶ必要があります。')
    }
    choice = card.choices.find((c) => c.id === action.choiceId)
    if (!choice) {
      return violation('NOT_FOUND', `選択肢が見つかりません: ${action.choiceId}`)
    }
    if (choice.budgetCost !== undefined && state.budget < choice.budgetCost) {
      return violation(
        'NOT_ENOUGH_BUDGET',
        `この選択には予算${choice.budgetCost}が必要です(現在${state.budget})。`,
      )
    }
    effects = choice.effects
  } else {
    effects = card.effects
  }

  let next: GameState = { ...state, pendingEvent: null }
  next = addLog(next, `⚡ イベント「${card.name}」:${card.description}`)
  if (choice) {
    next = addLog(next, `  ↳ 選択:「${choice.label}」— ${choice.description}`)
    if (choice.budgetCost !== undefined && choice.budgetCost > 0) {
      next = changeBudget(next, -choice.budgetCost)
    }
  }

  for (const effect of effects) {
    if (next.result !== null) return next
    next = applyEffect(next, effect, {
      eventId: card.id,
      csOnFulfill: choice?.csOnFulfill ?? 0,
    })
  }
  next = { ...next, decks: { ...next.decks, events: discard(next.decks.events, card.id) } }

  if (next.result !== null) return next
  next = refreshRequirements(next)
  if (next.result !== null) return next
  return maybeStartLimitEvent(next)
}

/** 限界イベントの解決 */
function resolveLimitEvent(
  state: GameState,
  cardId: string,
  targetId: string,
): GameState | RuleViolation {
  const card = state.content.limitEvents.find((c) => c.id === cardId)
  if (!card) return violation('NO_PENDING_EVENT', `限界イベントが見つかりません: ${cardId}`)
  let next: GameState = { ...state, pendingEvent: null }
  const targetName = next.players.find((p) => p.id === targetId)?.name ?? targetId
  next = addLog(next, `😵 限界イベント「${card.name}」(${targetName})`)
  switch (card.effect.type) {
    case 'BUDGET':
      next = changeBudget(next, card.effect.amount)
      break
    case 'CS':
      next = changeCs(next, card.effect.amount)
      break
    case 'FATIGUE_ALL':
      next = addFatigueAll(next, card.effect.amount)
      break
    case 'OVERTIME_BAN':
      next = updatePlayer(next, targetId, (p) => ({ ...p, overtimeBanPhase: next.phase + 1 }))
      break
    case 'NONE':
      break
  }
  if (next.result !== null) return next
  next = updatePlayer(next, targetId, (p) => ({
    ...p,
    fatigue: Math.min(p.fatigue, next.config.limitResetFatigue),
  }))
  next = {
    ...next,
    decks: { ...next.decks, limitEvents: discard(next.decks.limitEvents, cardId) },
  }
  return maybeStartLimitEvent(next)
}

/** イベント効果1つの適用(RULES.md §7-3) */
function applyEffect(
  state: GameState,
  effect: EventEffect,
  ctx: { eventId: string; csOnFulfill: number },
): GameState {
  switch (effect.type) {
    case 'BUDGET':
      return changeBudget(state, effect.amount)
    case 'CS': {
      const next = changeCs(state, effect.amount)
      return addLog(
        next,
        effect.amount >= 0 ? `💚 CS+${effect.amount}` : `💢 CS${effect.amount}`,
      )
    }
    case 'FATIGUE_ALL':
      return addFatigueAll(state, effect.amount)
    case 'INTERRUPT':
      return applyInterrupt(state, effect, ctx)
    case 'CAPACITY_DOWN':
      return applyCapacityDown(state, effect.amount ?? state.config.capacityDownCubes)
    case 'BLOCK_TASK':
      return applyBlockTask(state)
    case 'ADD_REQUIREMENT':
      return applyAddRequirement(state, effect, ctx)
    case 'QUALITY_AUDIT':
      return applyQualityAudit(state, effect.maxPenalty)
    case 'NONE':
      return state
  }
}

/** 差し込みの種類の日本語ラベル(ログ用) */
export function interruptLabel(kind: InterruptKind): string {
  if (kind === 'rework') return '手戻り'
  if (kind === 'bug') return 'バグ報告'
  return '相談ごと'
}

/**
 * 手戻り・バグの対象スロットを選ぶ(RULES.md §2-4)。
 * **品質リスクのあるスロットを優先**する。無ければ納品済み全体から選ぶ。
 */
function pickTargetSlot(state: GameState): { slotId: string | null; state: GameState } {
  const delivered = state.slots.filter((s) => s.level > 0)
  if (delivered.length === 0) return { slotId: null, state }
  const risky = delivered.filter((s) => s.qualityRisk)
  const pool = risky.length > 0 ? risky : delivered
  const [index, rng] = nextInt(state.rng, pool.length)
  return { slotId: pool[index]!.slotId, state: { ...state, rng } }
}

/**
 * 差し込みの適用(RULES.md §8-4)。
 * rework/bug/consult のすべてが「カードとして割り込みレーンに置かれる」。
 * 割り込みカードは必要スキルを持つ(rework は対象スロットの系統)。
 */
function applyInterrupt(
  state: GameState,
  effect: Extract<EventEffect, { type: 'INTERRUPT' }>,
  ctx: { eventId: string; csOnFulfill: number },
): GameState {
  let next = state
  let targetSlotId: string | null = null
  let interruptSkill: SkillKind | null = effect.skill ?? null

  if (effect.kind === 'rework') {
    const picked = pickTargetSlot(next)
    next = picked.state
    if (picked.slotId === null) {
      return addLog(next, '💨 手戻り発生…のはずが、まだ何も納品していなかった(効果なし)')
    }
    targetSlotId = picked.slotId
    interruptSkill = getSlotDef(next.content, targetSlotId)?.skill ?? null
  }

  // ── 割り込みレーンのキャパシティ(あふれ)──
  const interruptCount = next.board.filter((t) => t.interrupt !== null).length
  if (interruptCount >= next.config.interruptCapacity) {
    next = changeCs(next, -next.config.overflowCs)
    if (next.result !== null) return next
    return addLog(
      next,
      `🌊 割り込みが受け止めきれずあふれた!(${interruptLabel(effect.kind)}。CS-${next.config.overflowCs})`,
    )
  }

  const cardId = `interrupt-${next.placementCounter + 1}`
  const task: BoardTask = {
    cardId,
    cubes: 0,
    fire: 0,
    plannedWeek: null,
    interrupt: effect.kind,
    interruptEffort: effect.amount,
    interruptSkill,
    targetSlotId,
    rewardBudget: effect.kind === 'consult' ? (effect.rewardBudget ?? 0) : null,
    actualEffort: null,
    contributorIds: [],
    placedSeq: next.placementCounter + 1,
    effortReduction: 0,
    blockedUntilWeek: 0,
    csOnFulfill: ctx.csOnFulfill,
    sourceEventId: ctx.csOnFulfill > 0 ? ctx.eventId : null,
  }
  next = {
    ...next,
    board: [...next.board, task],
    placementCounter: next.placementCounter + 1,
  }

  const skillNote =
    interruptSkill === null ? '系統不問' : `要${skillName(interruptSkill)}`
  if (effect.kind === 'rework') {
    const slot = next.slots.find((s) => s.slotId === targetSlotId)
    const name = getSlotDef(next.content, targetSlotId!)?.name ?? targetSlotId
    next = addLog(
      next,
      slot?.qualityRisk
        ? `🔁 手戻り!【${name}】(⚠品質リスクあり。人日${effect.amount}+${next.config.qualityRiskEffortPenalty}・${skillNote})解消まで要件は未達扱い`
        : `🔁 手戻り!【${name}】(人日${effect.amount}・${skillNote})解消まで要件は未達扱い`,
    )
    return refreshRequirements(next)
  }
  return addLog(
    next,
    effect.kind === 'bug'
      ? `🐛 バグ報告!対応タスク(人日${effect.amount}・${skillNote})が割り込み。放置するとフェーズ末ごとに CS-1`
      : `💬 相談ごと(人日${effect.amount}・${skillNote})。対応すれば予算+${effect.rewardBudget ?? 0}。放置しても罰はない`,
  )
}

/** 他案件ヘルプ:対象プレイヤーの次週キャパシティを下げる(RULES.md §7-3) */
function applyCapacityDown(state: GameState, amount: number): GameState {
  if (state.players.length === 0) return state
  const [index, rng] = nextInt(state.rng, state.players.length)
  const target = state.players[index]!
  const untilWeek = state.week + 1
  let next: GameState = { ...state, rng }
  next = updatePlayer(next, target.id, (p) => ({ ...p, capacityDownUntilWeek: untilWeek }))
  return addLog(
    next,
    `🙋 他案件のヘルプに ${target.name} が取られました(来週は積む人日 -${amount})`,
  )
}

/** クライアント確認待ち:未納品タスク1つを次週だけ開始できなくする(RULES.md §7-3) */
function applyBlockTask(state: GameState): GameState {
  const candidates = state.board.filter((t) => !t.interrupt && t.blockedUntilWeek < state.week + 1)
  if (candidates.length === 0) {
    return addLog(state, '💨 クライアント確認待ち…のはずが、止まる仕事がなかった(効果なし)')
  }
  const [index, rng] = nextInt(state.rng, candidates.length)
  const target = candidates[index]!
  const untilWeek = state.week + 1
  const name = state.content.tasks.find((t) => t.id === target.cardId)?.name ?? target.cardId
  const next: GameState = {
    ...state,
    rng,
    board: state.board.map((t) =>
      t.cardId === target.cardId ? { ...t, blockedUntilWeek: untilWeek } : t,
    ),
  }
  return addLog(next, `⏸ クライアント確認待ち:「${name}」は来週は着手できません。`)
}

/** 要件追加:新しい Must / Better をスコープボードへ(RULES.md §3-6) */
function applyAddRequirement(
  state: GameState,
  effect: Extract<EventEffect, { type: 'ADD_REQUIREMENT' }>,
  ctx: { eventId: string; csOnFulfill: number },
): GameState {
  const card = getRequirementCard(state.content, effect.requirementId)
  if (!card) return state
  if (state.requirements.some((r) => r.requirementId === card.id)) {
    return addLog(state, `💨 追加要望「${card.name}」はすでにスコープにあります(効果なし)`)
  }
  const deadlinePhase =
    effect.deadlineOffset === undefined
      ? card.deadlinePhase
      : state.phase + effect.deadlineOffset
  let next = openRequirement(state, card, {
    tier: effect.tier,
    deadlinePhase,
    addedByEvent: true,
    csOnFulfill: ctx.csOnFulfill,
    sourceEventId: ctx.csOnFulfill > 0 ? ctx.eventId : null,
  })
  next = addLog(
    next,
    `➕ 追加要望を ${tierLabel(effect.tier)} としてスコープに受け入れました(「${card.name}」)`,
  )
  return next
}

/** 品質レビュー:品質リスクのあるスロット1つにつき CS-1(最大 maxPenalty。RULES.md §7-3) */
function applyQualityAudit(state: GameState, maxPenalty: number): GameState {
  const risky = state.slots.filter((s) => s.qualityRisk)
  if (risky.length === 0) {
    return addLog(state, '🔎 品質レビュー:指摘なし。丁寧に作ってきた甲斐がありました。')
  }
  const penalty = Math.min(risky.length, maxPenalty)
  const names = risky
    .slice(0, penalty)
    .map((s) => getSlotDef(state.content, s.slotId)?.name ?? s.slotId)
    .join('・')
  let next = changeCs(state, -penalty)
  next = addLog(next, `🔎 品質レビューで指摘:【${names}】の作りが粗い(CS-${penalty})`)
  return next
}
