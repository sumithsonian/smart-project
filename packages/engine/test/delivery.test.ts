/**
 * 納品(DELIVER_TASK)(rules-v4-core.md §0・§1-2-3)
 */
import { describe, expect, it } from 'vitest'
import { applyAction } from '../src/applyAction'
import { isRuleViolation } from '../src/types'
import type { RuleViolation } from '../src/types'
import { addBoardTask, allReady, makeBoardTask, must, newGame, toStandup } from './util'

describe('DELIVER_TASK', () => {
  it('工数不足はCANNOT_DELIVERになる', () => {
    let state = toStandup(newGame(30))
    state = addBoardTask(state, makeBoardTask('t-req-light')) // cubes 0 / effort 2
    state = allReady(state)
    const r = applyAction(state, { type: 'DELIVER_TASK', cardId: 't-req-light' })
    expect(isRuleViolation(r) && r.code).toBe('CANNOT_DELIVER')
    expect((r as RuleViolation).message).toContain('人日')
  })

  it('予算不足はCANNOT_DELIVERになる', () => {
    let state = toStandup(newGame(31))
    state = addBoardTask(state, makeBoardTask('t-req-light', { cubes: 2 })) // 工数は足りる
    state = { ...state, budget: 0 }
    state = allReady(state)
    const r = applyAction(state, { type: 'DELIVER_TASK', cardId: 't-req-light' })
    expect(isRuleViolation(r) && r.code).toBe('CANNOT_DELIVER')
    expect((r as RuleViolation).message).toContain('実行コスト')
  })

  it('必要工数ちょうどでLv1納品される', () => {
    let state = toStandup(newGame(32))
    state = addBoardTask(state, makeBoardTask('t-sitemap-mid', { cubes: 3 })) // effort3 maxLevel2 cost1
    state = allReady(state)
    const budgetBefore = state.budget
    const delivered = must(applyAction(state, { type: 'DELIVER_TASK', cardId: 't-sitemap-mid' }))
    const slot = delivered.slots.find((s) => s.slotId === 'sitemap')!
    expect(slot.level).toBe(1)
    expect(delivered.budget).toBe(budgetBefore - 1) // cost1
    expect(delivered.board.some((b) => b.cardId === 't-sitemap-mid')).toBe(false)
  })

  it('overshoot積みでLv2になる(maxLevel1タスクはLv2にならない)', () => {
    let state = toStandup(newGame(33))
    // effort3 + qualityOvershoot2 = 5
    state = addBoardTask(state, makeBoardTask('t-sitemap-mid', { cubes: 5 }))
    // maxLevel1のタスクに大量にキューブを積んでも Lv2 にはならない
    state = addBoardTask(state, makeBoardTask('t-req-light', { cubes: 4 }))
    state = allReady(state)

    let delivered = must(applyAction(state, { type: 'DELIVER_TASK', cardId: 't-sitemap-mid' }))
    expect(delivered.slots.find((s) => s.slotId === 'sitemap')!.level).toBe(2)

    delivered = must(applyAction(delivered, { type: 'DELIVER_TASK', cardId: 't-req-light' }))
    expect(delivered.slots.find((s) => s.slotId === 'requirements')!.level).toBe(1)
  })

  it('納品でスロットが更新され、検収条件の達成・約束の解除が自動で起きる', () => {
    let state = newGame(34)
    state = must(
      applyAction(state, {
        type: 'COMMIT_ACCEPTANCE',
        playerId: 'a',
        acceptanceId: 'ac-p1-reqs', // requirements Lv1
      }),
    )
    state = must(applyAction(state, { type: 'PLACE_TASK', playerId: 'a', cardId: 't-req-light' }))
    state = toStandup(state)
    // 週初の炎上ドローが乗る可能性を排除しておく(このテストの主眼は検収の自動達成)
    state = {
      ...state,
      board: state.board.map((b) => (b.cardId === 't-req-light' ? { ...b, fire: 0 } : b)),
    }
    state = must(
      applyAction(state, {
        type: 'ASSIGN_WORKER',
        playerId: 'a', // direction 2、effort2 なのでちょうど納品可能
        target: { kind: 'task', cardId: 't-req-light' },
      }),
    )
    state = allReady(state)
    expect(state.commitments.some((c) => c.acceptanceId === 'ac-p1-reqs')).toBe(true)

    const delivered = must(applyAction(state, { type: 'DELIVER_TASK', cardId: 't-req-light' }))
    expect(delivered.slots.find((s) => s.slotId === 'requirements')!.level).toBe(1)
    expect(delivered.metAcceptanceIds).toContain('ac-p1-reqs')
    expect(delivered.commitments.some((c) => c.acceptanceId === 'ac-p1-reqs')).toBe(false)
  })
})
