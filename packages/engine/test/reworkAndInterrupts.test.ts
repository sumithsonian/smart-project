/**
 * 改修・手戻り、差し込み(rework/bug/consult)(rules-v4-core.md §0・§1-2-1)
 */
import { describe, expect, it } from 'vitest'
import { applyAction } from '../src/applyAction'
import {
  addBoardTask,
  allReady,
  drainPending,
  makeBoardTask,
  must,
  newGame,
  toStandup,
  withSlot,
} from './util'

describe('改修・手戻り', () => {
  it('スロットに座ると手戻り解消が先、余りは改修に回る', () => {
    let state = toStandup(newGame(40))
    state = withSlot(state, 'requirements', { level: 1, reworkCubes: 1 })
    state = must(
      applyAction(state, {
        type: 'ASSIGN_WORKER',
        playerId: 'a', // direction 2
        target: { kind: 'slot', slotId: 'requirements' },
      }),
    )
    state = allReady(state)

    const slot = state.slots.find((s) => s.slotId === 'requirements')!
    expect(slot.reworkCubes).toBe(0) // 手戻り1個をキューブ2で解消
    expect(slot.upgradeCubes).toBe(1) // 余り1が改修へ
    expect(slot.level).toBe(1) // upgradeCost(3)未到達
  })

  it('upgradeCost到達で改修が完了しLv2になる', () => {
    let state = toStandup(newGame(41))
    state = withSlot(state, 'requirements', { level: 1, reworkCubes: 0, upgradeCubes: 1 })
    state = must(
      applyAction(state, {
        type: 'ASSIGN_WORKER',
        playerId: 'a', // direction 2 → upgradeCubes 1+2=3 = upgradeCost
        target: { kind: 'slot', slotId: 'requirements' },
      }),
    )
    state = allReady(state)

    const slot = state.slots.find((s) => s.slotId === 'requirements')!
    expect(slot.level).toBe(2)
    expect(slot.upgradeCubes).toBe(0)
  })

  it('手戻りが乗ると達成済みの検収条件が未達に戻る(recheck)', () => {
    let state = newGame(42)
    state = {
      ...state,
      slots: state.slots.map((s) => (s.slotId === 'requirements' ? { ...s, level: 1 } : s)),
      metAcceptanceIds: ['ac-p1-reqs'],
    }
    state = must(applyAction(state, { type: 'FINISH_SCOPE', playerId: 'a' }))
    state = drainPending(state)

    // 局面捏造:手戻りイベント(ev-rework-1)を解決待ちにする
    state = { ...state, pendingEvent: { kind: 'week_start', cardId: 'ev-rework-1', targetPlayerId: null } }
    const resolved = must(applyAction(state, { type: 'RESOLVE_EVENT' }))

    const slot = resolved.slots.find((s) => s.slotId === 'requirements')!
    expect(slot.reworkCubes).toBe(2)
    expect(resolved.metAcceptanceIds).not.toContain('ac-p1-reqs')
  })
})

describe('差し込み(bug/consult)', () => {
  it('バグは放置するとフェーズ末にCS-1、対応すれば止まる', () => {
    let base = newGame(50)
    base = must(applyAction(base, { type: 'FINISH_SCOPE', playerId: 'a' }))
    base = drainPending(base)
    base = { ...base, pendingEvent: { kind: 'week_start', cardId: 'ev-bug-1', targetPlayerId: null } }
    base = must(applyAction(base, { type: 'RESOLVE_EVENT' }))
    const bugTask = base.board.find((b) => b.interrupt === 'bug')!
    expect(bugTask).toBeDefined()
    expect(bugTask.interruptEffort).toBe(2)

    // ── 放置:週3回分のフェーズを素通りする ──
    let neglected = base
    for (let w = 0; w < 3; w++) {
      neglected = allReady(neglected)
      neglected = must(applyAction(neglected, { type: 'END_WEEKEND', playerId: 'a' }))
      neglected = drainPending(neglected)
    }
    expect(neglected.step).toBe('phase_end')
    expect(neglected.cs).toBe(base.cs - 1)

    // ── 対応:1週目に片付けてから同じくフェーズ末まで進める ──
    let fixed = must(
      applyAction(base, {
        type: 'ASSIGN_WORKER',
        playerId: 'a', // 最高スキル2で effort2 のバグ対応がちょうど埋まる
        target: { kind: 'task', cardId: bugTask.cardId },
      }),
    )
    fixed = allReady(fixed) // 週1 → 週末
    fixed = must(applyAction(fixed, { type: 'DELIVER_TASK', cardId: bugTask.cardId }))
    fixed = must(applyAction(fixed, { type: 'END_WEEKEND', playerId: 'a' })) // 週1 → 週2
    fixed = drainPending(fixed)
    for (let w = 0; w < 2; w++) {
      fixed = allReady(fixed)
      fixed = must(applyAction(fixed, { type: 'END_WEEKEND', playerId: 'a' }))
      fixed = drainPending(fixed)
    }
    expect(fixed.step).toBe('phase_end')
    expect(fixed.cs).toBe(base.cs) // ペナルティなし
  })

  it('相談ごとに対応すると予算が増える', () => {
    let state = newGame(51)
    state = must(applyAction(state, { type: 'FINISH_SCOPE', playerId: 'a' }))
    state = drainPending(state)
    state = { ...state, pendingEvent: { kind: 'week_start', cardId: 'ev-consult', targetPlayerId: null } }
    state = must(applyAction(state, { type: 'RESOLVE_EVENT' }))
    const consultTask = state.board.find((b) => b.interrupt === 'consult')!
    expect(consultTask.rewardBudget).toBe(2)

    state = must(
      applyAction(state, {
        type: 'ASSIGN_WORKER',
        playerId: 'a',
        target: { kind: 'task', cardId: consultTask.cardId },
      }),
    )
    const budgetBefore = state.budget
    state = allReady(state)
    const delivered = must(applyAction(state, { type: 'DELIVER_TASK', cardId: consultTask.cardId }))
    expect(delivered.budget).toBe(budgetBefore + 2)
  })

  it('差し込みタスクは誰でも座れて最高スキルぶん積む', () => {
    let state = toStandup(newGame(52))
    state = addBoardTask(
      state,
      makeBoardTask('interrupt-x', { lane: 'interrupt', interrupt: 'bug', interruptEffort: 5 }),
    )
    // d: direction0/design1/engineering2 → 最高スキルは2
    state = must(
      applyAction(state, {
        type: 'ASSIGN_WORKER',
        playerId: 'd',
        target: { kind: 'task', cardId: 'interrupt-x' },
      }),
    )
    state = allReady(state)
    const task = state.board.find((b) => b.cardId === 'interrupt-x')!
    expect(task.cubes).toBe(2)
  })
})
