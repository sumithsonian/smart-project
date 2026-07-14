/**
 * PM 帽子:交渉(NEGOTIATE)・追加請求(EXTRA_BILLING)(rules-v4-core.md §3)
 */
import { describe, expect, it } from 'vitest'
import { applyAction } from '../src/applyAction'
import { isRuleViolation } from '../src/types'
import { must, newGame, toStandup } from './util'

describe('NEGOTIATE', () => {
  it('grace:約束の清算を1フェーズ猶予する', () => {
    let state = newGame(90)
    state = must(
      applyAction(state, { type: 'COMMIT_ACCEPTANCE', playerId: 'a', acceptanceId: 'ac-p1-reqs' }),
    )
    const negotiated = must(
      applyAction(state, {
        type: 'NEGOTIATE',
        playerId: 'a',
        mode: 'grace',
        acceptanceId: 'ac-p1-reqs',
      }),
    )
    const commitment = negotiated.commitments.find((c) => c.acceptanceId === 'ac-p1-reqs')!
    expect(commitment.graceUntilPhase).toBe(1)
    expect(negotiated.negotiationUsedPhase).toBe(1)
  })

  it('withdraw:約束を取り下げるとCS-1で消滅する', () => {
    let state = newGame(91)
    state = must(
      applyAction(state, { type: 'COMMIT_ACCEPTANCE', playerId: 'a', acceptanceId: 'ac-p1-reqs' }),
    )
    const csBefore = state.cs
    const negotiated = must(
      applyAction(state, {
        type: 'NEGOTIATE',
        playerId: 'a',
        mode: 'withdraw',
        acceptanceId: 'ac-p1-reqs',
      }),
    )
    expect(negotiated.commitments.some((c) => c.acceptanceId === 'ac-p1-reqs')).toBe(false)
    expect(negotiated.cs).toBe(csBefore - 1)
  })

  it('redraw:スコープ会議中のみタスク候補を引き直せる(補充される)', () => {
    let state = newGame(92)
    // 局面捏造:引き直し後に補充できるよう山札にカードを用意しておく
    state = {
      ...state,
      decks: {
        ...state.decks,
        tasks: { ...state.decks.tasks, drawPile: ['t-wireframe-light', 't-guide-light'] },
      },
    }
    const cardIds = state.taskPool.slice(0, 2)

    const outsideScope = toStandup(state)
    const blocked = applyAction(outsideScope, {
      type: 'NEGOTIATE',
      playerId: 'a',
      mode: 'redraw',
      cardIds,
    })
    expect(isRuleViolation(blocked) && blocked.code).toBe('INVALID_STEP')

    const redrawn = must(
      applyAction(state, { type: 'NEGOTIATE', playerId: 'a', mode: 'redraw', cardIds }),
    )
    expect(cardIds.every((id) => !redrawn.taskPool.includes(id))).toBe(true)
    expect(redrawn.taskPool).toEqual(expect.arrayContaining(['t-wireframe-light', 't-guide-light']))
    expect(redrawn.taskPool).toHaveLength(state.taskPool.length)
  })

  it('交渉はフェーズに1回まで', () => {
    let state = newGame(93)
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
    const r = applyAction(state, {
      type: 'NEGOTIATE',
      playerId: 'a',
      mode: 'withdraw',
      acceptanceId: 'ac-p1-reqs',
    })
    expect(isRuleViolation(r) && r.code).toBe('LIMIT_REACHED')
  })
})

describe('EXTRA_BILLING', () => {
  it('予算+CSコストで回復し、フェーズ回数制限・PM以外は不可', () => {
    const state = newGame(94)
    const budgetBefore = state.budget
    const csBefore = state.cs

    const s = must(applyAction(state, { type: 'EXTRA_BILLING', playerId: 'a' }))
    expect(s.budget).toBe(budgetBefore + s.config.extraBillingBudget)
    expect(s.cs).toBe(csBefore - s.config.extraBillingCsCost)

    const again = applyAction(s, { type: 'EXTRA_BILLING', playerId: 'a' })
    expect(isRuleViolation(again) && again.code).toBe('LIMIT_REACHED')

    const nonPm = applyAction(state, { type: 'EXTRA_BILLING', playerId: 'b' })
    expect(isRuleViolation(nonPm) && nonPm.code).toBe('NOT_PM')
  })
})
