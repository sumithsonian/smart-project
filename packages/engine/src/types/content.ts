/**
 * コンテンツ(タスクタイル・カード類)の型定義(RULES.md §6)
 */

/** スキル系統(RULES.md §9-4 暫定:ディレクション/デザイン/エンジニアリング) */
export type SkillKind = 'direction' | 'design' | 'engineering'

/** ロール */
export type Role = 'pm' | 'director' | 'designer' | 'engineer'

/** 成果物レベル(Lv1=通常 / Lv2=高品質) */
export type DeliverableLevel = 1 | 2

/** スキル条件(系統×レベル) */
export interface SkillRequirement {
  /** スキル系統 */
  skill: SkillKind
  /** 必要レベル(1〜2) */
  level: number
}

/** タスクタイルの特殊効果 */
export type TaskSpecialEffect =
  /** 次タスクの実行コスト減 */
  | { type: 'NEXT_TASK_COST_DOWN'; amount: number }

/** タスクタイル */
export interface TaskTile {
  /** タイルID */
  id: string
  /** タスク名(フレーバー) */
  name: string
  /** 対応フェーズ(1〜4) */
  phase: number
  /** 必要行動トークン数(積み上げ式で充足) */
  requiredTokens: number
  /** 成果物獲得(0〜2個、各 Lv1/Lv2) */
  deliverables: DeliverableLevel[]
  /** スキル条件(なしの場合 null) */
  skillRequirement: SkillRequirement | null
  /** 秘匿要件フラグ(あり→実行時に要件カード2枚から1枚選択) */
  hiddenRequirement: boolean
  /** 連鎖(依存)要件:親タスクのタイルID(同フェーズ内) */
  dependsOn: string[]
  /** 協業フラグ(暫定:複数プレイヤーのトークンが必須) */
  collaboration: boolean
  /** イベントマーク(あり→解決時にイベントカードを引く) */
  eventMark: boolean
  /** 実行コスト(予算消費値) */
  cost: number
  /** 実行時疲労値(+1 通常 / +2 重タスク) */
  fatigue: number
  /** 特殊効果(なしの場合 null) */
  specialEffect: TaskSpecialEffect | null
}

/** イベントカードの効果 */
export type EventEffect =
  /** 予算増減 */
  | { type: 'BUDGET'; amount: number }
  /** CS 増減 */
  | { type: 'CS'; amount: number }
  /** 全員の疲労増減 */
  | { type: 'FATIGUE_ALL'; amount: number }
  /** 何も起きない */
  | { type: 'NONE' }

/** イベントカード */
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

/** 要件カードの効果(タスクの秘匿要件) */
export type RequirementEffect =
  /** 追加スキル条件(本当の必要スキル) */
  | { type: 'EXTRA_SKILL'; requirement: SkillRequirement }
  /** 追加コスト */
  | { type: 'EXTRA_COST'; amount: number }
  /** 追加疲労 */
  | { type: 'EXTRA_FATIGUE'; amount: number }
  /** コスト割引 */
  | { type: 'COST_DISCOUNT'; amount: number }
  /** ボーナス成果物 */
  | { type: 'BONUS_DELIVERABLE'; level: DeliverableLevel }
  /** 効果なし */
  | { type: 'NONE' }

/** 要件カード */
export interface RequirementCard {
  /** カードID */
  id: string
  /** カード名 */
  name: string
  /** フレーバーテキスト */
  description: string
  /** 効果 */
  effect: RequirementEffect
}

/** 限界イベントカードの効果(必ず発動するデメリット。「何も起きない」を1枚含む) */
export type LimitEventEffect =
  /** 予算減少 */
  | { type: 'BUDGET'; amount: number }
  /** CS 減少 */
  | { type: 'CS'; amount: number }
  /** 全員の疲労増加 */
  | { type: 'FATIGUE_ALL'; amount: number }
  /** 対象プレイヤーの次フェーズ補充トークン減 */
  | { type: 'TOKEN_PENALTY_NEXT'; amount: number }
  /** チームの Lv2 成果物1つを Lv1 に劣化(Q低下) */
  | { type: 'QUALITY_DOWN' }
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

/** 個人目標カードの達成条件 */
export type PersonalGoalCondition =
  /** 自分が参加したタスク由来の Lv2 成果物が N 個以上 */
  | { type: 'LV2_DELIVERABLES_AT_LEAST'; count: number }
  /** スキル合計が初期値から N 以上成長 */
  | { type: 'SKILL_GROWTH_AT_LEAST'; amount: number }
  /** ゲーム終了時の疲労が Lv N 以下 */
  | { type: 'FATIGUE_AT_MOST'; level: number }
  /** ゲーム終了時の予算が初期予算の N 割以上 */
  | { type: 'BUDGET_RATIO_AT_LEAST'; ratio: number }
  /** EP が N 以上(v2.1) */
  | { type: 'EP_AT_LEAST'; amount: number }
  /** 累計消火回数が N 以上(v2.1) */
  | { type: 'EXTINGUISH_AT_LEAST'; count: number }
  /** 全スキル系統が Lv N 以上(v2.1) */
  | { type: 'ALL_SKILLS_AT_LEAST'; level: number }

/** 個人目標カード(各自1枚、非公開) */
export interface PersonalGoalCard {
  /** カードID */
  id: string
  /** カード名 */
  name: string
  /** 条件の説明文 */
  description: string
  /** 達成条件 */
  condition: PersonalGoalCondition
}

/** クライアントカード(QCD 重みパラメータ + 性格フレーバー) */
export interface ClientCard {
  /** カードID */
  id: string
  /** クライアント名 */
  name: string
  /** 性格フレーバー(暫定:ルール効果なし) */
  personality: string
  /** QCD 重み(q=品質 / c=コスト / d=納期) */
  weights: { q: number; c: number; d: number }
}

/** プロジェクトカード(種別 + 特殊要件フレーバー) */
export interface ProjectCard {
  /** カードID */
  id: string
  /** プロジェクト名 */
  name: string
  /** プロジェクト種別(CMS、ブランドサイト など) */
  projectType: string
  /** 特殊要件(暫定:フレーバーのみ) */
  specialRequirements: string[]
}

/** フェーズごとの判定ルール(プロジェクトシートの一部) */
export interface PhaseRule {
  /** 品質基準:このフェーズで獲得すべき Lv2 成果物数 */
  qualityThreshold: number
  /** 納期許容数:フェーズ終了時に許容される未解決タスク数 */
  deadlineAllowance: number
  /** 品質未達時の CS 基本減少値(重み適用前) */
  csPenaltyQuality: number
  /** 納期超過時の CS 基本減少値(重み適用前) */
  csPenaltyDeadline: number
}

/** プロジェクトシート(シナリオ定義) */
export interface ProjectSheet {
  /** シートID */
  id: string
  /** シナリオ名 */
  name: string
  /** 初期 CS 値 */
  initialCs: number
  /** 初期予算 */
  initialBudget: number
  /** フェーズごとの判定ルール(phases 数ぶん) */
  phaseRules: PhaseRule[]
  /** 特殊ルール(暫定:フレーバーのみ) */
  specialRule: string | null
}

/** マイルストーンの達成条件(v2.1。公開・早取り) */
export type MilestoneCondition =
  /** 累計消火回数が N 以上 */
  | { type: 'EXTINGUISH_AT_LEAST'; count: number }
  /** 自分が参加した Lv2 成果物が N 個以上 */
  | { type: 'LV2_PARTICIPATED_AT_LEAST'; count: number }
  /** スキルアップ回数が N 以上 */
  | { type: 'SKILL_UP_AT_LEAST'; count: number }
  /** EP が N 以上 */
  | { type: 'EP_AT_LEAST'; amount: number }
  /** 1フェーズ内にタスクへ配置したトークンが N 個以上 */
  | { type: 'PHASE_PLACEMENTS_AT_LEAST'; count: number }

/** マイルストーンカード(v2.1。最初に達成した1人だけが獲得) */
export interface MilestoneCard {
  /** カードID */
  id: string
  /** カード名 */
  name: string
  /** 条件の説明文 */
  description: string
  /** 達成条件 */
  condition: MilestoneCondition
}

/** ロール定義(初期スキル値。RULES.md §9-6 暫定) */
export interface RoleDef {
  /** ロール */
  role: Role
  /** 日本語名 */
  name: string
  /** 初期スキル値 */
  initialSkills: Record<SkillKind, number>
}

/** ゲームコンテンツ一式 */
export interface GameContent {
  /** タスクタイル(フェーズごと) */
  tasks: TaskTile[]
  /** イベントカード */
  events: EventCard[]
  /** 要件カード */
  requirements: RequirementCard[]
  /** 限界イベントカード */
  limitEvents: LimitEventCard[]
  /** 個人目標カード */
  personalGoals: PersonalGoalCard[]
  /** マイルストーンカード(v2.1) */
  milestones: MilestoneCard[]
  /** クライアントカード */
  clients: ClientCard[]
  /** プロジェクトカード */
  projects: ProjectCard[]
  /** プロジェクトシート */
  projectSheets: ProjectSheet[]
  /** ロール定義 */
  roles: RoleDef[]
}
