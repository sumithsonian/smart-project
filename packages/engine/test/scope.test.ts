/**
 * スコープ管理:Must / Better / 見送りとスコープ交渉(RULES.md §3。Issue #1)
 */
import { describe, expect, it } from 'vitest'
import { applyAction } from '../src/applyAction'
import { isRuleViolation } from '../src/types'
import { isRequirementFulfilled } from '../src/helpers'
import {
  addBoardTask,
  addRequirement,
  makeBoardTask,
  must,
  newGame,
  withRequirement,
  withSlot,
} from './util'

describe('要件の公開(RULES.md §3-1)', () => {
  it('フェーズ1の要件が Must / Better と期限つきで公開される', () => {
    const s = newGame(1)
    expect(s.requirements.map((r) => r.requirementId)).toEqual(['rq-p1-reqs', 'rq-p1-map'])

    const mustReq = s.requirements.find((r) => r.requirementId === 'rq-p1-reqs')!
    expect(mustReq.tier).toBe('must')
    expect(mustReq.deadlinePhase).toBe(1)
    expect(mustReq.met).toBe(false)
    expect(mustReq.settled).toBe(false)

    const betterReq = s.requirements.find((r) => r.requirementId === 'rq-p1-map')!
    expect(betterReq.tier).toBe('better')
    expect(betterReq.deadlinePhase).toBe(2)
  })

  it('phase:0 の追加要望カードはスコープ会議では公開されない', () => {
    const s = newGame(1)
    expect(s.requirements.some((r) => r.requirementId.startsWith('rq-add-'))).toBe(false)
  })
})

describe('スコープ交渉:CHANGE_SCOPE(RULES.md §3-5)', () => {
  it('Must → Better 化は CS を払い、回数を消費する', () => {
    const s = newGame(2)
    const before = s.cs
    const next = must(
      applyAction(s, {
        type: 'CHANGE_SCOPE',
        playerId: 'a',
        requirementId: 'rq-p1-reqs',
        mode: 'demote',
      }),
    )
    expect(next.requirements.find((r) => r.requirementId === 'rq-p1-reqs')!.tier).toBe('better')
    expect(next.cs).toBe(before - next.config.demoteMustCs)
    expect(next.scopeChangeUsedThisPhase).toBe(1)
  })

  it('Must → 見送りは dropMustCs を払う。Better → 見送りは無料', () => {
    const s = newGame(3)
    const dropMust = must(
      applyAction(s, {
        type: 'CHANGE_SCOPE',
        playerId: 'a',
        requirementId: 'rq-p1-reqs',
        mode: 'drop',
      }),
    )
    expect(dropMust.cs).toBe(s.cs - s.config.dropMustCs)
    expect(dropMust.requirements.find((r) => r.requirementId === 'rq-p1-reqs')!.tier).toBe(
      'dropped',
    )

    const dropBetter = must(
      applyAction(s, {
        type: 'CHANGE_SCOPE',
        playerId: 'a',
        requirementId: 'rq-p1-map',
        mode: 'drop',
      }),
    )
    expect(dropBetter.cs).toBe(s.cs)
  })

  it('期限延長は予算を払い、期限が +1 フェーズになる', () => {
    const s = newGame(4)
    const next = must(
      applyAction(s, {
        type: 'CHANGE_SCOPE',
        playerId: 'a',
        requirementId: 'rq-p1-reqs',
        mode: 'extend',
      }),
    )
    expect(next.requirements.find((r) => r.requirementId === 'rq-p1-reqs')!.deadlinePhase).toBe(2)
    expect(next.budget).toBe(s.budget - s.config.extendDeadlineBudget)
  })

  it('予算が足りなければ期限延長できない', () => {
    const s = { ...newGame(5), budget: 1 }
    const r = applyAction(s, {
      type: 'CHANGE_SCOPE',
      playerId: 'a',
      requirementId: 'rq-p1-reqs',
      mode: 'extend',
    })
    expect(isRuleViolation(r) && r.code).toBe('NOT_ENOUGH_BUDGET')
  })

  it('最終フェーズを超える期限延長はできない', () => {
    const s = withRequirement(newGame(6), 'rq-p1-reqs', { deadlinePhase: 4 })
    const r = applyAction(s, {
      type: 'CHANGE_SCOPE',
      playerId: 'a',
      requirementId: 'rq-p1-reqs',
      mode: 'extend',
    })
    expect(isRuleViolation(r) && r.code).toBe('INVALID_TARGET')
  })

  it('自ら厳しくする方向(Better → Must、見送り → Better)は無料で回数も使わない', () => {
    const s = newGame(7)
    const promote = must(
      applyAction(s, {
        type: 'CHANGE_SCOPE',
        playerId: 'a',
        requirementId: 'rq-p1-map',
        mode: 'promote',
      }),
    )
    expect(promote.cs).toBe(s.cs)
    expect(promote.scopeChangeUsedThisPhase).toBe(0)
    expect(promote.requirements.find((r) => r.requirementId === 'rq-p1-map')!.tier).toBe('must')

    const dropped = withRequirement(s, 'rq-p1-map', { tier: 'dropped' })
    const restore = must(
      applyAction(dropped, {
        type: 'CHANGE_SCOPE',
        playerId: 'a',
        requirementId: 'rq-p1-map',
        mode: 'restore',
      }),
    )
    expect(restore.requirements.find((r) => r.requirementId === 'rq-p1-map')!.tier).toBe('better')
    expect(restore.cs).toBe(s.cs)
  })

  it('Must を緩める交渉は scopeChangePerPhase 回まで', () => {
    let s = newGame(8)
    s = addRequirement(s, 'rq-p2-wire')
    s = addRequirement(s, 'rq-p3-cms')
    expect(s.config.scopeChangePerPhase).toBe(2)

    s = must(
      applyAction(s, {
        type: 'CHANGE_SCOPE',
        playerId: 'a',
        requirementId: 'rq-p1-reqs',
        mode: 'demote',
      }),
    )
    s = must(
      applyAction(s, {
        type: 'CHANGE_SCOPE',
        playerId: 'a',
        requirementId: 'rq-p2-wire',
        mode: 'demote',
      }),
    )
    const third = applyAction(s, {
      type: 'CHANGE_SCOPE',
      playerId: 'a',
      requirementId: 'rq-p3-cms',
      mode: 'demote',
    })
    expect(isRuleViolation(third) && third.code).toBe('LIMIT_REACHED')
  })

  it('達成済み・清算済みの要件は変更できない', () => {
    const s = newGame(9)
    const metState = withRequirement(s, 'rq-p1-reqs', { met: true })
    const metResult = applyAction(metState, {
      type: 'CHANGE_SCOPE',
      playerId: 'a',
      requirementId: 'rq-p1-reqs',
      mode: 'drop',
    })
    expect(isRuleViolation(metResult) && metResult.code).toBe('SCOPE_LOCKED')

    const settledState = withRequirement(s, 'rq-p1-reqs', { settled: true })
    const settledResult = applyAction(settledState, {
      type: 'CHANGE_SCOPE',
      playerId: 'a',
      requirementId: 'rq-p1-reqs',
      mode: 'drop',
    })
    expect(isRuleViolation(settledResult) && settledResult.code).toBe('SCOPE_LOCKED')
  })

  it('PM 以外は交渉できない', () => {
    const r = applyAction(newGame(10), {
      type: 'CHANGE_SCOPE',
      playerId: 'b',
      requirementId: 'rq-p1-reqs',
      mode: 'demote',
    })
    expect(isRuleViolation(r) && r.code).toBe('NOT_PM')
  })
})

describe('要件の達成判定(RULES.md §3-3)', () => {
  it('「約束」は不要:公開された要件は Lv 条件を満たせば達成扱いになる', () => {
    let s = newGame(11)
    s = withSlot(s, 'requirements', { level: 1 })
    // rq-p1-reqs は requirements スロットの Lv1 要求
    expect(isRequirementFulfilled(s, s.requirements[0]!)).toBe(true)
    // rq-p1-map は sitemap の Lv2 要求(未納品なので未達成)
    expect(isRequirementFulfilled(s, s.requirements[1]!)).toBe(false)
  })

  it('手戻りカードが場にある間は達成条件を満たさない', () => {
    let s = newGame(12)
    s = withSlot(s, 'requirements', { level: 1 })
    const withRework = addBoardTask(
      s,
      makeBoardTask('interrupt-1', {
        interrupt: 'rework',
        interruptEffort: 2,
        targetSlotId: 'requirements',
        plannedWeek: null,
      }),
    )
    expect(isRequirementFulfilled(withRework, withRework.requirements[0]!)).toBe(false)
  })
})
