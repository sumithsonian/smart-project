/**
 * GameState — ゲーム状態の型定義(rules-v4-core.md)
 * 状態はアクションログのリプレイで導出する(イベントソーシング)。
 */
import type { GameConfig } from './config'
import type { DeliverableLevel, GameContent, InterruptKind, Lane, SkillKind } from './content'
import type { WorkerTarget } from './actions'

/** 現在のステップ */
export type GameStep =
  | 'setup'
  /** スコープ会議(約束・WBS配置。PM が FINISH_SCOPE で締める) */
  | 'scope_meeting'
  /** 朝会(週次の同時配置。全員 Ready で週末へ) */
  | 'standup'
  /** 週末(納品判定。END_WEEKEND で次週 or フェーズ終了へ) */
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

/** 盤上のタスク(WBS レーンに配置されたタスクカード) */
export interface BoardTask {
  /** タスクカードID */
  cardId: string
  /** 積まれた工数キューブ */
  cubes: number
  /** 🔥の数(1個 = 必要工数+1) */
  fire: number
  /** 配置された列(差し込みは 'interrupt') */
  lane: Lane | 'interrupt'
  /** 差し込みの種類(通常タスクは null) */
  interrupt: InterruptKind | null
  /** 差し込みの必要工数(通常タスクはカード定義を使うため null) */
  interruptEffort: number | null
  /** 相談ごとの報酬予算(consult のみ) */
  rewardBudget: number | null
  /** キューブを積んだことのあるプレイヤーID(納品時の参加者記録) */
  contributorIds: string[]
  /** 配置された順序(炎上ターゲット 'oldest' 用の連番) */
  placedSeq: number
  /** 必要工数の恒久減(個人能力「自動化」など) */
  effortReduction: number
}

/** プロダクトボードのスロット状態 */
export interface SlotState {
  /** スロットID */
  slotId: string
  /** 現在のレベル(0 = 未納品) */
  level: 0 | DeliverableLevel
  /** 手戻りキューブ(乗っている間、検収上は未達扱い) */
  reworkCubes: number
  /** 改修の進行キューブ(upgradeCost 到達で Lv2 化) */
  upgradeCubes: number
  /** 納品・改修に関与したプレイヤーID */
  contributorIds: string[]
}

/** 検収条件の約束 */
export interface Commitment {
  /** 検収条件カードID */
  acceptanceId: string
  /** 約束したフェーズ */
  committedPhase: number
  /** 交渉による猶予(このフェーズまで清算免除。0 = なし) */
  graceUntilPhase: number
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
  /** 発生契機 */
  kind: 'week_start' | 'limit'
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
  /** 盤上のタスク(WBS + 割り込みレーン) */
  board: BoardTask[]
  /** プロダクトボード */
  slots: SlotState[]
  /** 公開済みの検収条件カードID(累積) */
  openAcceptanceIds: string[]
  /** 約束(取り下げ・達成で解除) */
  commitments: Commitment[]
  /** 達成済みの検収条件カードID */
  metAcceptanceIds: string[]
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
  /** 週初トラブルでイベントを引く前フラグ */
  pendingWeekEventDraw: boolean
  /** 解決待ちイベント */
  pendingEvent: PendingEvent | null
  /** 限界イベント処理待ちのプレイヤーID */
  pendingLimitPlayerIds: string[]
  /** PM 交渉を使ったフェーズ(フェーズ1回。0 = 未使用) */
  negotiationUsedPhase: number
  /** 今フェーズの追加請求使用回数 */
  extraBillingUsedThisPhase: number
  /** 今週「段取り」を宣言したプレイヤーID(積むキューブ+1。週末処理でクリア) */
  expeditedPlayerIds: string[]
  /** 盤面配置の連番(placedSeq 採番用) */
  placementCounter: number
  /** 各列への累計配置数(レーン文法の判定用) */
  lanePlacedCount: Record<Lane, number>
  /** 進行ログ(フェーズ開始時にクリアしない。全履歴) */
  log: LogEntry[]
  /** 最終結果(ゲーム中は null) */
  result: GameResult | null
}
