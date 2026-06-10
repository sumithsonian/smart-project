/**
 * replay — アクションログから状態を再構築する(イベントソーシング)
 */
import type { GameAction } from './types/actions'
import type { GameState } from './types/state'
import { isRuleViolation } from './types/violation'
import { applyAction } from './applyAction'
import { createInitialState } from './initialState'

/**
 * 空状態から actions を順に適用して最終状態を返す。
 * ログに不正なアクションが含まれていた場合は例外を投げる(壊れたログの検出)。
 */
export function replay(actions: readonly GameAction[]): GameState {
  let state = createInitialState()
  actions.forEach((action, index) => {
    const next = applyAction(state, action)
    if (isRuleViolation(next)) {
      throw new Error(
        `リプレイ失敗: ${index} 番目のアクション ${action.type} が拒否されました(${next.code}: ${next.message})`,
      )
    }
    state = next
  })
  return state
}
