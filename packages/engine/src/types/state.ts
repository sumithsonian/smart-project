/**
 * GameState — ゲーム状態の型定義
 * 状態はアクションログのリプレイで導出する(イベントソーシング)。
 */
import type { GameConfig } from './config'
import type { DeliverableLevel, GameContent, Role, SkillKind } from './content'

/** 現在のステップ(goal_selection は v2.1 の個人目標選択) */
export type GameStep =
  | 'setup'
  | 'goal_selection'
  | 'planning'
  | 'execution'
  | 'phase_end'
  | 'finished'

/** シード付き乱数の状態(mulberry32。Math.random は使わない) */
export interface RngState {
  /** 現在の内部シード値(uint32) */
  seed: number
}

/** デッキの状態(カードIDの列) */
export interface DeckState {
  /** 山札(先頭から引く) */
  drawPile: string[]
  /** 捨て札 */
  discardPile: string[]
}

/** タスクエリア上のタスクインスタンス */
export interface TaskInstance {
  /** 対応するタスクタイルID */
  tileId: string
  /** 配置済みトークン(playerId → 個数。積み上げ式) */
  tokens: Record<string, number>
  /** 解決済みか */
  resolved: boolean
  /** 解決したフェーズ(未解決なら null) */
  resolvedPhase: number | null
  /** 適用された要件カードID(秘匿要件なし/未解決なら null) */
  appliedRequirementId: string | null
  /** 🔥トークン数(v2.1 炎上システム。必要トークン数に加算される) */
  fire: number
  /** 今フェーズにこのタスクを消火したプレイヤーID(EP 判定用。フェーズ開始時にクリア) */
  extinguisherIds: string[]
  /** 外注済みか(v2.2 配属トリアージ。専門席を充足扱いにし、やっつけ代償なしで解決できる) */
  outsourced: boolean
}

/** 成果物トークン(チームで共有。参加者を記録し個人目標判定に使う) */
export interface DeliverableToken {
  /** レベル(Lv1/Lv2) */
  level: DeliverableLevel
  /** 獲得フェーズ */
  acquiredPhase: number
  /** 由来タスクのタイルID */
  sourceTileId: string
  /** タスクに参加した(トークンを置いていた)プレイヤーID */
  participants: string[]
}

/** プレイヤー状態(個人ボード) */
export interface PlayerState {
  /** プレイヤーID */
  id: string
  /** 表示名 */
  name: string
  /** ロール */
  role: Role
  /** 疲労レベル(Lv0〜fatigueMax) */
  fatigue: number
  /** スキル3系統のレベル */
  skills: Record<SkillKind, number>
  /** 初期スキル合計(個人目標「成長」判定用) */
  initialSkillTotal: number
  /** 手持ちの行動トークン数 */
  tokens: number
  /** 限界イベント由来の次フェーズ補充ペナルティ */
  nextPhaseTokenPenalty: number
  /** 個人目標カードID(非公開。v2.1 では選択完了まで空文字) */
  personalGoalId: string
  /** 個人目標の選択肢(v2.1。選択後は空配列。非公開) */
  goalOptionIds: string[]
  /** 学習タイル上の自分のトークン(系統ごとの累積。充足で消費) */
  learningProgress: Record<SkillKind, number>
  /** EP(自分の仕事が他人に使われた回数。v2.1。公開) */
  ep: number
  /** 累計消火回数(v2.1) */
  extinguishCount: number
  /** 累計スキルアップ回数(v2.1) */
  skillUpCount: number
  /** 今フェーズにタスクへ配置したトークン数(v2.1 マイルストーン用) */
  tokensPlacedThisPhase: number
}

/** 解決待ちイベント */
export interface PendingEvent {
  /** 発生契機 */
  kind: 'phase_start' | 'task' | 'limit'
  /** カードID(イベント or 限界イベント) */
  cardId: string
  /** 限界イベントの対象プレイヤーID(それ以外は null) */
  targetPlayerId: string | null
}

/** 要件カードの選択待ち(2枚引いて1枚選ぶ) */
export interface PendingRequirementChoice {
  /** 対象タスクのタイルID */
  taskTileId: string
  /** 選択肢のカードID 2枚 */
  optionIds: [string, string]
}

/** タスク解決結果(UI 表示・分析用。フェーズ開始時にクリア) */
export interface TaskResolutionEntry {
  /** タイルID */
  tileId: string
  /** 解決できたか */
  resolved: boolean
  /** 未解決の理由コード(解決時は null) */
  failReason: string | null
  /** 日本語メッセージ */
  message: string
}

/** フェーズ終了判定のサマリ(UI 表示用) */
export interface PhaseEndSummary {
  /** 対象フェーズ */
  phase: number
  /** 未解決タスク数 */
  unresolvedCount: number
  /** 納期判定を満たしたか */
  deadlineMet: boolean
  /** このフェーズで獲得した Lv2 成果物数 */
  lv2Count: number
  /** 品質判定を満たしたか */
  qualityMet: boolean
  /** 判定による CS 増減合計 */
  csDelta: number
}

/** 最終結果 */
export interface GameResult {
  /** チームの勝敗 */
  outcome: 'win' | 'lose'
  /** 理由(日本語) */
  reason: string
  /** 個人目標の達成状況(playerId → 達成。チーム敗北時は全員 false) */
  personalResults: Record<string, boolean>
}

/** ゲーム状態 */
export interface GameState {
  /** 適用中の設定 */
  config: GameConfig
  /** コンテンツ一式(セットアップ時に確定) */
  content: GameContent
  /** 現在のステップ */
  step: GameStep
  /** 現在のフェーズ(1〜phases) */
  phase: number
  /** CS トラック(唯一の勝敗トラック) */
  cs: number
  /** 予算トラック */
  budget: number
  /** 初期予算(個人目標判定用) */
  initialBudget: number
  /** 公開中のクライアントカードID */
  clientId: string
  /** 公開中のプロジェクトカードID */
  projectCardId: string
  /** 使用中のプロジェクトシートID */
  projectSheetId: string
  /** プレイヤー(個人ボード) */
  players: PlayerState[]
  /** タスクエリア(現フェーズ + 持ち越しの未解決タスク) */
  taskArea: TaskInstance[]
  /** チームの成果物トークン */
  deliverables: DeliverableToken[]
  /** デッキ群 */
  decks: {
    /** イベントデッキ */
    events: DeckState
    /** 要件カードデッキ */
    requirements: DeckState
    /** 限界イベントデッキ */
    limitEvents: DeckState
    /** 炎上デッキ(v2.1。カードID = タスクタイルID または epidemic-*) */
    fires: DeckState
  }
  /** シード付き乱数の状態 */
  rng: RngState
  /** Ready 宣言済みプレイヤーID */
  readyPlayerIds: string[]
  /** PM が宣言したタスク処理順(タイルID列。実行ステップで消費) */
  resolutionQueue: string[] | null
  /** 要件カード選択中のタスク(解決処理を中断している) */
  pendingRequirementChoice: PendingRequirementChoice | null
  /** 解決待ちイベント */
  pendingEvent: PendingEvent | null
  /**
   * フェーズ開始イベントの解決後に行動トークンを補充するか。
   * RULES.md §2-1 の順序(イベント解決 → トークン補充)を再現するためのフラグ。
   * セットアップ時は §7 で配布済みのため false。
   */
  replenishAfterEvent: boolean
  /** 限界イベント処理待ちのプレイヤーID(疲労Lv3到達順) */
  pendingLimitPlayerIds: string[]
  /** 次タスクのコスト修正(特殊効果。マイナスで割引) */
  nextTaskCostModifier: number
  /** フェーズ開始の炎上ドローの残り枚数(v2.1。0 になるまで他の操作はできない) */
  remainingFireDraws: number
  /** 大炎上のターゲット選択待ち数(v2.1。PM の SELECT_EPIDEMIC_TARGET 待ち) */
  pendingEpidemicCount: number
  /** 今フェーズの外注実行回数(v2.2。outsourcePerPhase で上限。フェーズ開始時に0) */
  outsourceCountThisPhase: number
  /** 炎上フロー完了後にフェーズ開始イベントを引く際の補充フラグ(フロー外なら null) */
  phaseStartReplenish: boolean | null
  /** 今フェーズの炎上レポート(UI 表示用。フェーズ開始時にクリア) */
  fireLog: string[]
  /** 解決済みタスクの参加者の記録(EP 判定用。タイルID → プレイヤーID) */
  taskParticipants: Record<string, string[]>
  /** 公開中のマイルストーンと達成者(v2.1) */
  milestones: Array<{
    /** マイルストーンカードID */
    cardId: string
    /** 達成者(未達成なら null) */
    achievedBy: string | null
  }>
  /** 今フェーズのタスク解決ログ */
  resolutionLog: TaskResolutionEntry[]
  /** 直近のフェーズ終了判定サマリ */
  lastPhaseSummary: PhaseEndSummary | null
  /** 最終結果(ゲーム中は null) */
  result: GameResult | null
}
