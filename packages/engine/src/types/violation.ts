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
  /** 行動トークンが足りない */
  | 'NOT_ENOUGH_TOKENS'
  /** 対象のタスクが見つからない */
  | 'TASK_NOT_FOUND'
  /** 解決済みタスクへの操作 */
  | 'TASK_ALREADY_RESOLVED'
  /** 回収できるトークンがない */
  | 'NO_TOKEN_TO_RETRIEVE'
  /** すでに Ready 宣言済み */
  | 'ALREADY_READY'
  /** PM 以外によるタスク順宣言 */
  | 'NOT_PM'
  /** タスク処理順が不正(依存順違反・過不足) */
  | 'INVALID_TASK_ORDER'
  /** タスク処理順が未宣言 */
  | 'ORDER_NOT_DECLARED'
  /** 解決待ちイベントがある(先に RESOLVE_EVENT が必要) */
  | 'PENDING_EVENT'
  /** 解決待ちイベントがない */
  | 'NO_PENDING_EVENT'
  /** 要件カードの選択待ちがある(先に SELECT_REQUIREMENT_CARD が必要) */
  | 'PENDING_REQUIREMENT'
  /** 要件カードの選択待ちがない */
  | 'NO_PENDING_REQUIREMENT'
  /** 解決すべきタスクが残っていない */
  | 'NO_MORE_TASKS'
  /** フェーズ終了処理が完了していない */
  | 'PHASE_NOT_ENDED'
  /** セットアップ内容が不正(人数・ロール構成・ID 不一致) */
  | 'INVALID_SETUP'
  /** スキル上限のため学習できない */
  | 'SKILL_MAX'
  /** 個人目標は選択済み */
  | 'GOAL_ALREADY_SELECTED'
  /** 個人目標の選択が不正(選択肢の範囲外など) */
  | 'INVALID_GOAL_CHOICE'
  /** 全員の個人目標選択が終わっていない */
  | 'GOAL_SELECTION_PENDING'
  /** 対象タスクに🔥がない */
  | 'NO_FIRE'
  /** 大炎上のターゲット選択待ちがない */
  | 'NO_PENDING_EPIDEMIC'
  /** 炎上フェーズの処理中(大炎上ターゲットの選択待ちなど) */
  | 'FIRE_PHASE_ACTIVE'
  /** スキル条件を満たす参加者がいない(v2.2:mismatchEnabled=false 時) */
  | 'SKILL_NOT_MET'
  /** 実行コストに対して予算が不足(v2.2 外注など) */
  | 'BUDGET_SHORT'
  /** 外注が無効(outsourceEnabled=false) */
  | 'OUTSOURCE_DISABLED'
  /** すでに外注済みのタスク */
  | 'ALREADY_OUTSOURCED'
  /** 外注できる専門席がない(スキル条件・秘匿要件なし) */
  | 'NO_SKILL_SEAT'
  /** フェーズの外注上限に達した */
  | 'OUTSOURCE_LIMIT'

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
