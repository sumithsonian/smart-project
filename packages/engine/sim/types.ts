/**
 * バランスシミュレーションの型定義(RULES.md §13)
 *
 * ボットは UI と同じ applyAction / GameState を使い、エンジンのルールをそのまま踏む。
 * (CLAUDE.md:同じエンジンコードを「検証」「クライアント」「バランス分析」で使い回す)
 */
import type { EventCard, GameConfig, GameState } from '../src/types'

/** 割り込みへの向き合い方 */
export type InterruptStance =
  /** 出たらすぐ対応する(トリアージ寄り) */
  | 'always'
  /** あふれそうなときだけ対応する(成り行き寄り) */
  | 'nearOverflow'
  /** 計画タスクを優先し、割り込みはほぼ拾わない */
  | 'never'

/** 謝絶の方針 */
export type DeclineStance =
  /** 謝絶しない */
  | 'never'
  /** あふれる直前に、価値の低いカードを謝絶する */
  | 'nearOverflow'
  /** 手が回らない割り込みは早めに謝絶する */
  | 'eager'

/** Better 要件の扱い */
export type BetterStance =
  /** 余力があれば狙う(既定) */
  | 'opportunistic'
  /** 即見送りにして Must に集中する */
  | 'drop'
  /** Must に引き上げてでも取りにいく */
  | 'chase'

/** 納品品質の方針 */
export type QualityStance =
  /** 要件が求める Lv までで納める */
  | 'requirement'
  /** とにかく早く Lv1 で納める */
  | 'fast'
  /** 可能なら Lv2 まで積む */
  | 'polish'

/** ボット戦略 */
export interface Strategy {
  /** 戦略名(集計の見出し) */
  name: string
  /** 説明 */
  description: string
  betters: BetterStance
  interrupts: InterruptStance
  decline: DeclineStance
  quality: QualityStance
  /** 1フェーズあたり学習に割く行動枠の上限 */
  learnPerPhase: number
  /** 残業を使うか */
  useOvertime: boolean
  /** 達成できそうにない Must を交渉で Better 化するか */
  renegotiateMusts: boolean
  /** 極端戦略の検証用:Must も含めて可能な限り見送る */
  dropMusts?: boolean
  /**
   * 土台を守る:後続タスクの前提になっている成果物は、要件が求めていなくても Lv2 で納める。
   * RULES.md §2-4-6(粗い土台は後続を重くする)が判断を変える力を持つかを測るためのふるまい。
   */
  protectFoundations?: boolean
  /**
   * エンジンビルド:要件が求めていなくても、指定した成果物を **Lv2 まで作りにいく**。
   * v6 提案 §5(基盤成果物の完成ボーナス)を能動的に狙う戦略のためのふるまい。
   *
   * v5.1 の `protectFoundations` は「後続の**前提**になっているスロット」しか守らないため、
   * スタイルガイド・CMS のような**葉ノード**には届かない(実測 Lv2 到達 0.45枚/ゲーム)。
   * ボーナスの効果を測るには、そこを狙う意思が要る。
   */
  engineSlots?: string[]
}

/** 1ゲームの計測結果 */
export interface GameMetrics {
  strategy: string
  seed: number
  outcome: 'win' | 'lose'
  finalCs: number
  /** 最終検収まで到達したか(false = 途中で CS 0 未満=デススパイラル) */
  survived: boolean
  phasesPlayed: number
  weeksPlayed: number

  // ── スコープ ──
  mustTotal: number
  mustMet: number
  betterTotal: number
  betterMet: number
  trustBonuses: number
  scopeDemotes: number
  scopeDrops: number

  // ── 割り込み ──
  interruptsSpawned: number
  interruptsResolved: number
  declines: number
  overflows: number

  // ── 計画と依存(Issue #2 / #4 の実害確認) ──
  /** ブロック中で座れなかった回数 */
  blockedAttempts: number
  /** 「今週の予定なのにブロック中」だったタスクの延べ数(依存遅延の実害) */
  blockedPlanned: number
  /** 今週やれる仕事が1つも無かった週 */
  noWorkWeeks: number
  /** 有効な仕事がなく休憩に流れた行動枠 */
  idleActions: number
  /** 全行動枠 */
  totalActions: number
  /** 誰ひとり生産的な作業に就けなかった週 */
  idleWeeks: number
  /** 未完了で翌週へ繰り越された回数 */
  carryOvers: number

  // ── 計画の質(定期観測①:計画部分は機能しているか)──
  /** 納品したタスクのうち、最初に立てた予定週どおりに終わった数 */
  onTimeDeliveries: number
  /** 予定週を追跡できた納品数(分母) */
  trackedDeliveries: number
  /** 再計画で予定週を動かした回数 */
  replans: number
  /** いずれかの系統で予定工数 > 供給能力 だった週(=無理な計画を選んだ週) */
  overloadedWeeks: number

  // ── 実施ジレンマ(定期観測②:置き場所で悩みが生じているか)──
  /** 週ごとの「着手可能な残り人日 / チーム供給人日」の合計(平均を取るため) */
  demandSupplySum: number
  /** 需要が供給を超えた週(全部はできない=ジレンマがある週) */
  contentionWeeks: number
  /** いずれかの系統で needs > その系統の供給 だった週(専門家の取り合い。#7) */
  specialistContentionWeeks: number
  /** 着手可能だったのに誰も座らなかった仕事の延べ数 */
  forgoneWork: number

  // ── 品質と見積(Issue #3 / #5) ──
  /** Lv1 で納品した数(= 品質リスクを作った数) */
  lv1Deliveries: number
  /** Lv2 で納品した数 */
  lv2Deliveries: number
  /** 改修・磨き込みで Lv2 にした数 */
  upgrades: number
  /** 実工数 − 見積工数 の合計(上振れの総量) */
  effortOverrun: number
  /** 実工数が公開されたタスク数 */
  effortRevealed: number
  /** ゲーム終了時に品質リスクが残っていたスロット数 */
  qualityRiskLeft: number

  // ── 基盤ボーナス(v6 提案 §5 の検証)──
  /** ゲーム終了時に Lv2 に達していた基盤成果物の枚数(スタイルガイド / CMS)*/
  foundationLv2: number
  /** 基盤ボーナスの恒久工数減が乗ったタスク数 */
  foundationBoosts: number
}

/** 集計結果 */
export interface Aggregate {
  strategy: string
  games: number
  winRate: number
  meanFinalCs: number
  deathSpiralRate: number
  mustMetRate: number
  betterMetRate: number
  meanTrustBonuses: number
  declineRate: number
  overflowPerGame: number
  interruptsPerGame: number
  idleActionRate: number
  blockedPerGame: number
  blockedPlannedPerGame: number
  idleWeekRate: number
  noWorkWeekRate: number
  meanEffortOverrun: number
  lv1Share: number
  meanQualityRiskLeft: number
  carryOversPerGame: number

  // ── 定期観測 ──
  /** ① 計画遵守率:最初の予定週どおりに納品できた割合 */
  onTimeRate: number
  /** ① 再計画回数/ゲーム */
  replansPerGame: number
  /** ① 過負荷週の割合(無理な計画を選んだ週) */
  overloadedWeekRate: number
  /** ② 需要/供給 比(1 を超えると「全部はできない」) */
  demandSupplyRatio: number
  /** ② 需要が供給を超えた週の割合 */
  contentionWeekRate: number
  /** ② 専門家の取り合いが起きた週の割合 */
  specialistContentionRate: number
  /** ② 見送られた仕事/週 */
  forgonePerWeek: number

  // ── 基盤ボーナス(v6 提案 §5)──
  /** 基盤成果物の Lv2 到達数/ゲーム(v6 提案 §10-2 の基準⑤)*/
  foundationLv2PerGame: number
  /** 基盤ボーナスが乗ったタスク数/ゲーム */
  foundationBoostsPerGame: number
}

/** 1条件ぶんの実行設定 */
export interface RunSpec {
  label: string
  config?: Partial<GameConfig>
  games: number
  baseSeed: number
}

/** イベント選択のフック(戦略ごとに差し替える) */
export type EventChooser = (state: GameState, card: EventCard, strategy: Strategy) => string
