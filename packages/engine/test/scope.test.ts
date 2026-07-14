/**
 * スコープ会議:検収条件の約束・タスク配置・レーン文法・FINISH_SCOPE(rules-v4-core.md §1-1)
 */
import { describe, expect, it } from 'vitest'
import { applyAction } from '../src/applyAction'
import { isRuleViolation } from '../src/types'
import type { RuleViolation } from '../src/types'
import { drainPending, must, newGame } from './util'

describe('スコープ会議:COMMIT_ACCEPTANCE', () => {
  it('正常/二重/非公開ID/PM以外/達成済みを判別する', () => {
    const state = newGame(1)
    expect(state.openAcceptanceIds).toEqual(['ac-p1-reqs', 'ac-p1-map'])

    // 正常
    const s = must(
      applyAction(state, { type: 'COMMIT_ACCEPTANCE', playerId: 'a', acceptanceId: 'ac-p1-reqs' }),
    )
    expect(s.commitments).toEqual([
      { acceptanceId: 'ac-p1-reqs', committedPhase: 1, graceUntilPhase: 0 },
    ])

    // 二重(すでに約束済み)
    const dup = applyAction(s, {
      type: 'COMMIT_ACCEPTANCE',
      playerId: 'a',
      acceptanceId: 'ac-p1-reqs',
    })
    expect(isRuleViolation(dup) && dup.code).toBe('ALREADY_COMMITTED')

    // 非公開ID(まだフェーズ2の条件は公開されていない)
    const nonPublic = applyAction(s, {
      type: 'COMMIT_ACCEPTANCE',
      playerId: 'a',
      acceptanceId: 'ac-p2-wire',
    })
    expect(isRuleViolation(nonPublic) && nonPublic.code).toBe('NOT_FOUND')

    // PM以外
    const nonPm = applyAction(s, {
      type: 'COMMIT_ACCEPTANCE',
      playerId: 'b',
      acceptanceId: 'ac-p1-map',
    })
    expect(isRuleViolation(nonPm) && nonPm.code).toBe('NOT_PM')

    // すでに達成済み(局面捏造)
    const met = { ...s, metAcceptanceIds: [...s.metAcceptanceIds, 'ac-p1-map'] }
    const alreadyMet = applyAction(met, {
      type: 'COMMIT_ACCEPTANCE',
      playerId: 'a',
      acceptanceId: 'ac-p1-map',
    })
    expect(isRuleViolation(alreadyMet) && alreadyMet.code).toBe('ALREADY_COMMITTED')
  })
})

describe('スコープ会議:PLACE_TASK', () => {
  it('正常/プール外/同スロット重複/納品済みスロットを判別する', () => {
    const state = newGame(1)

    // 正常
    const s = must(applyAction(state, { type: 'PLACE_TASK', playerId: 'a', cardId: 't-req-light' }))
    expect(s.board.some((b) => b.cardId === 't-req-light')).toBe(true)
    expect(s.taskPool.includes('t-req-light')).toBe(false)
    expect(s.lanePlacedCount.start).toBe(1)

    // プール外のカード
    const poolOut = applyAction(s, {
      type: 'PLACE_TASK',
      playerId: 'a',
      cardId: 't-wireframe-light',
    })
    expect(isRuleViolation(poolOut) && poolOut.code).toBe('NOT_FOUND')

    // 同スロット重複(requirements 向けタスクがすでに盤上)
    const dupSlot = applyAction(s, { type: 'PLACE_TASK', playerId: 'a', cardId: 't-req-heavy' })
    expect(isRuleViolation(dupSlot) && dupSlot.code).toBe('INVALID_TARGET')
    expect((dupSlot as RuleViolation).message).toContain('盤上')

    // 納品済みスロット(局面捏造:sitemap を Lv1 にしておく)
    const delivered = {
      ...s,
      slots: s.slots.map((sl) => (sl.slotId === 'sitemap' ? { ...sl, level: 1 as const } : sl)),
    }
    const deliveredResult = applyAction(delivered, {
      type: 'PLACE_TASK',
      playerId: 'a',
      cardId: 't-sitemap-light',
    })
    expect(isRuleViolation(deliveredResult) && deliveredResult.code).toBe('INVALID_TARGET')
    expect((deliveredResult as RuleViolation).message).toContain('納品済み')
  })

  it('レーン文法:middle列はstart列に1枚以上配置してから', () => {
    const state = newGame(2)
    const withMiddle = { ...state, taskPool: [...state.taskPool, 't-design-light'] }

    const blocked = applyAction(withMiddle, {
      type: 'PLACE_TASK',
      playerId: 'a',
      cardId: 't-design-light',
    })
    expect(isRuleViolation(blocked) && blocked.code).toBe('LANE_GRAMMAR')

    let s = must(
      applyAction(withMiddle, { type: 'PLACE_TASK', playerId: 'a', cardId: 't-req-light' }),
    )
    s = must(applyAction(s, { type: 'PLACE_TASK', playerId: 'a', cardId: 't-design-light' }))
    expect(s.board.some((b) => b.cardId === 't-design-light')).toBe(true)
  })

  it('レーン文法:finish列はmiddle列に1枚以上配置してから', () => {
    const state = newGame(3)
    const withFinish = { ...state, taskPool: [...state.taskPool, 't-launch-light'] }

    const blocked = applyAction(withFinish, {
      type: 'PLACE_TASK',
      playerId: 'a',
      cardId: 't-launch-light',
    })
    expect(isRuleViolation(blocked) && blocked.code).toBe('LANE_GRAMMAR')

    // 局面捏造:middle 列に配置済みということにする
    const withMiddleCount = {
      ...withFinish,
      lanePlacedCount: { ...withFinish.lanePlacedCount, middle: 1 },
    }
    const s = must(
      applyAction(withMiddleCount, { type: 'PLACE_TASK', playerId: 'a', cardId: 't-launch-light' }),
    )
    expect(s.board.some((b) => b.cardId === 't-launch-light')).toBe(true)
  })
})

describe('スコープ会議:FINISH_SCOPE', () => {
  it('締めると第1週へ進み、炎上ドロー・週初イベントが発生する', () => {
    const state = newGame(4)
    let s = must(applyAction(state, { type: 'PLACE_TASK', playerId: 'a', cardId: 't-req-light' }))
    s = must(applyAction(s, { type: 'PLACE_TASK', playerId: 'a', cardId: 't-sitemap-light' }))
    s = must(applyAction(s, { type: 'FINISH_SCOPE', playerId: 'a' }))

    expect(s.step).toBe('standup')
    expect(s.week).toBe(1)
    expect(s.remainingFireDraws).toBe(0)
    // 盤上にタスクがある状態での初回炎上ドローは必ずどこかに🔥が付く
    expect(s.board.some((b) => b.fire > 0)).toBe(true)
    expect(s.pendingEvent).not.toBeNull()

    s = drainPending(s)
    expect(s.pendingEvent).toBeNull()
  })
})
