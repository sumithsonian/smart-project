/**
 * GameConfig — 調整可能パラメータ一覧(RULES.md §8)
 * バランス数値はすべてここに集約し、ハードコードしない。
 */

/** クライアント QCD 重みの適用方式 */
export type QcdWeightMode = 'multiply' | 'add'

/** ゲーム設定(バランス調整パラメータ) */
export interface GameConfig {
  /** プレイヤー数(4〜5。当面4のみ) */
  playerCount: number
  /** フェーズ数 */
  phases: number
  /** フェーズごとの行動トークン補充数 */
  tokensPerPhase: number
  /** 疲労レベル上限(Lv0〜Lv3) */
  fatigueMax: number
  /** 通常タスク実行時の疲労 */
  fatiguePerTask: number
  /** 重タスク実行時の疲労 */
  fatiguePerHeavyTask: number
  /** 疲労Lv2時の次フェーズ行動トークン補充ペナルティ */
  fatigueLv2TokenPenalty: number
  /** 休憩スペース(トークン1個)での疲労回復量 */
  restRecovery: number
  /** フェーズ終了時の疲労自然回復量 */
  phaseEndRecovery: number
  /** 限界イベント解決後に戻る疲労レベル */
  limitEventResetLevel: number
  /** 追加請求 CS-1 あたりの予算回復量 */
  extraBillingBudget: number
  /** 追加請求1回あたりの CS コスト */
  extraBillingCsCost: number
  /** フェーズごとに公開するタスクタイル枚数(5〜6) */
  tasksPerPhase: number
  /** 学習タイル枚数(2〜3) */
  learningTiles: number
  /** スキルレベル上限(RULES.md §5 暫定 Lv3) */
  skillMax: number
  /** クライアント QCD 重みの適用方式 */
  qcdWeightMode: QcdWeightMode
  /** CS が 0 未満になった時点で即時敗北するか */
  csInstantLose: boolean
  /** 未解決タスク上のトークンを次フェーズに持ち越すか */
  carryOverTokens: boolean

  // ── v2.1: 炎上システム(RULES.md §10)──
  /** 炎上システムを有効にするか(false で v1 ルール) */
  fireEnabled: boolean
  /** フェーズ開始時に引く炎上カード枚数 */
  firePerPhase: number
  /** この個数目の🔥で延焼(それ自体は置かれない) */
  fireOutbreakThreshold: number
  /** 延焼1回あたりの CS 減少 */
  fireOutbreakCsPenalty: number
  /** 消火1回に使う行動トークン数 */
  extinguishCost: number
  /** 大炎上(エピデミック)カードの枚数 */
  epidemicCount: number

  // ── v2.1: EP・マイルストーン(RULES.md §11)──
  /** EP(自分の仕事が他人に使われた回数)を有効にするか */
  epEnabled: boolean
  /** マイルストーン(公開・早取り目標)を有効にするか */
  milestonesEnabled: boolean
  /** 公開するマイルストーン枚数 */
  milestoneCount: number
  /** 個人目標の配布枚数(1枚選ぶ。1なら従来どおり自動割当) */
  personalGoalChoices: number
}

/** RULES.md §8 の初期値 */
export const DEFAULT_CONFIG: GameConfig = {
  playerCount: 4,
  phases: 4,
  tokensPerPhase: 5,
  fatigueMax: 3,
  fatiguePerTask: 1,
  fatiguePerHeavyTask: 2,
  fatigueLv2TokenPenalty: 1,
  restRecovery: 2,
  phaseEndRecovery: 1,
  limitEventResetLevel: 2,
  extraBillingBudget: 3,
  extraBillingCsCost: 1,
  tasksPerPhase: 5,
  learningTiles: 2,
  skillMax: 3,
  qcdWeightMode: 'multiply',
  csInstantLose: true,
  carryOverTokens: true,
  fireEnabled: true,
  firePerPhase: 2,
  fireOutbreakThreshold: 4,
  fireOutbreakCsPenalty: 1,
  extinguishCost: 1,
  epidemicCount: 2,
  epEnabled: true,
  milestonesEnabled: true,
  milestoneCount: 3,
  personalGoalChoices: 2,
}
