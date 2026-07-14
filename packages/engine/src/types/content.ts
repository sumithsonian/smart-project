/**
 * コンテンツ(カード・スロット類)の型定義(rules-v4-core.md §0・§2・§3)
 */

/** スキル系統 */
export type SkillKind = 'direction' | 'design' | 'engineering'

/** WBS の列(レーン文法) */
export type Lane = 'start' | 'middle' | 'finish'

/** 成果物レベル */
export type DeliverableLevel = 1 | 2

/**
 * タスクカード(検収条件を満たす「手段」。同じスロットに複数の道がある)
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
  /** 系統(v4.0 は単一系統) */
  skill: SkillKind
  /** 必要工数(キューブ数) */
  effort: number
  /** 上限Lv(1 = 安い道。積み増しによる Lv2 納品は不可) */
  maxLevel: DeliverableLevel
  /** 座った週の疲労値(1 通常 / 2 重) */
  fatigue: 1 | 2
  /** 納品時の実行コスト(予算) */
  cost: number
  /** 配置できる列 */
  lane: Lane
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

/** 検収条件カード(お客様の求める成果。スロット×要求Lv) */
export interface AcceptanceCard {
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
}

/** 差し込みの種類(rules-v4-core.md §1-2-1) */
export type InterruptKind =
  /** 手戻り:納品済みスロットに手戻りキューブ。乗っている間そのスロットは検収上未達 */
  | 'rework'
  /** バグ報告:対応タスクが出る。未対応の間フェーズ末ごとに CS-1 */
  | 'bug'
  /** 相談ごと:任意対応。完了で報酬 */
  | 'consult'

/** イベントカードの効果 */
export type EventEffect =
  /** 予算増減 */
  | { type: 'BUDGET'; amount: number }
  /** CS 増減 */
  | { type: 'CS'; amount: number }
  /** 全員の疲労増減 */
  | { type: 'FATIGUE_ALL'; amount: number }
  /** 差し込み(rework: cubes 個の手戻り / bug・consult: effort 個の割り込みタスク) */
  | { type: 'INTERRUPT'; kind: InterruptKind; amount: number; rewardBudget?: number }
  /** 何も起きない */
  | { type: 'NONE' }

/** イベントカード(週初のトラブル) */
export interface EventCard {
  /** カードID */
  id: string
  /** カード名 */
  name: string
  /** フレーバーテキスト */
  description: string
  /** 効果(複数可) */
  effects: EventEffect[]
}

/**
 * 炎上カードのターゲット条件(名指しではなく条件式。rules-v4-core.md §0)
 * 該当タスクが複数のときは盤面の配置順で先のもの(物理版は PM 裁定)。
 */
export type FireTarget =
  /** キューブ最多の進行中(未納品)タスク */
  | 'most_cubes'
  /** 仕上げ列の未納品タスク(なければ中盤→起点) */
  | 'lane_finish'
  /** 最も古く場に出た未納品タスク */
  | 'oldest'
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

/** 個人能力の種類(メンバーカードに1つ。rules-v4-core.md §3) */
export type AbilityKind =
  /** マルチタスク(パッシブ):残業の追加疲労なし */
  | 'multitask'
  /** 磨き込み:週末に納品済みスロット1つを Lv1→Lv2 */
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
  /** 検収条件カード */
  acceptance: AcceptanceCard[]
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
