/**
 * フェーズ終了処理(RULES.md §2-4)
 * ※ 判定ロジックは Task 5 で実装する。現状はステップ遷移のみ。
 */
import type { GameState } from '../types/state'

/** 実行ステップ完了後に呼ばれ、フェーズ終了判定を行って phase_end ステップへ遷移する */
export function processPhaseEnd(state: GameState): GameState {
  return { ...state, step: 'phase_end' }
}
