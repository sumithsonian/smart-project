/**
 * 基盤成果物の完成ボーナス(v6 提案 §5 の検証用)
 *
 * `docs/rules-v6-proposal.md` §5 は、Lv2 の価値を「罰の回避」ではなく
 * **確定した恒久リターン**にすることで、§13-7 の原因 (B)
 * 「速さしか評価軸がない」を解こうとしている。
 *
 * 提案の5枚のうち、**エンジンを変えずに測れるのは工数減の2枚だけ**:
 *
 * | 基盤成果物 | Lv2 ボーナス | ここで測れるか |
 * |---|---|---|
 * | スタイルガイド | 🎨des 系の必要工数 -1 | ✅ `effortReduction` で表現できる |
 * | CMS基盤 | ⚙eng 系の必要工数 -1 | ✅ 同上 |
 * | 要件定義書 | ドラフト公開枚数 +2 | ❌ ドラフト自体が未実装 |
 * | サイトマップ | 前倒し着手のリスク免除 | ❌ 前倒し着手が未実装(§6-2 で禁止中) |
 * | ワイヤーフレーム | 実工数の事前公開 | ❌ 公開タイミングはエンジンの仕様 |
 *
 * つまりここで測るのは **v6 の良いエンジンの「下限」** である。
 * 2枚だけで基準⑦(最速戦略と丁寧戦略の勝率差 10pt 以内)が動くなら、
 * 5枚そろえた本番はさらに効く、と読める。
 */
import type { GameState, SkillKind } from '../src/types'

/** 基盤成果物 → その Lv2 で軽くなる系統(v6 提案 §5-1) */
const ALL_SKILLS: SkillKind[] = ['direction', 'design', 'engineering']

/**
 * 基盤成果物 → その Lv2 で軽くなる系統(**工数減 = 生産量が増える**側)。
 *
 * - `on`:提案 §5-1 どおり。スタイルガイド → 🎨、CMS → ⚙
 * - `early`:序盤・クリティカルパス上の成果物に、全系統への効果として付ける
 *
 * `on` の2枚は依存グラフの**葉ノード**で、要件が求めない限り誰も作りません
 * (実測:Lv2 到達 0.45枚/ゲーム、恩恵は 1.4タスクぶん)。
 */
const EFFORT_BONUS: Record<string, Record<string, SkillKind[]>> = {
  on: {
    styleguide: ['design'],
    cms: ['engineering'],
  },
  early: {
    requirements: ALL_SKILLS,
    sitemap: ALL_SKILLS,
  },
}

/**
 * **不確実性が減る**側のボーナス(v6 提案 §5 の本来の狙い)。
 *
 * 「エンジンビルドは生産量が増えるのではなく、不確実性が減る」という設計意図に対して、
 * §10-4 で測っていたのは工数減(= 生産量が増える)ばかりでした。
 * この3枚は工数を1人日も減らしません。**分からなさだけを減らします。**
 */
const UNCERTAINTY_BONUS = {
  /** 要件定義書 Lv2 → ドラフト公開枚数 +2(抜け漏れが減る。§3-4) */
  draftReveal: 'requirements',
  /** サイトマップ Lv2 → 前倒し着手にリスクマーカーが付かない(着手順の不確実性。§2-3) */
  earlyStartSafe: 'sitemap',
  /** ワイヤーフレーム Lv2 → 実工数が着手前に公開される(見積差異。§2-2) */
  effortForesight: 'wireframe',
} as const

/** 不確実性ボーナスの種類 */
export type UncertaintyKind = keyof typeof UNCERTAINTY_BONUS

/** 基盤ボーナスの有無 */
export type FoundationMode =
  /** ボーナスなし(v5.1 現行) */
  | 'off'
  /** 工数減・提案 §5-1 どおり:スタイルガイド → 🎨 -1、CMS → ⚙ -1 */
  | 'on'
  /** 工数減・対抗仮説:要件定義書 / サイトマップ の Lv2 で全系統 -1 */
  | 'early'
  /** **不確実性が減る版のみ。工数は1人日も減らない** */
  | 'uncertainty'
  /** 両方(early の工数減 + 不確実性) */
  | 'both'

/** そのモードが工数減を配るか */
function effortTableOf(mode: FoundationMode): Record<string, SkillKind[]> | null {
  if (mode === 'on') return EFFORT_BONUS.on!
  if (mode === 'early' || mode === 'both') return EFFORT_BONUS.early!
  return null
}

/** そのモードが不確実性ボーナスを持つか */
function hasUncertainty(mode: FoundationMode): boolean {
  return mode === 'uncertainty' || mode === 'both'
}

/**
 * その不確実性ボーナスが今効いているか(対応する基盤成果物が Lv2 に達しているか)。
 * 工数には一切触れないので、`applyFoundationBonuses` とは別の経路で効く。
 */
export function uncertaintyActive(
  state: GameState,
  mode: FoundationMode,
  kind: UncertaintyKind,
): boolean {
  if (!hasUncertainty(mode)) return false
  const slotId = UNCERTAINTY_BONUS[kind]
  return (state.slots.find((s) => s.slotId === slotId)?.level ?? 0) >= 2
}

/** 適用済みタスクの記録(placedSeq は盤面で一意) */
export type FoundationApplied = Set<number>

/**
 * Lv2 に達した基盤成果物に応じて、対応する系統のタスクへ恒久の工数減を配る。
 *
 * - **同じタスクに二重には配らない**(`applied` で記録する)
 * - 割り込み・改修カードは対象外(系統が持ち主のスロット依存で、基盤の恩恵とは別物)
 * - 個人能力「自動化」の `effortReduction` とは加算になる(必要工数の下限は 1)
 *
 * @returns 更新後の state と、新たにボーナスが乗ったタスク数
 */
export function applyFoundationBonuses(
  state: GameState,
  mode: FoundationMode,
  amount: number,
  applied: FoundationApplied,
): { state: GameState; boosted: number } {
  if (mode === 'off' || amount <= 0) return { state, boosted: 0 }
  const table = effortTableOf(mode)
  if (!table) return { state, boosted: 0 }

  const boostedSkills = new Set<SkillKind>()
  for (const slot of state.slots) {
    if (slot.level < 2) continue
    for (const skill of table[slot.slotId] ?? []) boostedSkills.add(skill)
  }
  if (boostedSkills.size === 0) return { state, boosted: 0 }

  let boosted = 0
  const board = state.board.map((task) => {
    if (task.interrupt !== null) return task
    if (applied.has(task.placedSeq)) return task
    const card = state.content.tasks.find((t) => t.id === task.cardId)
    if (!card || !boostedSkills.has(card.skill)) return task
    applied.add(task.placedSeq)
    boosted++
    return { ...task, effortReduction: task.effortReduction + amount }
  })

  if (boosted === 0) return { state, boosted: 0 }
  return { state: { ...state, board }, boosted }
}

/** ゲーム終了時、Lv2 に達している基盤成果物の枚数(そのモードでボーナス源になるもの) */
export function foundationLv2Count(state: GameState, mode: FoundationMode = 'on'): number {
  const sources = new Set(foundationSlots(mode))
  if (sources.size === 0) return 0
  return state.slots.filter((s) => s.level >= 2 && sources.has(s.slotId)).length
}

/** そのモードでボーナス源になるスロットID(戦略が狙う先) */
export function foundationSlots(mode: FoundationMode): string[] {
  const ids = new Set<string>(Object.keys(effortTableOf(mode) ?? {}))
  if (hasUncertainty(mode)) for (const id of Object.values(UNCERTAINTY_BONUS)) ids.add(id)
  return [...ids]
}
