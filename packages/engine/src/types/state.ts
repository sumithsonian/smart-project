/**
 * GameState — ゲーム状態の型定義(RULES.md)
 * 状態はアクションログのリプレイで導出する(イベントソーシング)。
 */
import type { GameConfig } from './config'
import type {
  DeliverableLevel,
  GameContent,
  InterruptKind,
  RequirementTier,
  SkillKind,
} from './content'
import type { WorkerTarget } from './actions'

/** 現在のステップ */
export type GameStep =
  | 'setup'
  /** スコープ会議(要件区分・計画ボード配置。PM が FINISH_SCOPE で締める) */
  | 'scope_meeting'
  /** 朝会(週次の同時配置。全員 Ready で週末へ) */
  | 'standup'
  /** 週末(納品判定 → イベント → 再計画。END_WEEKEND で次週 or フェーズ終了へ) */
  | 'weekend'
  /** フェーズ終了(清算表示。ADVANCE_PHASE で次へ) */
  | 'phase_end'
  | 'finished'

/** シード付き乱数の状態(mulberry32) */
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

/** 盤上のタスク(計画ボードに配置されたタスクカード、または割り込みカード) */
export interface BoardTask {
  /** タスクカードID(割り込みは 'interrupt-N') */
  cardId: string
  /** 積まれた工数キューブ */
  cubes: number
  /** 🔥の数(1個 = 必要工数+1) */
  fire: number
  /**
   * 計画された週(1〜roundsPerPhase。null = Backlog)。
   * 割り込みカードは常に null(いつでも着手できる。RULES.md §5-3)。
   */
  plannedWeek: number | null
  /** 差し込みの種類(通常タスクは null) */
  interrupt: InterruptKind | null
  /** 差し込みの必要工数(通常タスクはカード定義を使うため null) */
  interruptEffort: number | null
  /** 差し込みの必要スキル(null = 指定なし・最高スキルで対応。RULES.md §8-4) */
  interruptSkill: SkillKind | null
  /** 手戻りの対象スロット(rework のみ。他は null) */
  targetSlotId: string | null
  /** 相談ごとの報酬予算(consult のみ) */
  rewardBudget: number | null
  /**
   * 実工数(RULES.md §2-2)。null = 未公開(見積工数で扱う)。
   * 初めてキューブが積まれた週の週末に確定・公開される。
   */
  actualEffort: number | null
  /** キューブを積んだことのあるプレイヤーID(納品時の参加者記録) */
  contributorIds: string[]
  /** 配置された順序(炎上ターゲット 'oldest' 用の連番) */
  placedSeq: number
  /** 必要工数の恒久減(個人能力「自動化」など) */
  effortReduction: number
  /**
   * イベントによる一時ブロック(クライアント確認待ち)。
   * この週番号のあいだは着手できない(0 = なし。RULES.md §7-3 BLOCK_TASK)。
   */
  blockedUntilWeek: number
  /** 完了で CS を得られる追加対応か(イベント選択肢由来。RULES.md §4-1) */
  csOnFulfill: number
  /** csOnFulfill の由来イベントカードID(重複防止のキー) */
  sourceEventId: string | null
}

/** プロダクトボードのスロット状態 */
export interface SlotState {
  /** スロットID */
  slotId: string
  /** 現在のレベル(0 = 未納品) */
  level: 0 | DeliverableLevel
  /** 改修の進行キューブ(upgradeCost 到達で Lv2 化) */
  upgradeCubes: number
  /**
   * 品質リスク(RULES.md §2-4)。
   * Lv1 納品で立ち、Lv2 化(納品・改修・磨き込み)で下りる。
   * 手戻り・バグの対象に選ばれやすく、手戻り対応の工数が増える。
   */
  qualityRisk: boolean
  /** 納品・改修に関与したプレイヤーID */
  contributorIds: string[]
}

/** 要件の状態(RULES.md §3) */
export interface RequirementState {
  /** 要件カードID */
  requirementId: string
  /** 現在の区分 */
  tier: RequirementTier
  /** 期限フェーズ(交渉で延長されうる) */
  deadlinePhase: number
  /** 達成済みか(手戻りが乗ると false に戻る) */
  met: boolean
  /** 清算済みか(期限フェーズ末に1回だけ清算する) */
  settled: boolean
  /** 清算結果('failed' = Must 未達確定 / 'expired' = Better 失効 / null = 未清算 or 達成) */
  settledOutcome: 'met' | 'failed' | 'expired' | null
  /** 追加要望として入ってきた要件か(表示用) */
  addedByEvent: boolean
  /** 完了で CS を得られる追加対応か(イベント選択肢由来。RULES.md §4-1) */
  csOnFulfill: number
  /** csOnFulfill の由来イベントカードID(重複防止のキー) */
  sourceEventId: string | null
}

/** プレイヤー状態 */
export interface PlayerState {
  /** プレイヤーID */
  id: string
  /** 表示名 */
  name: string
  /** メンバーカードID */
  memberId: string
  /** 現在のスキル(学習で成長) */
  skills: Record<SkillKind, number>
  /** 疲労(0〜fatigueMax) */
  fatigue: number
  /** 学習予約(今週学習した系統。来週開始時に +1 反映) */
  pendingLearn: SkillKind | null
  /** 個人能力を使ったフェーズ(フェーズ1回制限。0 = 未使用) */
  abilityUsedPhase: number
  /** このフェーズは残業禁止(限界イベント OVERTIME_BAN。0 = なし) */
  overtimeBanPhase: number
  /**
   * 他案件ヘルプによるキャパシティ減(RULES.md §7-3)。
   * この週番号のあいだ、積むキューブが capacityDownCubes だけ減る(0 = なし)。
   */
  capacityDownUntilWeek: number
}

/** 今週のワーカー配属(効果は週末に一括適用) */
export interface WeekAssignment {
  /** プレイヤーID */
  playerId: string
  /** 配属先 */
  target: WorkerTarget
  /** 残業枠か */
  overtime: boolean
}

/** 解決待ちイベント */
export interface PendingEvent {
  /** 発生契機(週末イベント / 疲労限界) */
  kind: 'weekend' | 'limit'
  /** カードID(イベント or 限界イベント) */
  cardId: string
  /** 限界イベントの対象プレイヤーID(それ以外は null) */
  targetPlayerId: string | null
}

/** ログ1行(UI 表示・分析用) */
export interface LogEntry {
  /** 発生フェーズ・週 */
  phase: number
  week: number
  /** 日本語メッセージ */
  message: string
}

/** 最終結果 */
export interface GameResult {
  /** チームの勝敗 */
  outcome: 'win' | 'lose'
  /** 理由(日本語) */
  reason: string
}

/** ゲーム状態 */
export interface GameState {
  /** 適用中の設定 */
  config: GameConfig
  /** コンテンツ一式 */
  content: GameContent
  /** 現在のステップ */
  step: GameStep
  /** 現在のフェーズ(1〜phases) */
  phase: number
  /** 現在の週(1〜roundsPerPhase。スコープ会議中は 0) */
  week: number
  /** CS トラック(唯一の勝敗トラック) */
  cs: number
  /** 予算トラック */
  budget: number
  /** 使用中のプロジェクトシートID */
  projectSheetId: string
  /** PM 帽子を被っているプレイヤーID */
  pmPlayerId: string
  /** プレイヤー */
  players: PlayerState[]
  /** タスク候補プール(カードID。スコープ会議で補充) */
  taskPool: string[]
  /** 盤上のタスク(計画ボード + 割り込みレーン) */
  board: BoardTask[]
  /** プロダクトボード */
  slots: SlotState[]
  /** 公開済みの要件(累積。RULES.md §3) */
  requirements: RequirementState[]
  /** CS を獲得済みの要件ID(重複防止。RULES.md §4-3) */
  csAwardedRequirementIds: string[]
  /** CS を獲得済みのイベントカードID(重複防止。RULES.md §4-3) */
  csAwardedEventIds: string[]
  /** デッキ群 */
  decks: {
    /** タスクカード山(候補プールへの補充元) */
    tasks: DeckState
    /** イベントデッキ */
    events: DeckState
    /** 炎上デッキ */
    fires: DeckState
    /** 限界イベントデッキ */
    limitEvents: DeckState
  }
  /** シード付き乱数の状態 */
  rng: RngState
  /** 今週のワーカー配属 */
  assignments: WeekAssignment[]
  /** Ready 宣言済みプレイヤーID */
  readyPlayerIds: string[]
  /** 週初トラブルの残り炎上ドロー数 */
  remainingFireDraws: number
  /** 週末イベントを引く前フラグ(納品判定のあとに引く) */
  pendingWeekendEventDraw: boolean
  /** 解決待ちイベント */
  pendingEvent: PendingEvent | null
  /** 限界イベント処理待ちのプレイヤーID */
  pendingLimitPlayerIds: string[]
  /** 今フェーズのスコープ変更(Must を緩める交渉)の使用回数 */
  scopeChangeUsedThisPhase: number
  /** 今フェーズのタスク候補引き直しの使用回数 */
  redrawUsedThisPhase: number
  /** 今フェーズの追加請求使用回数 */
  extraBillingUsedThisPhase: number
  /** 今週「段取り」を宣言したプレイヤーID(積むキューブ+1。週末処理でクリア) */
  expeditedPlayerIds: string[]
  /** 盤面配置の連番(placedSeq 採番用) */
  placementCounter: number
  /** 進行ログ(フェーズ開始時にクリアしない。全履歴) */
  log: LogEntry[]
  /** 最終結果(ゲーム中は null) */
  result: GameResult | null
}
