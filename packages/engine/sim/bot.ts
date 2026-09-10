/**
 * ボット:エンジンをそのまま駆動して1ゲームを最後まで打つ(RULES.md §13)
 *
 * 人間の意思決定を単純化したヒューリスティックで置き換えている:
 *  - スコープ会議:要件の優先順位に沿ってタスクを選び、依存を解いて週に置く(§5・§6)
 *  - 朝会:各自を「いま一番価値のある仕事」に配属する(§8-3)
 *  - 週末:納品判断 → イベント選択 → 再計画(§8-5)
 * 目的は最適プレイの探索ではなく、**ルールが壊れていないかとバランス帯の測定**。
 */
import type {
  BoardTask,
  EventCard,
  GameAction,
  GameConfig,
  GameState,
  RequirementState,
  SkillKind,
  TaskCard,
  WorkerTarget,
} from '../src/types'
import { isRuleViolation } from '../src/types'
import { applyAction } from '../src/applyAction'
import { createInitialState } from '../src/initialState'
import {
  capacityPenalty,
  cubesForSlot,
  cubesForTask,
  isSlotUsable,
  isPrereqBlocked,
  isTaskBlocked,
  requiredCubes,
  taskSkill,
  weekLoad,
} from '../src/helpers'
import type { GameMetrics, Strategy } from './types'
import {
  applyDemandMode,
  applyDependencyMode,
  applyInflowMode,
  maxWorkersFor,
  type DemandMode,
  type DependencyMode,
  type InflowMode,
  type WorkerLimitMode,
} from './decks'
import {
  applyFoundationBonuses,
  foundationLv2Count,
  foundationSlots,
  uncertaintyActive,
  type FoundationApplied,
  type FoundationMode,
} from './foundation'
import {
  applyWeekendRisks,
  carryRiskToSlots,
  collectEarlyStarts,
  emptyTally,
  snapshotCubes,
  type RiskOptions,
  type RiskTally,
} from './risk'
import {
  DEFAULT_DEBT,
  emptyDebtTally,
  hideDraftCards,
  revealMissingCards,
  spawnDebtCards,
  type DebtMode,
  type DebtOptions,
  type DebtTally,
  type DraftMode,
} from './draft'

const PLAYER_IDS = ['p1', 'p2', 'p3', 'p4']

interface Ctx {
  state: GameState
  strategy: Strategy
  metrics: GameMetrics
  /** 実工数を計測済みのタスク */
  measured: Set<string>
  /** 今フェーズで学習に使った枠 */
  learnUsedThisPhase: number
  /** 直前に観測した board の割り込み ID(発生・解消のカウント用) */
  seenInterrupts: Set<string>
  /** 最初に立てた予定(cardId → 「フェーズ,週」)。計画遵守率の分母になる */
  firstPlan: Map<string, { phase: number; week: number }>
  /** 同時作業人数の上限(提案Aの検証用) */
  workerLimit: WorkerLimitMode
  /** 基盤成果物の完成ボーナス(v6 提案 §5 の検証用) */
  foundation: FoundationMode
  /** 基盤ボーナスの強さ(必要工数の恒久減) */
  foundationAmount: number
  /** すでにボーナスを配ったタスク(二重適用の防止) */
  foundationApplied: FoundationApplied
  /** リスクマーカーの設定(null = v6 のリスク層を使わない) */
  risk: RiskOptions | null
  /** リスクの発生と炎上の集計 */
  tally: RiskTally
  /** 週初の積みキューブ(前倒し着手の検出用) */
  weekCubes: Map<number, number>
  /** 週初から盤上にあった割り込み(放置の検出用) */
  weekInterrupts: Set<number>
  /** ドラフトの見え方(v6 提案 §3) */
  draft: DraftMode
  /** 伏せ札に回っているタスクカード */
  hiddenCards: Set<string>
  /** デッキ汚染(v6 提案 §4) */
  debtMode: DebtMode
  debtOpts: DebtOptions
  debt: DebtTally
  /** 負債の発生元を数えるための、すでに数え終えた件数 */
  seenOutbreaks: number
  seenLv1: number
  seenRelief: number
}

/** アクションを試す。通れば state を進め、通らなければ理由を返す */
function tryAct(ctx: Ctx, action: GameAction): string | null {
  const next = applyAction(ctx.state, action)
  if (isRuleViolation(next)) return next.code
  ctx.state = next
  return null
}

function taskCardOf(state: GameState, cardId: string): TaskCard | undefined {
  return state.content.tasks.find((t) => t.id === cardId)
}

/** そのスロットに向けて盤上にあるタスク */
function boardTaskForSlot(state: GameState, slotId: string): BoardTask | undefined {
  return state.board.find(
    (b) => !b.interrupt && taskCardOf(state, b.cardId)?.slot === slotId,
  )
}

/** 未清算・未達成の要件を、優先度順(Must の期限が近い順 → Better)に並べる */
function openRequirements(state: GameState, strategy: Strategy): RequirementState[] {
  return state.requirements
    .filter((r) => !r.settled && !r.met && r.tier !== 'dropped')
    .filter((r) => r.tier === 'must' || strategy.betters !== 'drop')
    .sort((a, b) => {
      const tierRank = (r: RequirementState) => (r.tier === 'must' ? 0 : 1)
      if (tierRank(a) !== tierRank(b)) return tierRank(a) - tierRank(b)
      return a.deadlinePhase - b.deadlinePhase
    })
}

/** この要件が求める Lv をスロットが満たしているか */
function requirementCardOf(state: GameState, req: RequirementState) {
  return state.content.requirements.find((r) => r.id === req.requirementId)
}

// ═══════════════════════════════════════════════════════════
// スコープ会議 / 再計画
// ═══════════════════════════════════════════════════════════

/** その要件がこのフェーズ中に手が届きそうか(届かないなら交渉で緩める) */
function looksUnreachable(state: GameState, req: RequirementState): boolean {
  const card = requirementCardOf(state, req)
  if (!card) return false
  const slot = state.slots.find((s) => s.slotId === card.slot)
  if (slot && slot.level >= card.level) return false
  const onBoard = boardTaskForSlot(state, card.slot)
  if (onBoard) return false
  const inPool = state.taskPool.some((id) => taskCardOf(state, id)?.slot === card.slot)
  return !inPool
}

/** 要件の区分を戦略に合わせて整える(RULES.md §3-5) */
function negotiateScope(ctx: Ctx): void {
  const pm = ctx.state.pmPlayerId
  const strategy = ctx.strategy

  // Better を切る戦略
  if (strategy.betters === 'drop') {
    for (const req of [...ctx.state.requirements]) {
      if (req.tier !== 'better' || req.settled || req.met) continue
      if (!tryAct(ctx, { type: 'CHANGE_SCOPE', playerId: pm, requirementId: req.requirementId, mode: 'drop' })) {
        ctx.metrics.scopeDrops++
      }
    }
  }

  // 極端戦略:Must も落とす
  if (strategy.dropMusts) {
    for (const req of [...ctx.state.requirements]) {
      if (req.tier !== 'must' || req.settled || req.met) continue
      if (!tryAct(ctx, { type: 'CHANGE_SCOPE', playerId: pm, requirementId: req.requirementId, mode: 'drop' })) {
        ctx.metrics.scopeDrops++
      }
    }
    return
  }

  // 手が届かない Must は Better 化して -2 を -1 に抑える
  if (strategy.renegotiateMusts) {
    for (const req of [...ctx.state.requirements]) {
      if (req.tier !== 'must' || req.settled || req.met) continue
      if (req.deadlinePhase > ctx.state.phase) continue
      if (!looksUnreachable(ctx.state, req)) continue
      if (!tryAct(ctx, { type: 'CHANGE_SCOPE', playerId: pm, requirementId: req.requirementId, mode: 'demote' })) {
        ctx.metrics.scopeDemotes++
      }
    }
  }
}

/** そのスロットを埋める候補タスクを選ぶ */
function pickTaskForSlot(
  ctx: Ctx,
  slotId: string,
  wantLevel: 1 | 2,
): TaskCard | undefined {
  const strategy = ctx.strategy
  const candidates = ctx.state.taskPool
    .map((id) => taskCardOf(ctx.state, id))
    .filter((c): c is TaskCard => !!c && c.slot === slotId)
  if (candidates.length === 0) return undefined

  const needsLv2 =
    wantLevel === 2 ||
    strategy.quality === 'polish' ||
    (strategy.protectFoundations === true && needsLevel2(ctx.state, slotId, strategy))
  const lv2Capable = candidates.filter((c) => c.maxLevel === 2)
  const pool = needsLv2 && lv2Capable.length > 0 ? lv2Capable : candidates

  const riskRank = (c: TaskCard) => (c.risk === 'low' ? 0 : c.risk === 'medium' ? 1 : 2)
  return [...pool].sort((a, b) => {
    if (strategy.quality === 'fast') {
      // 早さ優先:見積が小さい順(リスクは気にしない)
      if (a.estimate !== b.estimate) return a.estimate - b.estimate
      return riskRank(a) - riskRank(b)
    }
    // 堅さ優先:リスクが低い順、次に見積が小さい順
    if (riskRank(a) !== riskRank(b)) return riskRank(a) - riskRank(b)
    return a.estimate - b.estimate
  })[0]
}

/**
 * 依存を解いた最速の予定週。null = まだ週を決められない(Backlog)。
 * スコープ会議中は第1週から、週末の再計画中は翌週から積む。
 */
function earliestWeek(ctx: Ctx, card: TaskCard): number | null {
  const state = ctx.state
  const start = state.step === 'scope_meeting' ? 1 : state.week + 1
  let week = start
  for (const prereq of card.prerequisiteSlots) {
    if (isSlotUsable(state, prereq)) continue
    const producer = boardTaskForSlot(state, prereq)
    if (!producer || producer.plannedWeek === null) return null
    week = Math.max(week, producer.plannedWeek + 1)
  }
  return week <= state.config.roundsPerPhase ? week : null
}

/** そのスロットを埋めるための計画を立てる(前提から順に再帰的に置く) */
function planForSlot(ctx: Ctx, slotId: string, wantLevel: 1 | 2, depth = 0): void {
  if (depth > 6) return
  const state = ctx.state
  const slot = state.slots.find((s) => s.slotId === slotId)
  if (slot && slot.level >= wantLevel && isSlotUsable(state, slotId)) return
  if (boardTaskForSlot(state, slotId)) return

  const card = pickTaskForSlot(ctx, slotId, wantLevel)
  if (!card) return

  // 前提を先に計画する(遅延の連鎖を作らないため)
  for (const prereq of card.prerequisiteSlots) {
    if (isSlotUsable(ctx.state, prereq)) continue
    planForSlot(ctx, prereq, 1, depth + 1)
  }

  const week = earliestWeek(ctx, card)
  if (
    tryAct(ctx, {
      type: 'PLAN_TASK',
      playerId: ctx.state.pmPlayerId,
      cardId: card.id,
      week,
    }) === null &&
    week !== null
  ) {
    ctx.firstPlan.set(card.id, { phase: ctx.state.phase, week })
  }
}

/** 計画ボードを組む(スコープ会議・週末の再計画で共通) */
function planTasks(ctx: Ctx): void {
  for (const req of openRequirements(ctx.state, ctx.strategy)) {
    const card = requirementCardOf(ctx.state, req)
    if (!card) continue
    planForSlot(ctx, card.slot, card.level)
  }
  // エンジンビルド:要件と関係なく、基盤成果物を Lv2 まで取りにいく(v6 提案 §5)
  for (const slotId of ctx.strategy.engineSlots ?? []) {
    planForSlot(ctx, slotId, 2)
  }
  buildAhead(ctx)
}

/**
 * 先行着手:要件ぶんを計画しても手が余るなら、着手できるタスクを足しておく。
 * 実際のチームは「今フェーズの要件が全部片付いたから何もしない」とはならず、
 * 次フェーズで要求されそうな成果物を先に作る。これを入れないと
 * 「仕事が無い週」がボットの都合で水増しされ、計画ボードの評価が歪む。
 */
function buildAhead(ctx: Ctx): void {
  const teamCapacity = ctx.state.players.length
  let guard = 0
  while (guard++ < 12) {
    const workableCubes = ctx.state.board
      .filter((t) => !t.interrupt && !isTaskBlocked(ctx.state, t))
      .reduce((sum, t) => sum + Math.max(0, requiredCubes(ctx.state, t) - t.cubes), 0)
    if (workableCubes >= teamCapacity * 2) return

    // 前提が満たせる(= すぐ着手できる)未計画スロットのうち、いちばん安い道を選ぶ
    const candidate = ctx.state.taskPool
      .map((id) => taskCardOf(ctx.state, id))
      .filter((c): c is TaskCard => !!c)
      .filter((c) => {
        const slot = ctx.state.slots.find((s) => s.slotId === c.slot)
        if (slot && slot.level > 0) return false
        if (boardTaskForSlot(ctx.state, c.slot)) return false
        return earliestWeek(ctx, c) !== null
      })
      .sort((a, b) => a.estimate - b.estimate)[0]
    if (!candidate) return

    const week = earliestWeek(ctx, candidate)
    if (
      tryAct(ctx, {
        type: 'PLAN_TASK',
        playerId: ctx.state.pmPlayerId,
        cardId: candidate.id,
        week,
      }) !== null
    ) {
      return
    }
    if (week !== null) ctx.firstPlan.set(candidate.id, { phase: ctx.state.phase, week })
  }
}

/** 週末の再計画:予定が過ぎた/Backlog のタスクを、依存を見て次の週へ寄せる */
function replan(ctx: Ctx): void {
  const pm = ctx.state.pmPlayerId
  for (const task of [...ctx.state.board]) {
    if (task.interrupt) continue
    const card = taskCardOf(ctx.state, task.cardId)
    if (!card) continue
    const want = earliestWeek(ctx, card)
    if (want !== null && task.plannedWeek !== want) {
      if (
        tryAct(ctx, { type: 'MOVE_TASK', playerId: pm, cardId: task.cardId, week: want }) === null
      ) {
        ctx.metrics.replans++
      }
    }
  }
  planTasks(ctx)
}

// ═══════════════════════════════════════════════════════════
// 朝会(配属)
// ═══════════════════════════════════════════════════════════

interface WorkOption {
  key: string
  target: WorkerTarget
  priority: number
  remaining: number
}

/** そのスロットに紐づく未達要件の緊急度(高いほど急ぐ) */
function slotUrgency(state: GameState, slotId: string, strategy: Strategy): number {
  let best = 0
  for (const req of state.requirements) {
    if (req.settled || req.tier === 'dropped') continue
    const card = state.content.requirements.find((r) => r.id === req.requirementId)
    if (!card || card.slot !== slotId) continue
    const dueNow = req.deadlinePhase <= state.phase
    if (req.tier === 'must') best = Math.max(best, dueNow ? 100 : 80)
    else {
      const base = strategy.betters === 'chase' ? 75 : 55
      best = Math.max(best, dueNow ? base : base - 10)
    }
  }
  // 基盤成果物は要件に紐づかないので、緊急度を自前で持たせる。
  // **序盤ほど高い**:早く建てるほど恩恵を受ける週数が長い(エンジンビルドの本質)
  if (strategy.engineSlots?.includes(slotId)) {
    const slot = state.slots.find((s) => s.slotId === slotId)
    if (!slot || slot.level < 2) {
      best = Math.max(best, state.phase <= 2 ? 70 : 45)
    }
  }
  return best
}

/** 割り込みカードの優先度 */
function interruptPriority(ctx: Ctx, task: BoardTask): number {
  const { state, strategy } = ctx
  const laneCount = state.board.filter((t) => t.interrupt !== null).length
  const nearFull = laneCount >= state.config.interruptCapacity - 1

  if (task.interrupt === 'rework') {
    // 手戻りは要件を塞ぐので、対象スロットの緊急度をそのまま引き継ぐ
    const urgency = task.targetSlotId ? slotUrgency(state, task.targetSlotId, strategy) : 0
    return Math.max(urgency, strategy.interrupts === 'never' ? 15 : 60)
  }
  if (task.interrupt === 'bug') {
    if (strategy.interrupts === 'always') return 95
    if (strategy.interrupts === 'never') return 20
    return nearFull ? 90 : 45
  }
  // consult
  if (strategy.interrupts === 'always') return 50
  if (strategy.interrupts === 'never') return 10
  return nearFull ? 60 : 25
}

/** 今週やれる仕事の一覧 */
function workOptions(ctx: Ctx): WorkOption[] {
  const { state, strategy } = ctx
  const options: WorkOption[] = []

  const earlyStance = strategy.earlyStart ?? 'whenIdle'
  for (const task of state.board) {
    if (isTaskBlocked(state, task)) continue
    // 前倒し着手(v6 提案 §2-3):座れるが、週末にリスクマーカーが付く。
    // 「他にやることが無い週だけ使う」を既定にして、常用と使わないの両極も測れるようにする
    const early = state.config.allowEarlyStart && isPrereqBlocked(state, task)
    if (early && earlyStance === 'never') continue
    const earlyPenalty = early && earlyStance === 'whenIdle' ? 50 : 0
    const remaining = Math.max(0, requiredCubes(state, task) - task.cubes)

    if (task.interrupt) {
      if (remaining <= 0) continue
      options.push({
        key: `task:${task.cardId}`,
        target: { kind: 'task', cardId: task.cardId },
        priority: interruptPriority(ctx, task),
        remaining,
      })
      continue
    }

    if (task.plannedWeek !== state.week) continue
    const card = taskCardOf(state, task.cardId)
    if (!card) continue
    const urgency = slotUrgency(state, card.slot, strategy) || 40

    if (remaining > 0) {
      options.push({
        key: `task:${task.cardId}`,
        target: { kind: 'task', cardId: task.cardId },
        priority: urgency - earlyPenalty,
        remaining,
      })
      continue
    }
    // 必要工数には届いている:Lv2 を狙うなら積み増しに価値がある
    const wantsLv2 =
      card.maxLevel === 2 &&
      strategy.quality !== 'fast' &&
      needsLevel2(state, card.slot, strategy)
    if (wantsLv2) {
      const overshootLeft =
        requiredCubes(state, task) + state.config.qualityOvershoot - task.cubes
      if (overshootLeft > 0) {
        // 積み増しは「同じ週に人を集中させれば納品を遅らせずに Lv2 にできる」道でもある。
        // 優先度を下げすぎると品質戦略が人を集められず、不当に弱く見えるので控えめな減点にする
        options.push({
          key: `task:${task.cardId}`,
          target: { kind: 'task', cardId: task.cardId },
          priority: urgency - (strategy.quality === 'polish' ? 5 : 15),
          remaining: overshootLeft,
        })
      }
    }
  }

  // 改修:Lv2 を求められている Lv1 スロット
  for (const slot of state.slots) {
    if (slot.level !== 1) continue
    if (!needsLevel2(state, slot.slotId, strategy)) continue
    const remaining = state.config.upgradeCost - slot.upgradeCubes
    if (remaining <= 0) continue
    options.push({
      key: `slot:${slot.slotId}`,
      target: { kind: 'slot', slotId: slot.slotId },
      priority: slotUrgency(state, slot.slotId, strategy) - 15,
      remaining,
    })
  }

  return options
}

/**
 * そのスロットを Lv2 にする理由があるか。
 *  ① 要件が Lv2 を求めている
 *  ② 「土台を守る」戦略で、そのスロットが未着手の後続タスクの前提になっている
 *     (RULES.md §2-4-6:粗い土台は後続の必要人日を増やす)
 */
function needsLevel2(state: GameState, slotId: string, strategy?: Strategy): boolean {
  const required = state.requirements.some((req) => {
    if (req.settled || req.tier === 'dropped') return false
    const card = state.content.requirements.find((r) => r.id === req.requirementId)
    return !!card && card.slot === slotId && card.level === 2
  })
  if (required) return true
  if (strategy?.engineSlots?.includes(slotId)) return true
  if (!strategy?.protectFoundations) return false
  if (state.config.qualityRiskPrereqPenalty <= 0) return false
  // まだ作っていないスロットのうち、このスロットを前提にするものが何本あるか
  const dependents = state.content.tasks.filter((t) => {
    if (!t.prerequisiteSlots.includes(slotId)) return false
    const slot = state.slots.find((s) => s.slotId === t.slot)
    return !slot || slot.level === 0
  })
  // 同じスロット向けの複数の道を1本と数える
  return new Set(dependents.map((t) => t.slot)).size >= 1
}

/** 学習する系統(いちばん需要があって、まだ伸ばせるもの) */
function learnTarget(ctx: Ctx, playerId: string): SkillKind | null {
  const state = ctx.state
  const player = state.players.find((p) => p.id === playerId)!
  const demand: Record<SkillKind, number> = { direction: 0, design: 0, engineering: 0 }
  for (const task of state.board) {
    if (task.interrupt) continue
    const card = taskCardOf(state, task.cardId)
    if (card) demand[card.skill] += Math.max(0, requiredCubes(state, task) - task.cubes)
  }
  const order = (['direction', 'design', 'engineering'] as const)
    .filter((s) => player.skills[s] < state.config.skillMax && player.pendingLearn !== s)
    .sort((a, b) => demand[b] - demand[a])
  return order[0] ?? null
}

/**
 * 定期観測(RULES.md §13-6)。朝会の頭で、その週の
 *  ① 計画の質:無理な計画(過負荷)を選んでいるか
 *  ② 実施ジレンマ:着手可能な仕事がチームの供給を超えているか、専門家が取り合いになっているか
 * を記録する。
 */
function observeWeek(ctx: Ctx, options: WorkOption[]): void {
  const state = ctx.state
  const skills = ['direction', 'design', 'engineering'] as const

  // ── ① 計画:いずれかの系統で「予定工数 > 供給能力」の週(§5-2 の過負荷)──
  const load = weekLoad(state, state.week)
  if (skills.some((skill) => load.planned[skill] > load.capacity[skill])) {
    ctx.metrics.overloadedWeeks++
  }

  // ── ② ジレンマ:着手可能な残り人日 対 チームの供給人日 ──
  // 供給の上限は「各自が最も得意な仕事に就いた場合」= スキルの最大値の合計
  const supply = state.players.reduce(
    (sum, p) =>
      sum +
      Math.max(0, Math.max(p.skills.direction, p.skills.design, p.skills.engineering) -
        capacityPenalty(state, p)),
    0,
  )
  const demand = options.reduce((sum, o) => sum + o.remaining, 0)
  if (supply > 0) {
    ctx.metrics.demandSupplySum += demand / supply
    if (demand > supply) ctx.metrics.contentionWeeks++
  }

  // ── ② 専門家の取り合い(#7):系統ごとに需要と供給を比べる ──
  const demandBySkill: Record<(typeof skills)[number], number> = {
    direction: 0,
    design: 0,
    engineering: 0,
  }
  for (const option of options) {
    let skill: SkillKind | null = null
    if (option.target.kind === 'slot') skill = getSlotDefSkill(state, option.target.slotId)
    else if (option.target.kind === 'task') skill = taskSkillOf(state, option.target.cardId)
    if (skill) demandBySkill[skill] += option.remaining
  }
  const supplyBySkill = (skill: (typeof skills)[number]) =>
    state.players.reduce((sum, p) => sum + Math.max(0, p.skills[skill] - capacityPenalty(state, p)), 0)
  if (skills.some((skill) => demandBySkill[skill] > supplyBySkill(skill))) {
    ctx.metrics.specialistContentionWeeks++
  }
}

function getSlotDefSkill(state: GameState, slotId: string): SkillKind | null {
  return state.content.slots.find((s) => s.id === slotId)?.skill ?? null
}
function taskSkillOf(state: GameState, cardId: string): SkillKind | null {
  const task = state.board.find((t) => t.cardId === cardId)
  return task ? taskSkill(state, task) : null
}

/** 1週ぶんの配属を決める */
function assignWeek(ctx: Ctx): void {
  const state = () => ctx.state
  const pledged = new Map<string, number>()
  const workers = new Map<string, number>()
  let productive = 0

  /** その仕事にあと何人座れるか(提案A:ブルックスの法則) */
  const seatsLeft = (option: WorkOption): number => {
    const cardId =
      option.target.kind === 'slot' ? option.target.slotId : (option.target as { cardId: string }).cardId
    const max =
      option.target.kind === 'slot' ? 1 : maxWorkersFor(state(), cardId, ctx.workerLimit)
    return max - (workers.get(option.key) ?? 0)
  }

  // 依存遅延の実害:今週の予定なのにブロック中で着手できないタスク(RULES.md §6-3)
  for (const task of state().board) {
    if (task.interrupt || task.plannedWeek !== state().week) continue
    if (isTaskBlocked(state(), task)) ctx.metrics.blockedPlanned++
  }
  const optionsAtStart = workOptions(ctx)
  if (optionsAtStart.length === 0) ctx.metrics.noWorkWeeks++
  observeWeek(ctx, optionsAtStart)

  const takeOption = (playerId: string): WorkOption | null => {
    const options = workOptions(ctx)
    let best: { option: WorkOption; score: number } | null = null
    for (const option of options) {
      const already = pledged.get(option.key) ?? 0
      if (already >= option.remaining) continue
      if (seatsLeft(option) <= 0) continue
      const contribution =
        option.target.kind === 'slot'
          ? cubesForSlot(state(), playerId, option.target.slotId)
          : cubesForTask(
              state(),
              playerId,
              state().board.find((t) => t.cardId === (option.target as { cardId: string }).cardId)!,
            )
      if (contribution <= 0) continue
      let score = option.priority + contribution * 2
      // ちょうど終わらせられるなら価値が高い
      if (already + contribution >= option.remaining) score += 20
      if (!best || score > best.score) best = { option, score }
    }
    if (!best) return null
    const contribution =
      best.option.target.kind === 'slot'
        ? cubesForSlot(state(), playerId, best.option.target.slotId)
        : cubesForTask(
            state(),
            playerId,
            state().board.find(
              (t) => t.cardId === (best!.option.target as { cardId: string }).cardId,
            )!,
          )
    pledged.set(best.option.key, (pledged.get(best.option.key) ?? 0) + contribution)
    workers.set(best.option.key, (workers.get(best.option.key) ?? 0) + 1)
    return best.option
  }

  for (const playerId of state().players.map((p) => p.id)) {
    const player = state().players.find((p) => p.id === playerId)!
    ctx.metrics.totalActions++

    // 疲労が限界に近ければ休む
    if (player.fatigue >= state().config.fatigueMax - 1) {
      tryAct(ctx, { type: 'ASSIGN_WORKER', playerId, target: { kind: 'rest' } })
      continue
    }

    const option = takeOption(playerId)
    if (option) {
      const targeted = option.target
      const wasEarly =
        targeted.kind === 'task' &&
        ctx.state.config.allowEarlyStart &&
        (() => {
          const t = ctx.state.board.find((b) => b.cardId === targeted.cardId)
          return !!t && isPrereqBlocked(ctx.state, t)
        })()
      const code = tryAct(ctx, { type: 'ASSIGN_WORKER', playerId, target: option.target })
      if (code === null) {
        productive++
        if (targeted.kind === 'task') {
          ctx.metrics.taskStarts++
          if (wasEarly) ctx.metrics.earlyStarts++
        }
      } else {
        if (code === 'TASK_BLOCKED') ctx.metrics.blockedAttempts++
        tryAct(ctx, { type: 'ASSIGN_WORKER', playerId, target: { kind: 'rest' } })
        ctx.metrics.idleActions++
      }
    } else {
      // 仕事がない:学習 → 消火 → 休憩
      const skill = ctx.learnUsedThisPhase < ctx.strategy.learnPerPhase ? learnTarget(ctx, playerId) : null
      if (skill && tryAct(ctx, { type: 'ASSIGN_WORKER', playerId, target: { kind: 'learn', skill } }) === null) {
        ctx.learnUsedThisPhase++
        productive++
        continue
      }
      const burning = state().board.find((t) => t.fire > 0)
      if (
        burning &&
        tryAct(ctx, {
          type: 'ASSIGN_WORKER',
          playerId,
          target: { kind: 'extinguish', cardId: burning.cardId },
        }) === null
      ) {
        productive++
        continue
      }
      tryAct(ctx, { type: 'ASSIGN_WORKER', playerId, target: { kind: 'rest' } })
      ctx.metrics.idleActions++
    }

    // 残業:まだ急ぎの仕事が残っていれば
    if (!ctx.strategy.useOvertime) continue
    const after = state().players.find((p) => p.id === playerId)!
    if (after.fatigue >= state().config.noOvertimeAtFatigue) continue
    const extra = takeOption(playerId)
    if (extra && extra.priority >= 80) {
      ctx.metrics.totalActions++
      if (
        tryAct(ctx, {
          type: 'ASSIGN_WORKER',
          playerId,
          target: extra.target,
          overtime: true,
        }) !== null
      ) {
        ctx.metrics.totalActions--
      }
    }
  }

  if (productive === 0) ctx.metrics.idleWeeks++

  // ② 着手可能だったのに誰も座らなかった仕事(選ばなかった道の数)
  for (const option of workOptions(ctx)) {
    if ((pledged.get(option.key) ?? 0) === 0) ctx.metrics.forgoneWork++
  }
}

// ═══════════════════════════════════════════════════════════
// 週末
// ═══════════════════════════════════════════════════════════

/** 実工数が公開されたタスクの上振れを記録する */
function measureEfforts(ctx: Ctx): void {
  for (const task of ctx.state.board) {
    if (task.interrupt || task.actualEffort === null) continue
    if (ctx.measured.has(task.cardId)) continue
    ctx.measured.add(task.cardId)
    const card = taskCardOf(ctx.state, task.cardId)
    if (!card) continue
    ctx.metrics.effortRevealed++
    ctx.metrics.effortOverrun += task.actualEffort - card.estimate
  }
}

/** 納品判断(RULES.md §2-3) */
function deliverTasks(ctx: Ctx): void {
  let progress = true
  let guard = 0
  while (progress && guard++ < 40) {
    progress = false
    for (const task of [...ctx.state.board]) {
      const needed = requiredCubes(ctx.state, task)
      if (task.cubes < needed) continue

      if (!task.interrupt) {
        const card = taskCardOf(ctx.state, task.cardId)
        if (!card) continue
        // Lv2 を求められていて、まだ積み増せる余地と時間があるなら待つ
        const wantLv2 =
          card.maxLevel === 2 &&
          ctx.strategy.quality !== 'fast' &&
          needsLevel2(ctx.state, card.slot, ctx.strategy)
        const hasOvershoot = task.cubes >= needed + ctx.state.config.qualityOvershoot
        const lastWeek = ctx.state.week >= ctx.state.config.roundsPerPhase
        if (wantLv2 && !hasOvershoot && !lastWeek) continue

        // 予算が足りなければ追加請求を試す
        if (ctx.state.budget < card.cost) {
          tryAct(ctx, { type: 'EXTRA_BILLING', playerId: ctx.state.pmPlayerId })
        }
        if (ctx.state.budget < card.cost) continue

        const level = hasOvershoot && card.maxLevel === 2 ? 2 : 1
        const planned = ctx.firstPlan.get(task.cardId)
        if (tryAct(ctx, { type: 'DELIVER_TASK', cardId: task.cardId }) === null) {
          if (level === 2) ctx.metrics.lv2Deliveries++
          else ctx.metrics.lv1Deliveries++
          // ① 計画遵守:最初に立てた予定週のうちに納品できたか
          if (planned) {
            ctx.metrics.trackedDeliveries++
            if (planned.phase === ctx.state.phase && planned.week >= ctx.state.week) {
              ctx.metrics.onTimeDeliveries++
            }
          }
          progress = true
        }
        continue
      }

      if (tryAct(ctx, { type: 'DELIVER_TASK', cardId: task.cardId }) === null) {
        ctx.metrics.interruptsResolved++
        progress = true
      }
    }
  }
}

/** 磨き込み(polish)を持つプレイヤーがいれば、Lv2 が要る Lv1 スロットに使う */
function usePolish(ctx: Ctx): void {
  for (const player of ctx.state.players) {
    const member = ctx.state.content.members.find((m) => m.id === player.memberId)
    if (member?.ability !== 'polish') continue
    if (player.abilityUsedPhase === ctx.state.phase) continue
    const target = ctx.state.slots.find(
      (s) => s.level === 1 && needsLevel2(ctx.state, s.slotId, ctx.strategy),
    )
    if (!target) continue
    if (tryAct(ctx, { type: 'USE_ABILITY', playerId: player.id, slotId: target.slotId }) === null) {
      ctx.metrics.upgrades++
    }
  }
}

/** 謝絶の判断(RULES.md §8-4) */
function considerDecline(ctx: Ctx): void {
  const { strategy } = ctx
  if (strategy.decline === 'never') return
  const pm = ctx.state.pmPlayerId

  const laneCount = () => ctx.state.board.filter((t) => t.interrupt !== null).length
  const nearFull = () => laneCount() >= ctx.state.config.interruptCapacity - 1
  if (strategy.decline === 'nearOverflow' && !nearFull()) return

  // 価値の低い順に断る:相談ごと → 要らないスロットの手戻り
  const shed = ctx.state.board
    .filter((t) => t.interrupt !== null)
    .filter((t) => {
      if (t.interrupt === 'consult') return true
      if (t.interrupt === 'rework' && t.targetSlotId) {
        return slotUrgency(ctx.state, t.targetSlotId, strategy) === 0
      }
      return false
    })
    .sort((a, b) => a.placedSeq - b.placedSeq)

  for (const card of shed) {
    if (strategy.decline === 'nearOverflow' && !nearFull()) break
    if (tryAct(ctx, { type: 'DECLINE_INTERRUPT', playerId: pm, cardId: card.cardId }) === null) {
      ctx.metrics.declines++
    }
  }
}

// ═══════════════════════════════════════════════════════════
// イベント選択(RULES.md §7-2)
// ═══════════════════════════════════════════════════════════

function chooseChoice(ctx: Ctx, card: EventCard): string | undefined {
  const choices = card.choices
  if (!choices || choices.length === 0) return undefined
  const { state, strategy } = ctx
  const has = (id: string) => choices.some((c) => c.id === id)
  const laneFull =
    state.board.filter((t) => t.interrupt !== null).length >= state.config.interruptCapacity - 1

  switch (card.id) {
    case 'ev-help-other':
      // 貸し借りは CS+1。ただし割り込みが詰まっているときは自陣を守る
      return laneFull && has('decline') ? 'decline' : 'accept'
    case 'ev-client-review-wait':
      // 待つのはタダ。急いでいる戦略だけ押し切る
      return strategy.quality === 'fast' && state.budget > 8 && has('push') ? 'push' : 'wait'
    case 'ev-add-request-style':
    case 'ev-add-request-cms': {
      if (strategy.betters === 'drop') return has('decline') ? 'decline' : choices[0]!.id
      if (strategy.betters === 'chase' && has('must')) return 'must'
      if (has('better')) return 'better'
      return choices[0]!.id
    }
    case 'ev-spec-change':
      // 予算に余裕があれば買い取って手戻りを避ける
      return state.budget >= 8 && has('negotiate') ? 'negotiate' : 'accept'
    case 'ev-bug-report':
      if (strategy.interrupts === 'never') return has('watch') ? 'watch' : choices[0]!.id
      return has('fix') ? 'fix' : choices[0]!.id
    case 'ev-quality-audit': {
      const risky = state.slots.filter((s) => s.qualityRisk).length
      return risky >= 2 && state.budget >= 6 && has('prepare') ? 'prepare' : 'accept'
    }
    default:
      return choices[0]!.id
  }
}

/** 解決待ちイベントをすべて処理する */
function resolvePending(ctx: Ctx): void {
  let guard = 0
  while (ctx.state.pendingEvent !== null && ctx.state.result === null && guard++ < 30) {
    const pending = ctx.state.pendingEvent
    if (pending.kind === 'limit') {
      if (tryAct(ctx, { type: 'RESOLVE_EVENT' }) !== null) break
      continue
    }
    const card = ctx.state.content.events.find((e) => e.id === pending.cardId)
    if (!card) {
      if (tryAct(ctx, { type: 'RESOLVE_EVENT' }) !== null) break
      continue
    }
    const choiceId = chooseChoice(ctx, card)
    let code = tryAct(ctx, { type: 'RESOLVE_EVENT', ...(choiceId ? { choiceId } : {}) })
    if (code !== null && card.choices) {
      // 選べない選択肢だったので、通るものを順に試す
      for (const fallback of card.choices) {
        code = tryAct(ctx, { type: 'RESOLVE_EVENT', choiceId: fallback.id })
        if (code === null) break
      }
    }
    if (code !== null) break
  }
}

/** 割り込みの発生数を数える(あふれた=盤に乗らなかったぶんはログから拾う) */
function trackInterrupts(ctx: Ctx): void {
  for (const task of ctx.state.board) {
    if (task.interrupt === null) continue
    if (!ctx.seenInterrupts.has(task.cardId)) {
      ctx.seenInterrupts.add(task.cardId)
      ctx.metrics.interruptsSpawned++
    }
  }
}

// ═══════════════════════════════════════════════════════════
// 本体
// ═══════════════════════════════════════════════════════════

function emptyMetrics(strategy: string, seed: number): GameMetrics {
  return {
    strategy,
    seed,
    outcome: 'lose',
    finalCs: 0,
    survived: false,
    phasesPlayed: 0,
    weeksPlayed: 0,
    mustTotal: 0,
    mustMet: 0,
    betterTotal: 0,
    betterMet: 0,
    trustBonuses: 0,
    scopeDemotes: 0,
    scopeDrops: 0,
    interruptsSpawned: 0,
    interruptsResolved: 0,
    declines: 0,
    overflows: 0,
    blockedAttempts: 0,
    blockedPlanned: 0,
    noWorkWeeks: 0,
    idleActions: 0,
    totalActions: 0,
    idleWeeks: 0,
    carryOvers: 0,
    onTimeDeliveries: 0,
    trackedDeliveries: 0,
    replans: 0,
    overloadedWeeks: 0,
    demandSupplySum: 0,
    contentionWeeks: 0,
    specialistContentionWeeks: 0,
    forgoneWork: 0,
    lv1Deliveries: 0,
    lv2Deliveries: 0,
    upgrades: 0,
    effortOverrun: 0,
    effortRevealed: 0,
    qualityRiskLeft: 0,
    foundationLv2: 0,
    foundationBoosts: 0,
    riskMarkers: 0,
    riskFromOverload: 0,
    riskFromEarlyStart: 0,
    riskFromOverrun: 0,
    riskFromInterruptNeglect: 0,
    outbreaks: 0,
    earlyStarts: 0,
    taskStarts: 0,
    missingRevealed: 0,
    debtCreated: 0,
    debtSpawned: 0,
  }
}

/**
 * 負債の発生を数える(v6 提案 §4-1)。
 * Lv1 納品・炎上・スコープ緩和が、次フェーズに出てくる負債を積む。
 */
function accrueDebt(ctx: Ctx): void {
  if (ctx.debtMode === 'off') return
  const opts = ctx.debtOpts

  // 炎上(前回数えた分からの増分)
  const outbreaks = ctx.tally.outbreaks + ctx.tally.slotOutbreaks
  if (outbreaks > ctx.seenOutbreaks) {
    const added = (outbreaks - ctx.seenOutbreaks) * opts.onOutbreak
    ctx.debt.pending += added
    ctx.debt.created += added
    ctx.seenOutbreaks = outbreaks
  }

  // Lv1 納品(このゲームでの累計との差分)
  const lv1 = ctx.metrics.lv1Deliveries
  if (lv1 > ctx.seenLv1) {
    const added = (lv1 - ctx.seenLv1) * opts.onLv1Delivery
    ctx.debt.pending += added
    ctx.debt.created += added
    ctx.seenLv1 = lv1
  }

  // スコープ緩和(Must の格下げ・見送り)
  const relief = ctx.metrics.scopeDemotes
  if (relief > ctx.seenRelief) {
    const added = (relief - ctx.seenRelief) * opts.onScopeRelief
    ctx.debt.pending += added
    ctx.debt.created += added
    ctx.seenRelief = relief
  }
}

/** 1ゲームを最後まで打って計測結果を返す */
/**
 * `engineSlots: ['auto']` を、そのランで有効な基盤ボーナスの対象スロットに解決する。
 * モードを振り替えても、エンジンビルド戦略が狙う先が自動で追随する。
 */
function resolveStrategy(strategy: Strategy, foundation: FoundationMode): Strategy {
  if (strategy.engineSlots?.[0] !== 'auto') return strategy
  return { ...strategy, engineSlots: foundationSlots(foundation) }
}

export function playGame(
  base: Strategy,
  seed: number,
  config?: Partial<GameConfig>,
  inflow: InflowMode = 'experience',
  demand: DemandMode = 'base',
  deps: DependencyMode = 'serial',
  workerLimit: WorkerLimitMode = 'none',
  foundation: FoundationMode = 'off',
  foundationAmount = 1,
  risk: RiskOptions | null = null,
  draft: DraftMode = 'open',
  debtMode: DebtMode = 'off',
  debtOpts: DebtOptions = DEFAULT_DEBT,
): GameMetrics {
  const strategy = resolveStrategy(base, foundation)
  const metrics = emptyMetrics(strategy.name, seed)
  const setup = applyAction(createInitialState(), {
    type: 'SETUP_GAME',
    seed,
    players: PLAYER_IDS.map((id, i) => ({ id, name: `P${i + 1}` })),
    pmPlayerId: PLAYER_IDS[0]!,
    ...(config ? { config } : {}),
  })
  if (isRuleViolation(setup)) throw new Error(`セットアップ失敗: ${setup.message}`)

  const ctx: Ctx = {
    state: applyDependencyMode(applyDemandMode(applyInflowMode(setup, inflow), demand), deps),
    strategy,
    metrics,
    measured: new Set(),
    learnUsedThisPhase: 0,
    seenInterrupts: new Set(),
    firstPlan: new Map(),
    workerLimit,
    foundation,
    foundationAmount,
    foundationApplied: new Set(),
    risk,
    tally: emptyTally(),
    weekCubes: new Map(),
    weekInterrupts: new Set(),
    draft,
    hiddenCards: new Set(),
    debtMode,
    debtOpts,
    debt: emptyDebtTally(),
    seenOutbreaks: 0,
    seenLv1: 0,
    seenRelief: 0,
  }

  let guard = 0
  while (ctx.state.result === null && guard++ < 400) {
    // 基盤成果物が Lv2 になったら、対応する系統に恒久の工数減を配る(v6 提案 §5)
    const boost = applyFoundationBonuses(
      ctx.state,
      ctx.foundation,
      ctx.foundationAmount,
      ctx.foundationApplied,
    )
    ctx.state = boost.state
    metrics.foundationBoosts += boost.boosted

    // ワイヤーフレーム Lv2:実工数が着手前に分かるようになる(v6 提案 §5-1)。
    // 工数は減らないが、見積の外れを知ってから配置を決められる
    if (
      !ctx.state.config.earlyEffortReveal &&
      uncertaintyActive(ctx.state, ctx.foundation, 'effortForesight')
    ) {
      ctx.state = {
        ...ctx.state,
        config: { ...ctx.state.config, earlyEffortReveal: true },
      }
    }

    if (ctx.state.pendingEvent !== null) {
      resolvePending(ctx)
      trackInterrupts(ctx)
      continue
    }
    switch (ctx.state.step) {
      case 'scope_meeting': {
        ctx.learnUsedThisPhase = 0
        // v6 §4-2:前フェーズに溜まった負債が、返済しきれず仕事として戻ってくる
        ctx.state = spawnDebtCards(ctx.state, ctx.debtMode, ctx.debtOpts, ctx.debt)
        // v6 §3-2:候補の一部が伏せ札に回る。要件定義書 Lv2 なら公開枚数が増える(§3-4)
        const revealBonus = uncertaintyActive(ctx.state, ctx.foundation, 'draftReveal') ? 2 : 0
        ctx.state = hideDraftCards(ctx.state, ctx.draft, ctx.hiddenCards, revealBonus)
        negotiateScope(ctx)
        // v6 §3-3:埋める道が無くなったスロットは「抜け漏れ」として割り込みで噴き出す
        ctx.state = revealMissingCards(ctx.state, ctx.hiddenCards, 1, ctx.debt)
        planTasks(ctx)
        if (tryAct(ctx, { type: 'FINISH_SCOPE', playerId: ctx.state.pmPlayerId }) !== null) {
          guard = 400
        }
        break
      }
      case 'standup': {
        metrics.weeksPlayed++
        ctx.weekCubes = snapshotCubes(ctx.state)
        ctx.weekInterrupts = new Set(
          ctx.state.board.filter((t) => t.interrupt !== null).map((t) => t.placedSeq),
        )
        considerDecline(ctx)
        assignWeek(ctx)
        for (const player of ctx.state.players.map((p) => p.id)) {
          if (tryAct(ctx, { type: 'DECLARE_READY', playerId: player }) !== null) {
            // 未配属で拒否された場合は休憩を入れてから宣言する
            tryAct(ctx, { type: 'ASSIGN_WORKER', playerId: player, target: { kind: 'rest' } })
            tryAct(ctx, { type: 'DECLARE_READY', playerId: player })
          }
          if (ctx.state.pendingEvent !== null) resolvePending(ctx)
          if (ctx.state.result !== null) break
        }
        measureEfforts(ctx)
        break
      }
      case 'weekend': {
        measureEfforts(ctx)
        const beforeDelivery = ctx.state
        deliverTasks(ctx)
        // v6 提案 §2-1:納品してもマーカーは消えず、スロットへ引き継がれる
        if (ctx.risk) carryRiskToSlots(beforeDelivery, ctx.state, ctx.risk, ctx.tally)
        usePolish(ctx)
        considerDecline(ctx)
        // v6 提案 §2-2:今週のふるまいからリスクマーカーを置き、閾値に達したものを炎上させる。
        // 盤面がまだ今週のうちに走らせる必要があるので END_WEEKEND の直前に呼ぶ
        if (ctx.risk) {
          const early = collectEarlyStarts(ctx.state, ctx.weekCubes)
          ctx.state = applyWeekendRisks(
            ctx.state,
            ctx.risk,
            ctx.tally,
            early,
            ctx.weekInterrupts,
            // サイトマップ Lv2:前倒し着手が汚れなくなる(v6 提案 §5-1)
            uncertaintyActive(ctx.state, ctx.foundation, 'earlyStartSafe'),
          )
        }
        accrueDebt(ctx)
        const before = ctx.state.week
        if (tryAct(ctx, { type: 'END_WEEKEND', playerId: ctx.state.pmPlayerId }) !== null) {
          guard = 400
          break
        }
        resolvePending(ctx)
        trackInterrupts(ctx)
        if (ctx.state.result !== null) break
        if (ctx.state.step === 'weekend') {
          replan(ctx)
          if (tryAct(ctx, { type: 'END_WEEKEND', playerId: ctx.state.pmPlayerId }) !== null) {
            guard = 400
          }
        }
        if (ctx.state.week !== before) {
          metrics.carryOvers += ctx.state.log.filter((l) =>
            l.message.includes('繰り越し'),
          ).length
        }
        break
      }
      case 'phase_end': {
        metrics.phasesPlayed = ctx.state.phase
        if (tryAct(ctx, { type: 'ADVANCE_PHASE' }) !== null) guard = 400
        break
      }
      default:
        guard = 400
    }
  }

  // ── 集計 ──
  const final = ctx.state
  metrics.outcome = final.result?.outcome ?? 'lose'
  metrics.finalCs = final.cs
  metrics.survived = final.log.some((l) => l.message.includes('最終検収'))
  metrics.phasesPlayed = Math.max(metrics.phasesPlayed, final.phase)
  metrics.qualityRiskLeft = final.slots.filter((s) => s.qualityRisk).length
  metrics.foundationLv2 = foundationLv2Count(final, foundation)
  const t = ctx.tally
  metrics.riskFromOverload = t.fromOverload
  metrics.riskFromEarlyStart = t.fromEarlyStart
  metrics.riskFromOverrun = t.fromOverrun
  metrics.riskFromInterruptNeglect = t.fromInterruptNeglect
  metrics.riskMarkers =
    t.fromOverload +
    t.fromEarlyStart +
    t.fromOverrun +
    t.fromInterruptNeglect +
    t.fromLv1Delivery
  metrics.outbreaks = t.outbreaks + t.slotOutbreaks
  metrics.missingRevealed = ctx.debt.missingRevealed
  metrics.debtCreated = ctx.debt.created
  metrics.debtSpawned = ctx.debt.spawned
  metrics.trustBonuses = final.log.filter((l) => l.message.includes('信頼ボーナス')).length
  metrics.overflows = final.log.filter((l) => l.message.includes('あふれた')).length
  metrics.interruptsSpawned += metrics.overflows
  metrics.carryOvers = final.log.filter((l) => l.message.includes('繰り越し')).length
  metrics.upgrades += final.log.filter((l) => l.message.includes('Lv2 に改修')).length

  // 「お客様がもともと何を必須と言っていたか」で数える(交渉での格下げに左右されない)
  for (const req of final.requirements) {
    const card = final.content.requirements.find((r) => r.id === req.requirementId)
    if (!card) continue
    const met = req.settledOutcome === 'met' || req.met
    if (card.tier === 'must') {
      metrics.mustTotal++
      if (met) metrics.mustMet++
    } else {
      metrics.betterTotal++
      if (met) metrics.betterMet++
    }
  }

  return metrics
}
