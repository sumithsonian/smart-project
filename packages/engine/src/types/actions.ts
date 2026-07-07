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

/** ワーカーの配属先(v3.0 週次ワーカーコミット) */
export type WorkerTarget =
  /** タスクの席(定義済みの専門席/人手席) */
  | { kind: 'seat'; taskTileId: string; seatIndex: number }
  /** 🔥ぶんの応援(席ではなく追加工数。🔥数まで) */
  | { kind: 'support'; taskTileId: string }
  /** 学習(今週は現場に立たない。フェーズ終了時に +Lv) */
  | { kind: 'learning'; skill: SkillKind }
  /** 休憩(疲労 -restRecovery) */
  | { kind: 'rest' }
  /** 消火(対象タスクの🔥1個を週末に除去) */
  | { kind: 'extinguish'; taskTileId: string }

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
  /** 外注:予算+CS を払ってタスクの専門席を充足する(v2.2。プランニング中) */
  | { type: 'OUTSOURCE_TASK'; playerId: string; taskTileId: string }
  /** 今週の配属を宣言する(v3.0。overtime=true は残業枠。朝会中のみ) */
  | { type: 'ASSIGN_WORKER'; playerId: string; target: WorkerTarget; overtime?: boolean }
  /** 今週の配属を取り消す(v3.0。朝会中のみ。効果は週末適用なので自由に組み替え可) */
  | { type: 'UNASSIGN_WORKER'; playerId: string; overtime?: boolean }
