/**
 * GameConfig — 調整可能パラメータ一覧(rules-v4-core.md §6)
 * バランス数値はすべてここに集約し、ハードコードしない。
 */

/** ゲーム設定(バランス調整パラメータ) */
export interface GameConfig {
  /** プレイヤー数(4〜5) */
  playerCount: number
  /** フェーズ数 */
  phases: number
  /** 1フェーズの週数 */
  roundsPerPhase: number
  /** スキル上限 */
  skillMax: number
  /** 納品前の Lv2 積み増し量 */
  qualityOvershoot: number
  /** 納品後の Lv1→Lv2 改修に必要なキューブ数 */
  upgradeCost: number
  /** フェーズごとに公開する検収条件枚数 */
  acceptancePerPhase: number
  /** タスク候補プールの枚数(スコープ会議時に補充) */
  draftPool: number
  /** 約束済み・未達の検収条件1件・1フェーズあたりの CS 減 */
  commitPenaltyCs: number
  /** 最終検収:未達成1件あたりの CS 減 */
  finalMissCs: number
  /** 最終検収:Lv2 要求を Lv1 で充足した1件あたりの CS 減 */
  finalCompromiseCs: number
  /** 週初に引く炎上カード枚数 */
  firePerRound: number
  /** この個数目の🔥で延焼 */
  fireOutbreakThreshold: number
  /** 疲労上限(到達で限界イベント) */
  fatigueMax: number
  /** この疲労値以上は残業禁止 */
  noOvertimeAtFatigue: number
  /** 限界イベント解決後に戻る疲労値 */
  limitResetFatigue: number
  /** 残業の即時疲労 */
  overtimeFatigue: number
  /** 休憩の疲労回復量 */
  restRecovery: number
  /** フェーズ終了時の疲労自然回復量 */
  phaseEndRecovery: number
  /** 初期 CS(プロジェクトシートで上書き可) */
  initialCs: number
  /** 初期予算(プロジェクトシートで上書き可) */
  initialBudget: number
  /** 追加請求1回の予算回復量 */
  extraBillingBudget: number
  /** 追加請求1回の CS コスト */
  extraBillingCsCost: number
  /** 追加請求のフェーズ回数上限 */
  extraBillingPerPhase: number
  /** CS が 0 未満になった時点で即時敗北するか */
  csInstantLose: boolean
}

/** rules-v4-core.md §6 の初期値 */
export const DEFAULT_CONFIG: GameConfig = {
  playerCount: 4,
  phases: 4,
  roundsPerPhase: 3,
  skillMax: 3,
  qualityOvershoot: 2,
  upgradeCost: 3,
  acceptancePerPhase: 2,
  draftPool: 8,
  commitPenaltyCs: 1,
  finalMissCs: 2,
  finalCompromiseCs: 1,
  firePerRound: 1,
  fireOutbreakThreshold: 3,
  fatigueMax: 4,
  noOvertimeAtFatigue: 2,
  limitResetFatigue: 2,
  overtimeFatigue: 1,
  restRecovery: 2,
  phaseEndRecovery: 1,
  initialCs: 5,
  initialBudget: 18,
  extraBillingBudget: 3,
  extraBillingCsCost: 1,
  extraBillingPerPhase: 1,
  csInstantLose: true,
}
