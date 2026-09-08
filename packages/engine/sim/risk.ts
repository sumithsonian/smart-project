/**
 * リスクマーカーと炎上(v6 提案 §2 の検証用)
 *
 * v6 は🔥(炎上)と⚠(品質リスク)を **1種類のリスクマーカー**に統合し、
 * 「増えるのは仕事の枚数ではなく、手戻り・認識のズレ・再調整の手間」を表現する。
 *
 * ここでは **BoardTask.fire をリスクマーカーとして流用する**。
 * v5 の🔥はすでに「1個 = 必要工数 +1」「N個目で延焼」という同型の仕組みなので、
 * 変えるのは **発生条件** と **炎上したときの効果** だけで済む。
 *
 * そのため測定時は次の GameConfig を組み合わせる:
 *   firePerRound: 0            週初の炎上カードドローを止める(v6 §6)
 *   fireOutbreakThreshold: 99  エンジン側の延焼を止め、炎上はここで裁く
 *
 * スロット側のリスクは、v5.1 の `qualityRisk`(真偽値)をそのまま使う。
 * 個数を持たせるのは提案 §2-1 の姿だが、それはエンジンの型変更になるため、
 * ここでは「Lv1 納品 = リスクあり」の1段階で近似する(§9 の未決事項)。
 */
import type { GameState } from '../src/types'
import { getTaskCard, isPrereqBlocked } from '../src/helpers'
import { weekLoad } from '../src/helpers'

/** リスクマーカーの設定(v6 提案 §7 の GameConfig 追加分に対応) */
export interface RiskOptions {
  /** 無理な週次計画(系統ごと。予定工数 > 供給能力だった週) */
  onOverload: number
  /** 品質リスクを残した納品(Lv1 で納めたスロットへ。v6 提案 §2-2 の 2) */
  onLv1Delivery: number
  /** 前倒し着手(前提未達のまま着手した週ごと) */
  onEarlyStart: number
  /** 実工数が見積を上回った */
  onOverrun: number
  /** 割り込みを1週越した */
  onInterruptNeglect: number
  /** 何個で炎上するか */
  outbreakThreshold: number
  /** 炎上時:対象の必要工数の恒久増 */
  outbreakEffort: number
  /** 炎上時:後続タスクへ飛ぶリスク */
  outbreakSuccessorRisk: number
  /** 炎上時:CS 減 */
  outbreakCs: number
}

/** 提案 §7 のたたき台 */
export const DEFAULT_RISK: RiskOptions = {
  onOverload: 1,
  onLv1Delivery: 1,
  onEarlyStart: 1,
  onOverrun: 1,
  onInterruptNeglect: 1,
  outbreakThreshold: 3,
  outbreakEffort: 1,
  outbreakSuccessorRisk: 1,
  outbreakCs: 1,
}

/** リスクの発生と炎上の集計 */
export interface RiskTally {
  /** 置かれたリスクマーカーの総数(発生条件別) */
  fromOverload: number
  fromEarlyStart: number
  fromOverrun: number
  fromInterruptNeglect: number
  fromLv1Delivery: number
  /** 炎上した回数 */
  outbreaks: number
  /** 前倒しで着手した延べタスク週 */
  earlyStarts: number
  /** 工数超過でリスクを置き済みのタスク(1ゲーム内で1回だけ置く) */
  overrunSeen: Set<number>
  /**
   * スロットに引き継がれたリスクマーカー(v6 提案 §2-1)。
   * 納品するとタスク上のマーカーは**消えずにスロットへ移る**。
   * これが無いと納品のたびに連鎖が切れ、炎上がほぼ起きない。
   */
  slotRisk: Map<string, number>
  /** 前提スロットのリスクを反映済みの (タスク, スロット) の組 */
  prereqApplied: Set<string>
  /** スロット側で炎上した回数 */
  slotOutbreaks: number
}

export function emptyTally(): RiskTally {
  return {
    fromOverload: 0,
    fromEarlyStart: 0,
    fromOverrun: 0,
    fromInterruptNeglect: 0,
    fromLv1Delivery: 0,
    outbreaks: 0,
    earlyStarts: 0,
    overrunSeen: new Set(),
    slotRisk: new Map(),
    prereqApplied: new Set(),
    slotOutbreaks: 0,
  }
}

/**
 * 納品されたタスクのリスクマーカーを、埋まったスロットへ引き継ぐ(v6 提案 §2-1)。
 * 納品の**直前と直後**の盤面を渡すと、消えたタスクぶんを拾って移す。
 */
export function carryRiskToSlots(
  before: GameState,
  after: GameState,
  opts: RiskOptions,
  tally: RiskTally,
): void {
  const stillOnBoard = new Set(after.board.map((t) => t.placedSeq))
  for (const task of before.board) {
    if (stillOnBoard.has(task.placedSeq)) continue
    const slotId = task.interrupt ? task.targetSlotId : getTaskCard(before.content, task.cardId)?.slot
    if (!slotId) continue
    const level = after.slots.find((s) => s.slotId === slotId)?.level ?? 0
    // Lv2 で納めたなら、そのスロットのリスクは一括で返済される(v6 提案 §2-6)
    if (level >= 2) {
      tally.slotRisk.set(slotId, 0)
      continue
    }
    // ② 品質リスクを残した納品:Lv1 で納めたスロットへ1個(v6 提案 §2-2 の 2)
    let added = task.fire
    if (level === 1 && !task.interrupt) {
      added += opts.onLv1Delivery
      tally.fromLv1Delivery += opts.onLv1Delivery
    }
    if (added <= 0) continue
    tally.slotRisk.set(slotId, (tally.slotRisk.get(slotId) ?? 0) + added)
  }
}

/** そのタスクにリスクマーカーを n 個置く */
function addRisk(state: GameState, placedSeq: number, n: number): GameState {
  if (n <= 0) return state
  return {
    ...state,
    board: state.board.map((t) => (t.placedSeq === placedSeq ? { ...t, fire: t.fire + n } : t)),
  }
}

/**
 * 週末に、その週のふるまいからリスクマーカーを置く(v6 提案 §2-2 の 1・3・4・5)。
 *
 * 2(Lv1 納品)は納品の瞬間に効くので、エンジンの `qualityRisk` がそのまま担う。
 * ここは **END_WEEKEND を押す直前**、まだ今週の盤面が残っている時点で呼ぶ。
 */
export function applyWeekendRisks(
  state: GameState,
  opts: RiskOptions,
  tally: RiskTally,
  /** 今週、前提未達のまま着手されたタスクの placedSeq */
  earlyStarted: Set<number>,
  /** 先週すでに盤上にあった割り込みの placedSeq */
  carriedInterrupts: Set<number>,
  /**
   * 前倒し着手にリスクマーカーを付けないか(サイトマップ Lv2 の恩恵。v6 提案 §5-1)。
   * 工数は減らないが、**着手順の不確実性が消える**ぶん置き場所が安全に増える。
   */
  earlyStartExempt = false,
): GameState {
  let next = state

  // ── ① 無理な週次計画:過負荷だった系統ごとに、いちばん遅れているタスクへ1個 ──
  if (opts.onOverload > 0) {
    const { planned, capacity } = weekLoad(next, next.week)
    for (const skill of ['direction', 'design', 'engineering'] as const) {
      if (planned[skill] <= capacity[skill]) continue
      const victim = next.board
        .filter((t) => {
          if (t.interrupt || t.plannedWeek !== next.week) return false
          return getTaskCard(next.content, t.cardId)?.skill === skill
        })
        // 進捗率がいちばん低いもの(= いちばん置いてけぼりのタスク)
        .sort((a, b) => a.cubes - b.cubes)[0]
      if (!victim) continue
      next = addRisk(next, victim.placedSeq, opts.onOverload)
      tally.fromOverload += opts.onOverload
    }
  }

  // ── ③ 前倒し着手:前提が未達のまま座られたタスクへ1個 ──
  if (opts.onEarlyStart > 0 && !earlyStartExempt) {
    for (const seq of earlyStarted) {
      next = addRisk(next, seq, opts.onEarlyStart)
      tally.fromEarlyStart += opts.onEarlyStart
    }
  }

  // ── ④ 工数超過:実工数が見積を上回ったタスクへ1個(公開された週に1回) ──
  if (opts.onOverrun > 0) {
    for (const task of next.board) {
      if (task.interrupt || task.actualEffort === null) continue
      const card = getTaskCard(next.content, task.cardId)
      if (!card || task.actualEffort <= card.estimate) continue
      if (!earlyStarted.has(task.placedSeq) && task.cubes === 0) continue
      // 公開はその週の週末に1回だけなので、公開直後の週だけを拾う
      if (tally.overrunSeen.has(task.placedSeq)) continue
      tally.overrunSeen.add(task.placedSeq)
      next = addRisk(next, task.placedSeq, opts.onOverrun)
      tally.fromOverrun += opts.onOverrun
    }
  }

  // ── ⑤ 割り込みの放置:先週から残っている未着手の割り込みへ1個 ──
  if (opts.onInterruptNeglect > 0) {
    for (const task of next.board) {
      if (!task.interrupt) continue
      if (!carriedInterrupts.has(task.placedSeq)) continue
      if (task.cubes > 0) continue
      next = addRisk(next, task.placedSeq, opts.onInterruptNeglect)
      tally.fromInterruptNeglect += opts.onInterruptNeglect
    }
  }

  // ── ② 雑な土台:前提スロットに溜まったリスクを、後続タスクへ写す(v6 提案 §2-5)──
  for (const task of next.board) {
    if (task.interrupt) continue
    const card = getTaskCard(next.content, task.cardId)
    if (!card) continue
    for (const slotId of card.prerequisiteSlots) {
      const held = tally.slotRisk.get(slotId) ?? 0
      if (held <= 0) continue
      const key = `${task.placedSeq}:${slotId}`
      if (tally.prereqApplied.has(key)) continue
      tally.prereqApplied.add(key)
      next = addRisk(next, task.placedSeq, held)
    }
  }

  next = resolveSlotOutbreaks(next, opts, tally)
  return resolveOutbreaks(next, opts, tally)
}

/**
 * スロットに溜まったリスクが閾値に達したら炎上させる(v6 提案 §2-4)。
 * タスク側と違い、対象は**納品済みの成果物**なので、効果は後続と CS に出る。
 */
function resolveSlotOutbreaks(
  state: GameState,
  opts: RiskOptions,
  tally: RiskTally,
): GameState {
  let next = state
  for (const [slotId, count] of tally.slotRisk) {
    if (count < opts.outbreakThreshold) continue
    tally.slotOutbreaks++
    tally.slotRisk.set(slotId, count - opts.outbreakThreshold)
    const successors = next.board
      .filter((t) => {
        if (t.interrupt) return false
        return getTaskCard(next.content, t.cardId)?.prerequisiteSlots.includes(slotId)
      })
      .map((t) => t.placedSeq)
    next = {
      ...next,
      cs: next.cs - opts.outbreakCs,
      board: next.board.map((t) =>
        successors.includes(t.placedSeq)
          ? { ...t, fire: t.fire + opts.outbreakSuccessorRisk }
          : t,
      ),
    }
  }
  return next
}

/**
 * 閾値に達したタスクを炎上させる(v6 提案 §2-4)。
 *  1. 必要工数 +1(恒久 = effortReduction を負に振る)
 *  2. 後続タスクへリスク +1
 *  3. CS -1
 *  4. リスクマーカーを閾値ぶん取り除く
 */
function resolveOutbreaks(state: GameState, opts: RiskOptions, tally: RiskTally): GameState {
  let next = state
  let guard = 0
  while (guard++ < 20) {
    const hot = next.board.find((t) => t.fire >= opts.outbreakThreshold)
    if (!hot) break
    tally.outbreaks++

    // 後続 = そのタスクが埋めるスロットを前提に持つ、盤上のタスク
    const card = getTaskCard(next.content, hot.cardId)
    const slotId = hot.interrupt ? hot.targetSlotId : (card?.slot ?? null)
    const successors = new Set<number>()
    if (slotId && opts.outbreakSuccessorRisk > 0) {
      for (const t of next.board) {
        if (t.interrupt || t.placedSeq === hot.placedSeq) continue
        const c = getTaskCard(next.content, t.cardId)
        if (c?.prerequisiteSlots.includes(slotId)) successors.add(t.placedSeq)
      }
    }

    next = {
      ...next,
      cs: next.cs - opts.outbreakCs,
      board: next.board.map((t) => {
        if (t.placedSeq === hot.placedSeq) {
          return {
            ...t,
            fire: t.fire - opts.outbreakThreshold,
            effortReduction: t.effortReduction - opts.outbreakEffort,
          }
        }
        if (successors.has(t.placedSeq)) {
          return { ...t, fire: t.fire + opts.outbreakSuccessorRisk }
        }
        return t
      }),
    }
  }
  return next
}

/** 今週、前提が未達のまま着手されたタスクを拾う */
export function collectEarlyStarts(state: GameState, before: Map<number, number>): Set<number> {
  const found = new Set<number>()
  for (const task of state.board) {
    if (task.interrupt) continue
    if (!isPrereqBlocked(state, task)) continue
    const prev = before.get(task.placedSeq) ?? 0
    if (task.cubes > prev) found.add(task.placedSeq)
  }
  return found
}

/** 週初の積みキューブ数を控える(前倒し着手の検出用) */
export function snapshotCubes(state: GameState): Map<number, number> {
  return new Map(state.board.map((t) => [t.placedSeq, t.cubes]))
}
