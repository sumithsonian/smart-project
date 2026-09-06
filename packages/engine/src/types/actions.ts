/**
 * GameAction — エンジンに適用するアクションの型定義(RULES.md)
 * アクションはすべてシリアライズ可能(イベントソーシングのログになる)。
 */
import type { GameConfig } from './config'
import type { RequirementTier, SkillKind } from './content'

/** ワーカーの配属先(朝会) */
export type WorkerTarget =
  /** 盤上のタスクに座る(自分のその系統スキルぶんキューブを積む) */
  | { kind: 'task'; cardId: string }
  /** 納品済み Lv1 スロットに座る(改修。系統はスロット定義) */
  | { kind: 'slot'; slotId: string }
  /** 学習(来週からスキル+1) */
  | { kind: 'learn'; skill: SkillKind }
  /** 休憩(疲労 -restRecovery) */
  | { kind: 'rest' }
  /** 消火(任意のタスクの🔥1個を除去。系統・スキル不問) */
  | { kind: 'extinguish'; cardId: string }

/** PM のスコープ交渉のモード(RULES.md §3-5) */
export type ScopeChangeMode =
  /** Must → Better 化(CS -demoteMustCs) */
  | 'demote'
  /** Must → 見送り(CS -dropMustCs) */
  | 'drop'
  /** 期限を +1 フェーズ延長(予算 -extendDeadlineBudget) */
  | 'extend'
  /** Better → Must 化(無料) */
  | 'promote'
  /** 見送り → Better に戻す(無料) */
  | 'restore'

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
  // ── スコープ会議・計画ボード(RULES.md §5) ──
  /**
   * タスク候補を計画ボードに配置する(PM)。
   * week は 1〜roundsPerPhase、または null(Backlog)。
   */
  | { type: 'PLAN_TASK'; playerId: string; cardId: string; week: number | null }
  /** 盤上タスクの予定週を変更する(PM。スコープ会議 or 週末の再計画) */
  | { type: 'MOVE_TASK'; playerId: string; cardId: string; week: number | null }
  /** 盤上タスクを見送りにする(PM。場から外し、積んだキューブは失われる) */
  | { type: 'DROP_TASK'; playerId: string; cardId: string }
  /** タスク候補を引き直す(PM。スコープ会議中・フェーズ redrawPerPhase 回まで) */
  | { type: 'REDRAW_TASKS'; playerId: string; cardIds: string[] }
  /** スコープ会議を締めて第1週へ(PM) */
  | { type: 'FINISH_SCOPE'; playerId: string }
  // ── スコープ交渉(RULES.md §3-5) ──
  /** 要件の区分・期限を変更する(PM) */
  | {
      type: 'CHANGE_SCOPE'
      playerId: string
      requirementId: string
      mode: ScopeChangeMode
    }
  // ── 週次 ──
  /** 解決待ちイベント(週末/限界)を解決する。選択肢があれば choiceId を指定する */
  | { type: 'RESOLVE_EVENT'; choiceId?: string }
  /** 今週の配属を宣言する(overtime=true は残業枠) */
  | { type: 'ASSIGN_WORKER'; playerId: string; target: WorkerTarget; overtime?: boolean }
  /** 今週の配属を取り消す */
  | { type: 'UNASSIGN_WORKER'; playerId: string; overtime?: boolean }
  /** 準備完了を宣言(全員揃うと週末処理へ) */
  | { type: 'DECLARE_READY'; playerId: string }
  /** 準備完了を取り消す(全員揃う前のみ。RULES.md §10-4) */
  | { type: 'CANCEL_READY'; playerId: string }
  /** 週末:必要工数に達したタスクを納品する(チーム判断。ホットシートでは誰でも操作可) */
  | { type: 'DELIVER_TASK'; cardId: string }
  /** 週末を締めて次週(または フェーズ終了)へ(PM) */
  | { type: 'END_WEEKEND'; playerId: string }
  /** フェーズ終了の清算を確認して次フェーズへ(最終フェーズなら勝敗判定) */
  | { type: 'ADVANCE_PHASE' }
  // ── PM 帽子・能力 ──
  /** 追加請求(PM。フェーズ1回。CS と引き換えに予算回復) */
  | { type: 'EXTRA_BILLING'; playerId: string }
  /** PM 謝絶(回数無制限・いつでも):割り込みレーンのカード1枚を取り下げる */
  | { type: 'DECLINE_INTERRUPT'; playerId: string; cardId: string }
  /** 個人能力の使用(フェーズ1回。行動枠を使わない) */
  | { type: 'USE_ABILITY'; playerId: string; cardId?: string; slotId?: string }

/** 要件の区分(再エクスポート。UI から使う) */
export type { RequirementTier }
