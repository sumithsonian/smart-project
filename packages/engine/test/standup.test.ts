/**
 * 朝会:配属(ASSIGN_WORKER/UNASSIGN_WORKER)(rules-v4-core.md §1-2-2)
 */
import { describe, expect, it } from 'vitest'
import { applyAction } from '../src/applyAction'
import { isRuleViolation } from '../src/types'
import { addBoardTask, makeBoardTask, must, newGame, toStandup, withPlayer, withSlot } from './util'

describe('朝会:ASSIGN_WORKER の正常系', () => {
  it('task/slot/learn/rest/extinguishのすべてを配属できる', () => {
    let state = toStandup(newGame(10))
    // 局面捏造:盤上タスク(🔥1付き)と、納品済み・手戻り中のスロットを用意する
    state = addBoardTask(state, makeBoardTask('t-req-light', { fire: 1 }))
    state = withSlot(state, 'sitemap', { level: 1, reworkCubes: 1 })

    // task(direction スキルを持つ 'a' が座る)
    let s = must(
      applyAction(state, {
        type: 'ASSIGN_WORKER',
        playerId: 'a',
        target: { kind: 'task', cardId: 't-req-light' },
      }),
    )
    // 残業枠で同じタスクの extinguish(消火)も足す(主担当が先にあるので許可される)
    s = must(
      applyAction(s, {
        type: 'ASSIGN_WORKER',
        playerId: 'a',
        target: { kind: 'extinguish', cardId: 't-req-light' },
        overtime: true,
      }),
    )
    // slot(改修・手戻り対応。direction スキルを持つ 'b' が座る)
    s = must(
      applyAction(s, {
        type: 'ASSIGN_WORKER',
        playerId: 'b',
        target: { kind: 'slot', slotId: 'sitemap' },
      }),
    )
    // learn(engineering を学習)
    s = must(
      applyAction(s, {
        type: 'ASSIGN_WORKER',
        playerId: 'c',
        target: { kind: 'learn', skill: 'engineering' },
      }),
    )
    // rest(休憩)
    s = must(applyAction(s, { type: 'ASSIGN_WORKER', playerId: 'd', target: { kind: 'rest' } }))

    expect(s.assignments).toHaveLength(5)
    expect(s.assignments).toContainEqual({
      playerId: 'a',
      target: { kind: 'task', cardId: 't-req-light' },
      overtime: false,
    })
    expect(s.assignments).toContainEqual({
      playerId: 'a',
      target: { kind: 'extinguish', cardId: 't-req-light' },
      overtime: true,
    })
  })

  it('スキル0の系統には座れない(SKILL_ZERO)', () => {
    let state = toStandup(newGame(11))
    // 'a' は engineering スキル0。engineering タスクに座らせようとする
    state = addBoardTask(state, makeBoardTask('t-top-heavy', { lane: 'middle' }))
    const r = applyAction(state, {
      type: 'ASSIGN_WORKER',
      playerId: 'a',
      target: { kind: 'task', cardId: 't-top-heavy' },
    })
    expect(isRuleViolation(r) && r.code).toBe('SKILL_ZERO')
  })
})

describe('朝会:残業とUNASSIGN_WORKER', () => {
  it('残業は主担当が先・疲労ゲート・rest/learn不可。取り消しも残業から', () => {
    let state = toStandup(newGame(12))
    state = addBoardTask(state, makeBoardTask('t-req-light'))

    // 主担当が先(まだ主担当がないのに残業しようとする)
    let r = applyAction(state, {
      type: 'ASSIGN_WORKER',
      playerId: 'a',
      target: { kind: 'task', cardId: 't-req-light' },
      overtime: true,
    })
    expect(isRuleViolation(r) && r.code).toBe('OVERTIME_FORBIDDEN')

    let s = must(
      applyAction(state, {
        type: 'ASSIGN_WORKER',
        playerId: 'a',
        target: { kind: 'task', cardId: 't-req-light' },
      }),
    )

    // 疲労ゲート(疲労2以上は残業禁止)
    const tired = withPlayer(s, 'a', { fatigue: 2 })
    r = applyAction(tired, {
      type: 'ASSIGN_WORKER',
      playerId: 'a',
      target: { kind: 'task', cardId: 't-req-light' },
      overtime: true,
    })
    expect(isRuleViolation(r) && r.code).toBe('OVERTIME_FORBIDDEN')

    // rest/learn は残業不可
    r = applyAction(s, {
      type: 'ASSIGN_WORKER',
      playerId: 'a',
      target: { kind: 'rest' },
      overtime: true,
    })
    expect(isRuleViolation(r) && r.code).toBe('OVERTIME_FORBIDDEN')

    // 正常な残業(座る)
    s = must(
      applyAction(s, {
        type: 'ASSIGN_WORKER',
        playerId: 'a',
        target: { kind: 'task', cardId: 't-req-light' },
        overtime: true,
      }),
    )
    expect(s.assignments).toHaveLength(2)

    // 主担当を先に取り消せない
    r = applyAction(s, { type: 'UNASSIGN_WORKER', playerId: 'a' })
    expect(isRuleViolation(r) && r.code).toBe('OVERTIME_FORBIDDEN')

    // 残業から取り消せば、その後は主担当も取り消せる
    s = must(applyAction(s, { type: 'UNASSIGN_WORKER', playerId: 'a', overtime: true }))
    s = must(applyAction(s, { type: 'UNASSIGN_WORKER', playerId: 'a' }))
    expect(s.assignments).toHaveLength(0)
  })
})
