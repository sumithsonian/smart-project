/**
 * GameAction — エンジンに適用するアクションの型定義(rules-v4-core.md)
 * アクションはすべてシリアライズ可能(イベントソーシングのログになる)。
 */
import type { GameConfig } from './config'
import type { SkillKind } from './content'

/** ワーカーの配属先(朝会) */
export type WorkerTarget =
  /** 盤上のタスクに座る(自分のその系統スキルぶんキューブを積む) */
  | { kind: 'task'; cardId: string }
  /** 納品済みスロットに座る(改修 or 手戻り対応。系統はスロット定義) */
  | { kind: 'slot'; slotId: string }
  /** 学習(来週からスキル+1) */
  | { kind: 'learn'; skill: SkillKind }
  /** 休憩(疲労 -restRecovery) */
  | { kind: 'rest' }
  /** 消火(任意のタスクの🔥1個を除去。系統・スキル不問) */
  | { kind: 'extinguish'; cardId: string }

/** PM 交渉のモード */
export type NegotiationMode =
  /** 約束1つの清算を1フェーズ猶予 */
  | 'grace'
  /** 約束1つの取り下げ(即時 CS-1、以後の罰なし) */
  | 'withdraw'
  /** スコープ会議中:タスク候補2枚を引き直す */
  | 'redraw'

/** セットアップ時のプレイヤー指定 */
export interface PlayerSetup {
  /** プレイヤーID */
  id: string
  /** 表示名 */
  name: string
  /** メンバーカードID(省略時はランダム配布) */
  memberId?: string
}

/** ゲームアクション */
export type GameAction =
  /** ゲームセットアップ */
  | {
      type: 'SETUP_GAME'
      /** 乱数シード(リプレイ再現用) */
      seed: number
      /** プレイヤー構成 */
      players: PlayerSetup[]
      /** PM 帽子を被るプレイヤーID(省略時は先頭) */
      pmPlayerId?: string
      /** 設定の上書き(省略時は DEFAULT_CONFIG) */
      config?: Partial<GameConfig>
      /** プロジェクトシートID(省略時は先頭) */
      projectSheetId?: string
    }
  // ── スコープ会議(PM が締める) ──
  /** 検収条件を約束する(PM) */
  | { type: 'COMMIT_ACCEPTANCE'; playerId: string; acceptanceId: string }
  /** タスク候補を場(WBS レーン)に配置する(PM。列はカード定義) */
  | { type: 'PLACE_TASK'; playerId: string; cardId: string }
  /** スコープ会議を締めて第1週へ(PM) */
  | { type: 'FINISH_SCOPE'; playerId: string }
  // ── 週次 ──
  /** 解決待ちイベント(週初トラブル/限界)を解決する */
  | { type: 'RESOLVE_EVENT' }
  /** 今週の配属を宣言する(overtime=true は残業枠) */
  | { type: 'ASSIGN_WORKER'; playerId: string; target: WorkerTarget; overtime?: boolean }
  /** 今週の配属を取り消す */
  | { type: 'UNASSIGN_WORKER'; playerId: string; overtime?: boolean }
  /** 準備完了を宣言(全員揃うと週末処理へ) */
  | { type: 'DECLARE_READY'; playerId: string }
  /** 週末:必要工数に達したタスクを納品する(チーム判断。ホットシートでは誰でも操作可) */
  | { type: 'DELIVER_TASK'; cardId: string }
  /** 週末を締めて次週(または フェーズ終了)へ(PM) */
  | { type: 'END_WEEKEND'; playerId: string }
  /** フェーズ終了の清算を確認して次フェーズへ(最終フェーズなら勝敗判定) */
  | { type: 'ADVANCE_PHASE' }
  // ── PM 帽子・能力 ──
  /** PM 交渉(フェーズ1回) */
  | {
      type: 'NEGOTIATE'
      playerId: string
      mode: NegotiationMode
      /** grace / withdraw の対象 */
      acceptanceId?: string
      /** redraw で捨てる候補カードID(最大2枚) */
      cardIds?: string[]
    }
  /** 追加請求(PM。フェーズ1回。CS と引き換えに予算回復) */
  | { type: 'EXTRA_BILLING'; playerId: string }
  /** 個人能力の使用(フェーズ1回。行動枠を使わない) */
  | { type: 'USE_ABILITY'; playerId: string; cardId?: string; slotId?: string }
