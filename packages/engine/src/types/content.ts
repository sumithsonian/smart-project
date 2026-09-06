/**
 * コンテンツ(カード・スロット類)の型定義(RULES.md §2・§3・§7・§9)
 */

/** スキル系統 */
export type SkillKind = 'direction' | 'design' | 'engineering'

/** 成果物レベル */
export type DeliverableLevel = 1 | 2

/** タスクのリスク区分(実工数の振れ幅。RULES.md §2-2) */
export type RiskLevel = 'low' | 'medium' | 'high'

/**
 * タスクカード(要件を満たす「手段」。同じスロットに複数の道がある)
 */
export interface TaskCard {
  /** カードID */
  id: string
  /** タスク名(フレーバー) */
  name: string
  /** 対応フェーズテーマ(1〜4。このフェーズ以降の候補プールに補充される) */
  phase: number
  /** 埋めるプロダクトボードのスロットID */
  slot: string
  /** 系統(v5.0 は単一系統) */
  skill: SkillKind
  /** 見積工数(公開情報。実工数はリスク別補正で決まる) */
  estimate: number
  /** リスク(見積の不確実性。公開情報。RULES.md §2-2) */
  risk: RiskLevel
  /** 上限Lv(1 = 安い道。積み増しによる Lv2 納品は不可) */
  maxLevel: DeliverableLevel
  /** 座った週の疲労値(1 通常 / 2 重) */
  fatigue: 1 | 2
  /** 納品時の実行コスト(予算) */
  cost: number
  /** 前提成果物(着手にはこれらのスロットが納品済みである必要がある。RULES.md §6-1) */
  prerequisiteSlots: string[]
}

/** プロダクトボードのスロット定義 */
export interface SlotDef {
  /** スロットID */
  id: string
  /** 表示名(例:トップページ) */
  name: string
  /** 改修・手戻り対応に使う系統 */
  skill: SkillKind
}

/** 要件の区分(RULES.md §3-2) */
export type RequirementTier =
  /** Must(期限までに必要。未達で CS 減) */
  | 'must'
  /** Better(任意。達成で CS 増、未達の罰なし) */
  | 'better'
  /** 見送り(今回のスコープ外) */
  | 'dropped'

/**
 * 要件カード(お客様の求める成果。スロット×要求Lv×期限)
 * v4 の「検収条件カード + 約束」を置き換える(RULES.md §3-1)。
 */
export interface RequirementCard {
  /** カードID */
  id: string
  /** 条件名(例:「トップページは磨き込みたい」) */
  name: string
  /** 公開されるフェーズ(1〜phases) */
  phase: number
  /** 対象スロットID */
  slot: string
  /** 要求レベル */
  level: DeliverableLevel
  /** 期限(このフェーズ末に清算する) */
  deadlinePhase: number
  /** 初期区分(カードに刷ってある) */
  tier: Exclude<RequirementTier, 'dropped'>
}

/** 差し込みの種類(RULES.md §8-4) */
export type InterruptKind =
  /** 手戻り:対象スロットは解消まで検収上「未達」扱い */
  | 'rework'
  /** バグ報告:未対応の間フェーズ末ごとに CS-1 */
  | 'bug'
  /** 相談ごと:任意対応。完了で報酬。フェーズ末に自然消滅 */
  | 'consult'

/**
 * イベントカードの効果(RULES.md §7-3)
 */
export type EventEffect =
  /** 予算増減 */
  | { type: 'BUDGET'; amount: number }
  /** CS 増減 */
  | { type: 'CS'; amount: number }
  /** 全員の疲労増減 */
  | { type: 'FATIGUE_ALL'; amount: number }
  /**
   * 差し込み:割り込みレーンにカードを追加する。
   * skill を指定すると、その系統でしか対応できない(rework は対象スロットの系統を使う)。
   */
  | {
      type: 'INTERRUPT'
      kind: InterruptKind
      /** 必要工数 */
      amount: number
      /** 必要スキル(null = 指定なし・最高スキルで対応。rework では無視) */
      skill?: SkillKind | null
      /** 相談ごとの報酬予算 */
      rewardBudget?: number
    }
  /** 他案件ヘルプ:対象プレイヤーの次週に積むキューブを減らす(RULES.md §7-3) */
  | { type: 'CAPACITY_DOWN'; amount?: number }
  /** クライアント確認待ち:対象タスクを次週だけ開始できなくする */
  | { type: 'BLOCK_TASK' }
  /** 要件追加:新しい要件をスコープボードへ(RULES.md §3-6) */
  | {
      type: 'ADD_REQUIREMENT'
      /** 追加する要件カードID(content.requirements に定義しておく) */
      requirementId: string
      /** 追加時の区分 */
      tier: Exclude<RequirementTier, 'dropped'>
      /** 期限を「現在フェーズ + n」にする(省略時はカード定義の deadlinePhase) */
      deadlineOffset?: number
    }
  /** 品質レビュー:品質リスクのあるスロット1つにつき CS-1(最大 maxPenalty) */
  | { type: 'QUALITY_AUDIT'; maxPenalty: number }
  /** 何も起きない */
  | { type: 'NONE' }

/**
 * イベントの選択肢(RULES.md §7-2)
 * 「受ける / 交渉する / 断る」など。選択はアクションログに残り再現できる。
 */
export interface EventChoice {
  /** 選択肢ID(RESOLVE_EVENT で指定する) */
  id: string
  /** 表示ラベル(例:「受ける」) */
  label: string
  /** 補足説明 */
  description: string
  /** この選択で適用される効果 */
  effects: EventEffect[]
  /**
   * 成果達成で CS を得られる追加対応か(RULES.md §4-1)。
   * 指定すると、この選択で追加された要件・差し込みを完了した時点で CS を得る。
   */
  csOnFulfill?: number
  /** 選択に必要な予算(足りなければ選べない) */
  budgetCost?: number
}

/** イベントカード(週末に1枚めくる。RULES.md §7-1) */
export interface EventCard {
  /** カードID */
  id: string
  /** カード名 */
  name: string
  /** フレーバーテキスト */
  description: string
  /** 選択肢なしのときの効果 */
  effects: EventEffect[]
  /** 選択肢(2つ以上あるとプレイヤーが選ぶ) */
  choices?: EventChoice[]
}

/**
 * 炎上カードのターゲット条件(名指しではなく条件式。RULES.md §9-3)
 * 該当タスクが複数のときは盤面の配置順で先のもの(物理版は PM 裁定)。
 */
export type FireTarget =
  /** キューブ最多の未納品タスク */
  | 'most_cubes'
  /** 最も古く場に出た未納品タスク */
  | 'oldest'
  /** 今週予定のタスク(なければ最も近い予定週) */
  | 'this_week'
  /** ブロック中のタスク(なければ最も古いタスク) */
  | 'blocked'
  /** 大炎上:進行中の全タスクに🔥+1 */
  | 'epidemic'

/** 炎上カード */
export interface FireCard {
  /** カードID */
  id: string
  /** カード名 */
  name: string
  /** ターゲット条件 */
  target: FireTarget
}

/** 限界イベントカードの効果(必ず発動するデメリット。「何も起きない」を1枚含む) */
export type LimitEventEffect =
  /** 予算減少 */
  | { type: 'BUDGET'; amount: number }
  /** CS 減少 */
  | { type: 'CS'; amount: number }
  /** 全員の疲労増加 */
  | { type: 'FATIGUE_ALL'; amount: number }
  /** 対象プレイヤーは次フェーズ残業禁止 */
  | { type: 'OVERTIME_BAN' }
  /** 何も起きない */
  | { type: 'NONE' }

/** 限界イベントカード */
export interface LimitEventCard {
  /** カードID */
  id: string
  /** カード名 */
  name: string
  /** フレーバーテキスト */
  description: string
  /** 効果 */
  effect: LimitEventEffect
}

/** 個人能力の種類(メンバーカードに1つ。RULES.md §9-1) */
export type AbilityKind =
  /** マルチタスク(パッシブ):残業の追加疲労なし */
  | 'multitask'
  /** 磨き込み:週末に納品済みスロット1つを Lv1→Lv2(品質リスクも除去) */
  | 'polish'
  /** 段取り:朝会で宣言。今週自分の積むキューブ+1 */
  | 'expedite'
  /** 自動化:未納品タスク1つの必要工数-1(いつでも) */
  | 'automate'

/** メンバーカード(能力=傾向を持った個人) */
export interface MemberCard {
  /** カードID */
  id: string
  /** 名前(例:元エンジニアの何でも屋) */
  name: string
  /** 経歴フレーバー */
  flavor: string
  /** 初期スキルプロファイル */
  skills: Record<SkillKind, number>
  /** 個人能力 */
  ability: AbilityKind
}

/** プロジェクトシート(シナリオ定義) */
export interface ProjectSheet {
  /** シートID */
  id: string
  /** シナリオ名 */
  name: string
  /** 初期 CS */
  initialCs: number
  /** 初期予算 */
  initialBudget: number
  /** フレーバー(案件・クライアントの説明) */
  description: string
}

/** ゲームコンテンツ一式 */
export interface GameContent {
  /** プロダクトボードのスロット定義 */
  slots: SlotDef[]
  /** タスクカード */
  tasks: TaskCard[]
  /** 要件カード(公開分 + イベントで追加されうる分) */
  requirements: RequirementCard[]
  /** イベントカード(差し込み込み) */
  events: EventCard[]
  /** 炎上カード */
  fires: FireCard[]
  /** 限界イベントカード */
  limitEvents: LimitEventCard[]
  /** メンバーカード */
  members: MemberCard[]
  /** プロジェクトシート */
  projectSheets: ProjectSheet[]
}
