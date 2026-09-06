/**
 * GameConfig — 調整可能パラメータ一覧(RULES.md §11)
 * バランス数値はすべてここに集約し、ハードコードしない。
 */
import type { RiskLevel } from './content'

/** リスク別の実工数補正の分布(等確率で1つ引く。RULES.md §2-2) */
export type RiskVariance = Record<RiskLevel, number[]>

/** ゲーム設定(バランス調整パラメータ) */
export interface GameConfig {
  // ── 規模 ──
  /** プレイヤー数(4〜5) */
  playerCount: number
  /** フェーズ数 */
  phases: number
  /** 1フェーズの週数(= 計画ボードの週数) */
  roundsPerPhase: number
  /** スキル上限 */
  skillMax: number

  // ── 品質 ──
  /** 納品前の Lv2 積み増し量 */
  qualityOvershoot: number
  /** 納品後の Lv1→Lv2 改修に必要なキューブ数 */
  upgradeCost: number
  /** 品質リスクのあるスロットへの手戻り対応の工数増(RULES.md §2-4) */
  qualityRiskEffortPenalty: number

  // ── 見積差異(RULES.md §2-2) ──
  /** リスク別の実工数補正の分布 */
  riskVariance: RiskVariance

  // ── スコープ(RULES.md §3) ──
  /** タスク候補プールの枚数(スコープ会議時に補充) */
  draftPool: number
  /** Must 未達1件の CS 減(期限フェーズ末に1回) */
  mustMissCs: number
  /** Better 達成1件の CS 増 */
  betterMeetCs: number
  /** 信頼ボーナス:期限フェーズの Must を全達成したときの CS 増 */
  allMustBonusCs: number
  /** Must → Better 化の CS コスト */
  demoteMustCs: number
  /** Must → 見送りの CS コスト */
  dropMustCs: number
  /** 期限を +1 フェーズ延長するときの予算コスト */
  extendDeadlineBudget: number
  /** Must を緩める変更(格下げ・見送り・期限延長)のフェーズ回数上限 */
  scopeChangePerPhase: number
  /** タスク候補の引き直しのフェーズ回数上限 */
  redrawPerPhase: number

  // ── 最終検収(RULES.md §4-4) ──
  /** 最終検収:未達成1件あたりの CS 減 */
  finalMissCs: number
  /** 最終検収:Lv2 要求を Lv1 で充足した1件あたりの CS 減 */
  finalCompromiseCs: number

  // ── 炎上 ──
  /** 週初に引く炎上カード枚数 */
  firePerRound: number
  /** この個数目の🔥で延焼 */
  fireOutbreakThreshold: number

  // ── 疲労 ──
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

  // ── 経済 ──
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

  // ── 割り込み(RULES.md §8-4) ──
  /** 割り込みレーンの枠数 */
  interruptCapacity: number
  /** あふれ1件の CS ペナルティ */
  overflowCs: number
  /** 謝絶1件の CS ペナルティ */
  declineCs: number
  /** 他案件ヘルプ:次週に積むキューブの減少量 */
  capacityDownCubes: number
}

/** RULES.md §11 の初期値 */
export const DEFAULT_CONFIG: GameConfig = {
  playerCount: 4,
  phases: 4,
  roundsPerPhase: 3,
  skillMax: 3,

  qualityOvershoot: 2,
  upgradeCost: 3,
  qualityRiskEffortPenalty: 1,

  riskVariance: {
    low: [0, 0, 1],
    medium: [-1, 0, 1, 2],
    high: [0, 1, 2, 2],
  },

  draftPool: 8,
  mustMissCs: 2,
  betterMeetCs: 1,
  allMustBonusCs: 1,
  demoteMustCs: 1,
  dropMustCs: 2,
  extendDeadlineBudget: 3,
  scopeChangePerPhase: 2,
  redrawPerPhase: 1,

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

  interruptCapacity: 4,
  overflowCs: 2,
  declineCs: 1,
  capacityDownCubes: 1,
}
