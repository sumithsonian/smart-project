/**
 * GameAction — エンジンに適用するアクションの型定義
 * アクションはすべてシリアライズ可能(イベントソーシングのログになる)。
 */
import type { GameConfig } from './config'
import type { Role, SkillKind } from './content'

/** トークン配置先 */
export type TokenTarget =
  /** タスクタイル */
  | { kind: 'task'; taskTileId: string }
  /** 学習タイル(対象スキル系統を指定) */
  | { kind: 'learning'; skill: SkillKind }

/** セットアップ時のプレイヤー指定 */
export interface PlayerSetup {
  /** プレイヤーID */
  id: string
  /** 表示名 */
  name: string
  /** ロール */
  role: Role
}

/** ゲームアクション */
export type GameAction =
  /** ゲームセットアップ(RULES.md §7) */
  | {
      type: 'SETUP_GAME'
      /** 乱数シード(リプレイ再現用) */
      seed: number
      /** プレイヤー構成(PM をちょうど1人含むこと) */
      players: PlayerSetup[]
      /** 設定の上書き(省略時は DEFAULT_CONFIG) */
      config?: Partial<GameConfig>
      /** クライアントカードID(省略時はランダム) */
      clientId?: string
      /** プロジェクトカードID(省略時はランダム) */
      projectCardId?: string
      /** プロジェクトシートID(省略時は先頭のシート) */
      projectSheetId?: string
    }
  /** 行動トークンを1個配置(プランニング。タスク/学習タイル) */
  | { type: 'PLACE_TOKEN'; playerId: string; target: TokenTarget }
  /** 配置済みトークンを1個回収(プランニング中の自分のトークンのみ) */
  | { type: 'RETRIEVE_TOKEN'; playerId: string; target: TokenTarget }
  /** 休憩スペースに配置(トークン1個で疲労回復) */
  | { type: 'REST'; playerId: string }
  /** 追加請求スペースに配置(CS と引き換えに予算回復) */
  | { type: 'EXTRA_BILLING'; playerId: string }
  /** 準備完了を宣言(全員揃うと実行ステップへ) */
  | { type: 'DECLARE_READY'; playerId: string }
  /** PM がタスク処理順を宣言(依存順を満たす全未解決タスクの順列) */
  | { type: 'DECLARE_TASK_ORDER'; playerId: string; order: string[] }
  /** 処理順の次のタスクを解決する */
  | { type: 'RESOLVE_NEXT_TASK' }
  /** 秘匿要件:提示された要件カード2枚から1枚を選ぶ */
  | { type: 'SELECT_REQUIREMENT_CARD'; choiceIndex: 0 | 1 }
  /** 解決待ちイベント(フェーズ開始/タスク/限界)を解決する */
  | { type: 'RESOLVE_EVENT' }
  /** フェーズ終了処理のあと次フェーズへ進む(最終フェーズなら勝敗判定) */
  | { type: 'ADVANCE_PHASE' }
  /** 配られた個人目標カードから1枚を選ぶ(v2.1。goal_selection ステップ) */
  | { type: 'SELECT_PERSONAL_GOAL'; playerId: string; choiceIndex: number }
  /** 消火:行動トークンを支払ってタスクの🔥を1個除去する(v2.1。プランニング中) */
  | { type: 'EXTINGUISH_FIRE'; playerId: string; taskTileId: string }
  /** 大炎上のターゲットを PM が選ぶ(v2.1。選択タスクに🔥2個) */
  | { type: 'SELECT_EPIDEMIC_TARGET'; playerId: string; taskTileId: string }
