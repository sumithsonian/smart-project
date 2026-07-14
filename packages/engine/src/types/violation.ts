/**
 * RuleViolation — ルール違反(アクション拒否)の型定義
 * 理由コード + 日本語メッセージを持つ判別可能型。
 */

/** ルール違反の理由コード */
export type RuleViolationCode =
  /** 現在のステップでは実行できないアクション */
  | 'INVALID_STEP'
  /** ゲームはすでに終了している */
  | 'GAME_FINISHED'
  /** プレイヤーが見つからない */
  | 'PLAYER_NOT_FOUND'
  /** PM 帽子の権限が必要 */
  | 'NOT_PM'
  /** セットアップ内容が不正 */
  | 'INVALID_SETUP'
  /** 解決待ちイベントがある(先に RESOLVE_EVENT) */
  | 'PENDING_EVENT'
  /** 解決待ちイベントがない */
  | 'NO_PENDING_EVENT'
  /** 対象カード・タスク・スロットが見つからない */
  | 'NOT_FOUND'
  /** 検収条件はすでに約束済み/達成済み */
  | 'ALREADY_COMMITTED'
  /** レーン文法違反(直前の列にタスクがない) */
  | 'LANE_GRAMMAR'
  /** すでに配属済み */
  | 'ALREADY_ASSIGNED'
  /** 取り消せる配属がない */
  | 'NO_ASSIGNMENT'
  /** スキル0の系統には座れない */
  | 'SKILL_ZERO'
  /** 残業できない(上限・疲労・禁止・対象) */
  | 'OVERTIME_FORBIDDEN'
  /** すでに Ready 宣言済み */
  | 'ALREADY_READY'
  /** 納品できない(工数不足・予算不足・対象不正) */
  | 'CANNOT_DELIVER'
  /** 交渉・追加請求・能力のフェーズ回数上限 */
  | 'LIMIT_REACHED'
  /** 対象が不正(能力・交渉の引数など) */
  | 'INVALID_TARGET'
  /** 消火する🔥がない */
  | 'NO_FIRE'
  /** スキル上限 */
  | 'SKILL_MAX'

/** ルール違反(applyAction が GameState の代わりに返す) */
export interface RuleViolation {
  type: 'RULE_VIOLATION'
  /** 理由コード */
  code: RuleViolationCode
  /** 日本語メッセージ(UI でそのまま表示できる) */
  message: string
}

/** RuleViolation の生成ヘルパ */
export function violation(code: RuleViolationCode, message: string): RuleViolation {
  return { type: 'RULE_VIOLATION', code, message }
}

/** applyAction の戻り値が RuleViolation かどうかの判定 */
export function isRuleViolation(value: unknown): value is RuleViolation {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'RULE_VIOLATION'
  )
}
