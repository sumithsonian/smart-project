/**
 * イベントデッキの構成違い(モードプリセットの検証用。RULES.md §13)
 *
 * v5.0 の既定デッキは「追体験モード」相当で、割り込みを生むカードが 16 枚中 4 枚しかない。
 * その結果、割り込みレーン(枠4)はほぼ埋まらず、
 * 品質リスク(#5)・専門スキルの取り合い(#7)・謝絶がどれも盤面に出てこない。
 *
 * デッキ差し替えは RULES.md §13 で v5.2 の項目としているため、
 * **ここではシミュレーション専用**として構成を差し替え、流入を上げた場合の挙動を測る。
 * (エンジンの公開 API は変えていない。製品に入れるならコンテンツ側の作業になる)
 */
import type { EventCard, GameContent, GameState, RequirementCard } from '../src/types'
import { buildDeck } from '../src/deck'
import { openRequirement } from '../src/actions/scope'

/** 追加の割り込みイベント(トリアージ寄りのデッキを作るための素材) */
const EXTRA_INTERRUPT_EVENTS: EventCard[] = [
  {
    id: 'sim-ev-rework-copy',
    name: 'コピー修正の指示',
    description: '「文言、やっぱり全部見直したいです」',
    effects: [{ type: 'INTERRUPT', kind: 'rework', amount: 2 }],
  },
  {
    id: 'sim-ev-rework-color',
    name: '配色のやり直し',
    description: '「役員から色が固いと言われまして」',
    effects: [{ type: 'INTERRUPT', kind: 'rework', amount: 2 }],
  },
  {
    id: 'sim-ev-bug-mobile',
    name: 'スマホで崩れる',
    description: '特定機種だけレイアウトが壊れている。',
    effects: [{ type: 'INTERRUPT', kind: 'bug', amount: 2, skill: 'engineering' }],
  },
  {
    id: 'sim-ev-bug-form',
    name: 'フォームが送信できない',
    description: '問い合わせが届いていないらしい。',
    effects: [{ type: 'INTERRUPT', kind: 'bug', amount: 2, skill: 'engineering' }],
  },
  {
    id: 'sim-ev-consult-campaign',
    name: 'キャンペーンの相談',
    description: '来月の施策について意見がほしいとのこと。',
    effects: [{ type: 'INTERRUPT', kind: 'consult', amount: 2, skill: null, rewardBudget: 2 }],
  },
  {
    id: 'sim-ev-consult-analytics',
    name: '効果測定の相談',
    description: '「アクセス解析、どう見ればいいですか」',
    effects: [{ type: 'INTERRUPT', kind: 'consult', amount: 2, skill: null, rewardBudget: 2 }],
  },
  {
    id: 'sim-ev-check-wait',
    name: '先方の決裁待ち',
    description: '決裁が下りるまで進められない箇所がある。',
    effects: [{ type: 'BLOCK_TASK' }],
  },
  {
    id: 'sim-ev-help-again',
    name: '他案件のヘルプ(再)',
    description: '「もう1週だけお願いできませんか」',
    effects: [{ type: 'CAPACITY_DOWN' }],
  },
]

/** 流入レベル(v4.1 の interruptChance に相当する概念) */
export type InflowMode =
  /** 既定デッキ(追体験モード相当) */
  | 'experience'
  /** 割り込みイベントを増やした標準トリアージ */
  | 'triage'
  /** さらに増やした高難度 */
  | 'pressure'

/** モードに応じたイベントカード一覧を作る */
export function eventsForMode(base: EventCard[], mode: InflowMode): EventCard[] {
  if (mode === 'experience') return base
  if (mode === 'triage') return [...base, ...EXTRA_INTERRUPT_EVENTS]
  // pressure:割り込みを厚くし、無風カードを抜く
  const quiet = new Set(['ev-rest-day', 'ev-smooth', 'ev-praise'])
  return [
    ...base.filter((e) => !quiet.has(e.id)),
    ...EXTRA_INTERRUPT_EVENTS,
    ...EXTRA_INTERRUPT_EVENTS.map((e) => ({ ...e, id: `${e.id}-2` })),
  ]
}

/**
 * セットアップ済みの状態のイベントデッキを差し替える。
 * 乱数は state.rng をそのまま使うので、シードによる再現性は保たれる。
 */
export function applyInflowMode(state: GameState, mode: InflowMode): GameState {
  if (mode === 'experience') return state
  const events = eventsForMode(state.content.events, mode)
  const content: GameContent = { ...state.content, events }
  const [deck, rng] = buildDeck(
    events.map((e) => e.id),
    state.rng,
  )
  return { ...state, content, rng, decks: { ...state.decks, events: deck } }
}

// ═══════════════════════════════════════════════════════════
// 需要(要件の総量)の検証
// ═══════════════════════════════════════════════════════════

/**
 * RULES.md §8-1 は「要件の総需要はチームの供給より常に大きい」を前提にしているが、
 * v5.0 の既定コンテンツは 1フェーズ 2枚(Must 1 / Better 1)しかなく、
 * 4人チームの供給を下回っている(手空き率 10〜19%)。
 * 需要を上げた場合に何が変わるかを測るための、シミュレーション専用の追加要件。
 */
const EXTRA_REQUIREMENTS: RequirementCard[] = [
  {
    id: 'sim-rq-p1-style-early',
    name: '早めにトーンを決めたい',
    phase: 1,
    slot: 'wireframe',
    level: 1,
    deadlinePhase: 2,
    tier: 'better',
  },
  {
    id: 'sim-rq-p2-guide',
    name: 'スタイルガイドを残してほしい',
    phase: 2,
    slot: 'styleguide',
    level: 1,
    deadlinePhase: 3,
    tier: 'must',
  },
  {
    id: 'sim-rq-p3-sub',
    name: '下層ページも一通り作ってほしい',
    phase: 3,
    slot: 'sub-pages',
    level: 1,
    deadlinePhase: 3,
    tier: 'must',
  },
  {
    id: 'sim-rq-p4-cms-quality',
    name: 'CMS の使い勝手も詰めたい',
    phase: 4,
    slot: 'cms',
    level: 2,
    deadlinePhase: 4,
    tier: 'better',
  },
]

/** 需要レベル */
export type DemandMode =
  /** 既定(1フェーズ 2枚) */
  | 'base'
  /** 1フェーズ 3枚に増やす */
  | 'high'

/** 需要モードに応じて要件カードを差し替える */
export function applyDemandMode(state: GameState, mode: DemandMode): GameState {
  if (mode === 'base') return state
  const requirements = [...state.content.requirements, ...EXTRA_REQUIREMENTS]
  const content: GameContent = { ...state.content, requirements }
  let next: GameState = { ...state, content }
  // 現フェーズぶんの追加要件はその場で公開する(以後はフェーズ進行時に公開される)
  for (const card of EXTRA_REQUIREMENTS) {
    if (card.phase !== next.phase) continue
    next = openRequirement(next, card)
  }
  return next
}

// ═══════════════════════════════════════════════════════════
// 依存グラフの形(#4 の設計検証)
// ═══════════════════════════════════════════════════════════

/**
 * v5.0 の前提成果物はほぼ一本の直列チェーンになっている:
 *   要件定義 → サイトマップ → ワイヤー → デザインカンプ → トップ → 公開
 * 納品判定は週末に1回だけなので(RULES.md §6-3)、この形だと
 * **1週にチェーンを1段しか進められない**。4人チームの並列性が吸収されず、
 * 手が余る → 割り込みは無料で吸収できる → 謝絶も品質リスクも効かない、という連鎖になる。
 *
 * 依存を並列寄りに組み替えた場合を測るための、シミュレーション専用の差し替え。
 */
export type DependencyMode =
  /** 既定(直列チェーン) */
  | 'serial'
  /** 並列寄り:前提を「1つ手前」だけに緩め、枝を増やす */
  | 'wide'
  /** 上限値の測定用:前提を全部外す(= 完全並行。ゲームとしては成立しないが天井が分かる) */
  | 'none'

const WIDE_PREREQS: Record<string, string[]> = {
  // デザイン系はワイヤーではなくサイトマップから始められる
  't-design-heavy': ['sitemap'],
  't-design-light': ['sitemap'],
  't-design-mid': ['sitemap'],
  't-guide-heavy': ['sitemap'],
  't-guide-light': ['sitemap'],
  // 実装はワイヤーがあれば始められる(デザインカンプ完成を待たない)
  't-top-heavy': ['wireframe'],
  't-top-light': ['wireframe'],
  't-sub-heavy': ['wireframe'],
  't-sub-light': ['wireframe'],
  // 公開はトップだけでなく下層でも足がかりになる
  't-launch-heavy': ['top-page'],
  't-launch-light': ['sub-pages'],
}

/** 依存モードに応じてタスクの前提成果物を差し替える */
export function applyDependencyMode(state: GameState, mode: DependencyMode): GameState {
  if (mode === 'serial') return state
  if (mode === 'none') {
    const tasks = state.content.tasks.map((t) => ({ ...t, prerequisiteSlots: [] }))
    return { ...state, content: { ...state.content, tasks } }
  }
  const tasks = state.content.tasks.map((t) =>
    WIDE_PREREQS[t.id] ? { ...t, prerequisiteSlots: WIDE_PREREQS[t.id]! } : t,
  )
  return { ...state, content: { ...state.content, tasks } }
}


// ═══════════════════════════════════════════════════════════
// 同時作業人数の上限(提案Aの検証)
// ═══════════════════════════════════════════════════════════

/**
 * 「1つのタスクに何人まで同時に座れるか」の上限(ブルックスの法則)。
 * v5.1 には上限が無く、1枚に全員を集中させて即納品 → 次を解放するのが最適になっている。
 * これがテンポの価値を跳ね上げ、Lv2 の価値・謝絶・ジレンマをまとめて殺している。
 *
 * 上限を入れた場合の効果を測るための、シミュレーション専用の設定。
 */
export type WorkerLimitMode =
  /** 上限なし(既定) */
  | 'none'
  /** 見積 ≤3 は1人、≥4 は2人。割り込み・改修は1人 */
  | 'brooks'

/** そのタスクに同時に座れる人数 */
export function maxWorkersFor(
  state: GameState,
  cardId: string,
  mode: WorkerLimitMode,
): number {
  if (mode === 'none') return Number.POSITIVE_INFINITY
  const card = state.content.tasks.find((t) => t.id === cardId)
  if (!card) return 1 // 割り込みカードは1人
  return card.estimate >= 4 ? 2 : 1
}
