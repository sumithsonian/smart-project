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

  // ── v3.0: 週次ワーカーコミット + 席(rules-v3-proposal.md §1・§2。false 既定で v2 互換)──
  /** 週次ワーカーコミットを有効にするか(行動トークン廃止・席モデル・週次ラウンド) */
  workerCommitEnabled: boolean
  /** 1フェーズの週(ラウンド)数 */
  roundsPerPhase: number
  /** 週初に引く炎上カード枚数(ワーカーモードでは firePerPhase の代わりに使う) */
  firePerRound: number
  /** 残業(週2枠目)の即時疲労 */
  overtimeFatigue: number
  /** 1人・1週あたりの残業枠数 */
  overtimeMaxPerWeek: number
  /** この疲労Lv以上のプレイヤーは残業禁止 */
  noOvertimeAtFatigueLv: number
  /** 追加請求のフェーズ回数上限(ワーカーモードでは PM のフリーアクション) */
  extraBillingPerPhase: number
  /** スキル+1Lv に必要な学習週数 */
  learnWeeksPerLevel: number

  // ── v2.2: 配属トリアージ(rules-v2-proposal.md §2。すべて false 既定で v2.1 互換)──
  /** スキル未達でも代償付きで解決する「やっつけ」を許可するか(false なら従来どおり解決失敗) */
  mismatchEnabled: boolean
  /** やっつけ解決時、参加者に加算する追加疲労 */
  understaffFatigue: number
  /** やっつけ解決時、成果物を1段ダウンさせるか(Lv2→Lv1、Lv1→消失) */
  understaffDowngrade: boolean
  /** やっつけ解決時の CS 減少(品質債務。クライアントQ重み適用) */
  understaffCsPenalty: number
  /** 必要Lvを超える参加者がいる場合の実行コスト割引(過剰スペック) */
  overqualifiedDiscount: number
  /** 外注(予算+CS で専門席を充足するアクション)を許可するか */
  outsourceEnabled: boolean
  /** 外注1回の予算コスト */
  outsourceBudgetCost: number
  /** 外注1回の CS コスト(クライアントC重み適用) */
  outsourceCsCost: number
  /** 外注の回数上限/フェーズ */
  outsourcePerPhase: number
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
  // ── v3.0: 週次ワーカーコミット(既定オフ=v2互換。ホットシートUI側でオンにする)──
  workerCommitEnabled: false,
  roundsPerPhase: 3,
  firePerRound: 1,
  overtimeFatigue: 1,
  overtimeMaxPerWeek: 1,
  noOvertimeAtFatigueLv: 2,
  extraBillingPerPhase: 1,
  learnWeeksPerLevel: 1,
  // ── v2.2: 配属トリアージ(既定オフ。ホットシートUI側でオンにして手触り確認する)──
  mismatchEnabled: false,
  understaffFatigue: 1,
  understaffDowngrade: true,
  understaffCsPenalty: 1,
  overqualifiedDiscount: 0,
  outsourceEnabled: false,
  outsourceBudgetCost: 4,
  outsourceCsCost: 1,
  outsourcePerPhase: 1,
}
