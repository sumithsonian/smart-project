/**
 * フェーズドラフトと抜け漏れ、デッキ汚染(v6 提案 §3・§4 の検証用)
 *
 * §10-5 で残った未達 ②⑤⑧ は「**供給過多**」という同じ根に集まっていた。
 *   ② 成り行きが最強(63.6%)/ ⑤ 無仕事週 13.7〜16.0% / ⑧ 需要/供給 0.53
 * §3 と §4 は、どちらも**仕事を増やし、選択肢を減らす**道具なのでここで測る。
 *
 * エンジンの公開 API は変えていない。盤面とデッキを直接組み替えている。
 */
import type { BoardTask, GameState, TaskCard } from '../src/types'
import { getTaskCard } from '../src/helpers'

// ═══════════════════════════════════════════════════════════
// §3 フェーズドラフト — 20枚中15枚しか見えない
// ═══════════════════════════════════════════════════════════

/** ドラフトの見え方 */
export type DraftMode =
  /** 全部見える(v5.1 現行。候補プールは常時 draftPool 枚) */
  | 'open'
  /** 一部が伏せ札に回る。伏せられた必須カードは実行フェーズで「抜け漏れ」として発覚する */
  | 'hidden'

/** 伏せ札に回す枚数の割合(20枚中5枚 = 0.25。v6 提案 §3-2) */
const HIDDEN_SHARE = 0.25

/**
 * フェーズ開始時に、見えている候補の一部を伏せ札に回す(v6 提案 §3-2)。
 *
 * 「20枚の山のうち15枚だけ公開」の効果は、**選べる候補が減ること**。
 * エンジンの候補プール(`taskPool`)がそのまま「見えているもの」なので、
 * ここから一定割合を抜いて伏せ札に持つ。
 * すべての道が塞がったスロットは §3-3 の「抜け漏れ」になる。
 *
 * 山の並びは `buildDeck` がシード付き乱数でシャッフル済みなので、
 * 末尾から抜くだけでシードによる再現性は保たれる。
 *
 * @param revealBonus 要件定義書 Lv2 による公開枚数の上乗せ(§3-4)。伏せる枚数をこの数だけ減らす
 */
export function hideDraftCards(
  state: GameState,
  mode: DraftMode,
  hidden: Set<string>,
  revealBonus: number,
): GameState {
  if (mode === 'open') return state

  const pool = [...state.taskPool]
  const hideCount = Math.max(0, Math.round(pool.length * HIDDEN_SHARE) - revealBonus)
  if (hideCount <= 0) return state

  const kept = pool.slice(0, pool.length - hideCount)
  for (const id of pool.slice(pool.length - hideCount)) hidden.add(id)

  return { ...state, taskPool: kept }
}

/**
 * 抜け漏れの発覚(v6 提案 §3-3)。
 *
 * 「そのスロットを埋める道が、公開されている中に1本も無い」かつ
 * 「そのスロットを前提とする仕事がまだ残っている」とき、
 * 伏せ札から1枚が**割り込みとして**盤面に出る(「これ、聞いてないんですけど」)。
 *
 * - 必要工数は見積 + `missingCardEffortPenalty`
 * - リスクマーカー1個付きで出る
 */
export function revealMissingCards(
  state: GameState,
  hidden: Set<string>,
  effortPenalty: number,
  tally: { missingRevealed: number },
): GameState {
  if (hidden.size === 0) return state
  let next = state

  for (const cardId of [...hidden]) {
    const card = getTaskCard(next.content, cardId)
    if (!card) continue
    // そのスロットがもう埋まっているなら、抜け漏れではない
    const slot = next.slots.find((s) => s.slotId === card.slot)
    if (slot && slot.level >= 1) {
      hidden.delete(cardId)
      continue
    }
    // 公開されている中に、同じスロットを埋める道が残っていれば発覚しない
    const alternative = [...next.taskPool, ...next.decks.tasks.drawPile].some(
      (id) => getTaskCard(next.content, id)?.slot === card.slot,
    )
    if (alternative) continue
    // そのスロットを前提にする仕事が残っていなければ、まだ困っていない
    const needed = next.content.tasks.some(
      (t) => t.prerequisiteSlots.includes(card.slot) && t.phase <= next.phase + 1,
    )
    if (!needed) continue

    hidden.delete(cardId)
    tally.missingRevealed++
    next = spawnInterrupt(next, {
      kind: 'rework',
      effort: card.estimate + effortPenalty,
      skill: card.skill,
      targetSlotId: null,
      fire: 1,
    })
  }
  return next
}

// ═══════════════════════════════════════════════════════════
// §4 デッキ汚染 — 負債カードが選択肢を薄め、仕事を増やす
// ═══════════════════════════════════════════════════════════

/** 負債カードの行き先 */
export type DebtMode =
  /** 汚染なし(v5.1 現行) */
  | 'off'
  /**
   * 負債を**割り込みレーン**に出す。返さないと枠を食い、あふれれば CS を失う。
   * 測っているのは負債の**経済的な重さ**で、「選択肢が薄まる」体験ではない。
   */
  | 'interrupt'
  /**
   * 負債を**候補プールに混ぜる**(v6 提案 §4-2 の本来の姿 = デッキ汚染)。
   * プールの枚数は `draftPool` で頭打ちなので、負債が居座るぶん
   * **選べる正味のタスクが減る**。クランク! / ドミニオンの呪い札と同じ効き方。
   */
  | 'pool'
  /** 両方 */
  | 'both'

/** 負債の設定(v6 提案 §7 の GameConfig 追加分) */
export interface DebtOptions {
  /** Lv1 で納品した1件につき */
  onLv1Delivery: number
  /** 炎上1回につき */
  onOutbreak: number
  /** Must の見送り・期限延長1回につき */
  onScopeRelief: number
  /** 負債カード1枚の必要工数 */
  effort: number
}

export const DEFAULT_DEBT: DebtOptions = {
  onLv1Delivery: 1,
  onOutbreak: 1,
  onScopeRelief: 1,
  effort: 2,
}

/** 負債の集計 */
export interface DebtTally {
  /** 溜まっている未返済の負債(次フェーズに出てくる) */
  pending: number
  /** これまでに生まれた負債カードの総数 */
  created: number
  /** 実際に盤面へ出た負債カードの数 */
  spawned: number
  /** 抜け漏れが発覚した数(§3-3) */
  missingRevealed: number
}

export function emptyDebtTally(): DebtTally {
  return { pending: 0, created: 0, spawned: 0, missingRevealed: 0 }
}

/**
 * フェーズ開始時に、溜まった負債を盤面へ出す(v6 提案 §4-2)。
 *
 * 提案は「次フェーズのドラフト山に混ぜて選択肢を薄める」だが、
 * ボットは薄まった山を「選びにくい」とは感じず、単に無視してしまう。
 * ここでは負債の**経済的な重さ**を測るため、**割り込みレーンに出す**形にしている
 * (返さないと枠を食い、あふれれば CS を失い、謝絶もできる)。
 * 「選択肢が薄まる」体験そのものは盤面の見え方の話なので、シムでは測れない(§9 の未決)。
 */
export function spawnDebtCards(
  state: GameState,
  mode: DebtMode,
  opts: DebtOptions,
  tally: DebtTally,
): GameState {
  if (mode === 'off' || tally.pending <= 0) return state
  let next = state
  const count = tally.pending
  tally.pending = 0

  for (let i = 0; i < count; i++) {
    tally.spawned++
    if (mode === 'interrupt' || mode === 'both') {
      next = spawnInterrupt(next, {
        kind: 'rework',
        effort: opts.effort,
        skill: null,
        targetSlotId: null,
        fire: 0,
      })
    }
    if (mode === 'pool' || mode === 'both') {
      next = pollutePool(next, opts, tally)
    }
  }
  return next
}

/**
 * 負債カードを候補プールに1枚混ぜる(v6 提案 §4-2)。
 *
 * 埋めるスロットを実在しない `debt` にしてあるので、**どの要件の道にもなりません**。
 * 候補プールは `draftPool` 枚で頭打ちなので、これが1枚居座るたびに
 * 選べる正味のタスクが1枚減ります。これが「選択肢が薄まる」の正体です。
 */
function pollutePool(state: GameState, opts: DebtOptions, tally: DebtTally): GameState {
  const id = `debt-${tally.spawned}`
  const card: TaskCard = {
    id,
    name: '技術的負債',
    phase: state.phase,
    slot: 'debt',
    skill: 'engineering',
    estimate: opts.effort,
    risk: 'medium',
    maxLevel: 1,
    fatigue: 1,
    cost: 0,
    prerequisiteSlots: [],
  }
  return {
    ...state,
    content: { ...state.content, tasks: [...state.content.tasks, card] },
    taskPool: [...state.taskPool, id],
  }
}

// ═══════════════════════════════════════════════════════════

/** 割り込みレーンにカードを1枚足す(エンジンの INTERRUPT 効果と同じ形) */
function spawnInterrupt(
  state: GameState,
  spec: {
    kind: BoardTask['interrupt']
    effort: number
    skill: BoardTask['interruptSkill']
    targetSlotId: string | null
    fire: number
  },
): GameState {
  // レーンがあふれていたら、エンジンと同じく CS を失うだけで盤面には出さない
  const laneCount = state.board.filter((t) => t.interrupt !== null).length
  if (laneCount >= state.config.interruptCapacity) {
    return { ...state, cs: state.cs - state.config.overflowCs }
  }
  const seq = state.placementCounter + 1
  const task: BoardTask = {
    cardId: `interrupt-${seq}`,
    cubes: 0,
    fire: spec.fire,
    plannedWeek: null,
    interrupt: spec.kind,
    interruptEffort: spec.effort,
    interruptSkill: spec.skill,
    targetSlotId: spec.targetSlotId,
    rewardBudget: null,
    actualEffort: null,
    contributorIds: [],
    placedSeq: seq,
    effortReduction: 0,
    blockedUntilWeek: 0,
    csOnFulfill: 0,
    sourceEventId: null,
  }
  return { ...state, board: [...state.board, task], placementCounter: seq }
}
