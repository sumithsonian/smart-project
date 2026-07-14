/**
 * フェーズ終了:約束の清算・次フェーズへの移行(rules-v4-core.md §1-3)
 */
import { describe, expect, it } from 'vitest'
import { applyAction } from '../src/applyAction'
import type { GameState } from '../src/types'
import { drainPending, must, newGame } from './util'

/**
 * 最終週の週末(処理直前)まで局面を直接捏造して END_WEEKEND を呼ぶ。
 * 週2・週3を実プレイすると炎上・イベントの乱数でCSが変動してしまうため、
 * 「約束の清算」ロジック単体を決定的に検証するためにステップを直接進める。
 */
function forcePhaseEnd(state: GameState): GameState {
  const atFinalWeekend: GameState = {
    ...state,
    step: 'weekend',
    week: state.config.roundsPerPhase,
    pendingEvent: null,
    pendingLimitPlayerIds: [],
  }
  return must(
    applyAction(atFinalWeekend, { type: 'END_WEEKEND', playerId: atFinalWeekend.pmPlayerId }),
  )
}

describe('フェーズ終了:約束の清算', () => {
  it('約束済み・未達の検収条件はフェーズ末ごとにCS-1(達成/取り下げまで継続する)', () => {
    let state = newGame(70)
    state = must(
      applyAction(state, { type: 'COMMIT_ACCEPTANCE', playerId: 'a', acceptanceId: 'ac-p1-reqs' }),
    )
    const csAtStart = state.cs

    state = forcePhaseEnd(state)
    expect(state.step).toBe('phase_end')
    expect(state.cs).toBe(csAtStart - 1)
    expect(state.commitments.some((c) => c.acceptanceId === 'ac-p1-reqs')).toBe(true)

    const csAfterPhase1 = state.cs
    state = must(applyAction(state, { type: 'ADVANCE_PHASE' }))
    expect(state.phase).toBe(2)

    // フェーズ2でも約束は残ったままなので、再度ペナルティが起きる
    state = forcePhaseEnd(state)
    expect(state.cs).toBe(csAfterPhase1 - 1)
  })

  it('交渉(grace)で猶予中の約束はフェーズ末の清算をスキップする', () => {
    let state = newGame(71)
    state = must(
      applyAction(state, { type: 'COMMIT_ACCEPTANCE', playerId: 'a', acceptanceId: 'ac-p1-reqs' }),
    )
    state = must(
      applyAction(state, {
        type: 'NEGOTIATE',
        playerId: 'a',
        mode: 'grace',
        acceptanceId: 'ac-p1-reqs',
      }),
    )
    const csAtStart = state.cs

    state = forcePhaseEnd(state)
    expect(state.cs).toBe(csAtStart) // 猶予中なのでペナルティなし
    expect(
      state.commitments.some((c) => c.acceptanceId === 'ac-p1-reqs' && c.graceUntilPhase === 1),
    ).toBe(true)
  })
})

describe('ADVANCE_PHASE', () => {
  it('次フェーズの検収条件が累積公開され、タスク候補プールが補充される', () => {
    let state = newGame(72)
    state = must(applyAction(state, { type: 'FINISH_SCOPE', playerId: 'a' }))
    state = drainPending(state)
    state = forcePhaseEnd(state)
    expect(state.step).toBe('phase_end')

    state = must(applyAction(state, { type: 'ADVANCE_PHASE' }))
    expect(state.phase).toBe(2)
    expect(state.step).toBe('scope_meeting')
    expect(state.openAcceptanceIds).toEqual(
      expect.arrayContaining(['ac-p1-reqs', 'ac-p1-map', 'ac-p2-wire', 'ac-p2-design']),
    )
    expect(state.openAcceptanceIds).toHaveLength(4) // フェーズ1(2枚)+フェーズ2(2枚)
    expect(state.taskPool).toHaveLength(state.config.draftPool) // 8枚まで補充される
  })
})
