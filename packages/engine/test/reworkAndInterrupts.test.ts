/**
 * 改修・手戻り、差し込み(rework/bug/consult)、割り込みキャパシティ・謝絶(rules-v4-core.md §0・§1-2・§3)
 */
import { describe, expect, it } from 'vitest'
import { applyAction } from '../src/applyAction'
import { hasReworkCard } from '../src/helpers'
import { isRuleViolation } from '../src/types'
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

describe('改修(Lv1→Lv2)', () => {
  it('スロットに座ると改修キューブが積まれ、upgradeCost到達でLv2になる', () => {
    let state = toStandup(newGame(40))
    state = withSlot(state, 'requirements', { level: 1, upgradeCubes: 1 })
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

  it('upgradeCost未到達では改修は進行中のまま', () => {
    let state = toStandup(newGame(41))
    state = withSlot(state, 'requirements', { level: 1, upgradeCubes: 0 })
    state = must(
      applyAction(state, {
        type: 'ASSIGN_WORKER',
        playerId: 'c', // direction 1 → upgradeCubes 0+1=1(upgradeCost 3未到達)
        target: { kind: 'slot', slotId: 'requirements' },
      }),
    )
    state = allReady(state)
    const slot = state.slots.find((s) => s.slotId === 'requirements')!
    expect(slot.level).toBe(1)
    expect(slot.upgradeCubes).toBe(1)
  })

  it('スキル0の系統は改修に座れない(SKILL_ZERO)', () => {
    let state = toStandup(newGame(46))
    state = withSlot(state, 'requirements', { level: 1, upgradeCubes: 0 })
    const r = applyAction(state, {
      type: 'ASSIGN_WORKER',
      playerId: 'd', // direction 0
      target: { kind: 'slot', slotId: 'requirements' },
    })
    expect(isRuleViolation(r) && r.code).toBe('SKILL_ZERO')
  })

  it('Lv1以外のスロットには座れない(NOT_FOUND)', () => {
    const state = toStandup(newGame(43))
    const r = applyAction(state, {
      type: 'ASSIGN_WORKER',
      playerId: 'a',
      target: { kind: 'slot', slotId: 'requirements' }, // まだ Lv0
    })
    expect(isRuleViolation(r) && r.code).toBe('NOT_FOUND')
  })
})

describe('手戻り(差し込みカードへの統一)', () => {
  it('手戻りは納品済みスロットを指すカードとして割り込みレーンに置かれ、対象スロットは検収上「未達」になる', () => {
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

    const reworkCard = resolved.board.find((b) => b.interrupt === 'rework')!
    expect(reworkCard).toBeDefined()
    expect(reworkCard.lane).toBe('interrupt')
    expect(reworkCard.targetSlotId).toBe('requirements')
    expect(reworkCard.interruptEffort).toBe(2)
    expect(hasReworkCard(resolved, 'requirements')).toBe(true)
    // 対象スロットのLvは変わらないが、検収上は未達に戻る
    expect(resolved.slots.find((s) => s.slotId === 'requirements')!.level).toBe(1)
    expect(resolved.metAcceptanceIds).not.toContain('ac-p1-reqs')
  })

  it('手戻りカードに人日を積み切ると解消し、検収条件が復帰する', () => {
    let state = newGame(44)
    state = {
      ...state,
      slots: state.slots.map((s) => (s.slotId === 'requirements' ? { ...s, level: 1 } : s)),
      metAcceptanceIds: ['ac-p1-reqs'],
    }
    state = must(applyAction(state, { type: 'FINISH_SCOPE', playerId: 'a' }))
    state = drainPending(state)
    state = { ...state, pendingEvent: { kind: 'week_start', cardId: 'ev-rework-1', targetPlayerId: null } }
    state = must(applyAction(state, { type: 'RESOLVE_EVENT' }))
    const reworkCard = state.board.find((b) => b.interrupt === 'rework')!

    // 'a'(最高スキル direction2)が担当すればちょうど effort2 が埋まる
    state = must(
      applyAction(state, {
        type: 'ASSIGN_WORKER',
        playerId: 'a',
        target: { kind: 'task', cardId: reworkCard.cardId },
      }),
    )
    state = allReady(state)
    expect(state.step).toBe('weekend')

    const delivered = must(applyAction(state, { type: 'DELIVER_TASK', cardId: reworkCard.cardId }))
    expect(delivered.board.some((b) => b.cardId === reworkCard.cardId)).toBe(false)
    expect(hasReworkCard(delivered, 'requirements')).toBe(false)
    expect(delivered.metAcceptanceIds).toContain('ac-p1-reqs')
  })

  it('納品済みスロットが1つもなければ効果なし', () => {
    let state = newGame(45)
    state = must(applyAction(state, { type: 'FINISH_SCOPE', playerId: 'a' }))
    state = drainPending(state)
    state = { ...state, pendingEvent: { kind: 'week_start', cardId: 'ev-rework-1', targetPlayerId: null } }
    const resolved = must(applyAction(state, { type: 'RESOLVE_EVENT' }))
    expect(resolved.board.some((b) => b.interrupt === 'rework')).toBe(false)
  })
})

describe('割り込みレーンのキャパシティ(あふれ)', () => {
  it('割り込みレーンが満杯のとき新規差し込みはCS-overflowCsであふれ、カードは置かれない', () => {
    let state = newGame(47)
    state = must(applyAction(state, { type: 'FINISH_SCOPE', playerId: 'a' }))
    state = drainPending(state)
    for (let i = 0; i < state.config.interruptCapacity; i++) {
      state = addBoardTask(
        state,
        makeBoardTask(`interrupt-fill-${i}`, { lane: 'interrupt', interrupt: 'bug', interruptEffort: 2 }),
      )
    }
    const csBefore = state.cs
    const boardCountBefore = state.board.length

    state = { ...state, pendingEvent: { kind: 'week_start', cardId: 'ev-bug-1', targetPlayerId: null } }
    const resolved = must(applyAction(state, { type: 'RESOLVE_EVENT' }))

    expect(resolved.cs).toBe(csBefore - resolved.config.overflowCs)
    expect(resolved.board).toHaveLength(boardCountBefore) // 新規カードは置かれない
  })

  it('手戻りがあふれた場合もカードは置かれず、スロットは無事(Lvは変わらない)', () => {
    let state = newGame(48)
    state = must(applyAction(state, { type: 'FINISH_SCOPE', playerId: 'a' }))
    state = drainPending(state)
    state = withSlot(state, 'requirements', { level: 1 })
    for (let i = 0; i < state.config.interruptCapacity; i++) {
      state = addBoardTask(
        state,
        makeBoardTask(`interrupt-fill-${i}`, { lane: 'interrupt', interrupt: 'bug', interruptEffort: 2 }),
      )
    }
    const csBefore = state.cs

    state = { ...state, pendingEvent: { kind: 'week_start', cardId: 'ev-rework-1', targetPlayerId: null } }
    const resolved = must(applyAction(state, { type: 'RESOLVE_EVENT' }))

    expect(resolved.cs).toBe(csBefore - resolved.config.overflowCs)
    expect(resolved.board.some((b) => b.interrupt === 'rework')).toBe(false)
    expect(resolved.slots.find((s) => s.slotId === 'requirements')!.level).toBe(1)
  })
})

describe('DECLINE_INTERRUPT(PM謝絶)', () => {
  it('PM以外は謝絶できない(NOT_PM)', () => {
    let state = toStandup(newGame(56))
    state = addBoardTask(
      state,
      makeBoardTask('interrupt-y', { lane: 'interrupt', interrupt: 'bug', interruptEffort: 2 }),
    )
    const r = applyAction(state, { type: 'DECLINE_INTERRUPT', playerId: 'b', cardId: 'interrupt-y' })
    expect(isRuleViolation(r) && r.code).toBe('NOT_PM')
  })

  it('割り込みレーンにないカードはNOT_FOUND', () => {
    const state = toStandup(newGame(57))
    const r = applyAction(state, { type: 'DECLINE_INTERRUPT', playerId: 'a', cardId: 'no-such-card' })
    expect(isRuleViolation(r) && r.code).toBe('NOT_FOUND')
  })

  it('PMは割り込みカード1枚をCS-declineCsで除去できる(回数無制限)', () => {
    let state = toStandup(newGame(58))
    state = addBoardTask(
      state,
      makeBoardTask('interrupt-y', { lane: 'interrupt', interrupt: 'bug', interruptEffort: 2 }),
    )
    const csBefore = state.cs
    const s = must(
      applyAction(state, { type: 'DECLINE_INTERRUPT', playerId: 'a', cardId: 'interrupt-y' }),
    )
    expect(s.cs).toBe(csBefore - s.config.declineCs)
    expect(s.board.some((b) => b.cardId === 'interrupt-y')).toBe(false)

    // 続けて別カードを謝絶しても回数制限にかからない
    let s2 = addBoardTask(
      s,
      makeBoardTask('interrupt-z', { lane: 'interrupt', interrupt: 'consult', interruptEffort: 2, rewardBudget: 2 }),
    )
    s2 = must(applyAction(s2, { type: 'DECLINE_INTERRUPT', playerId: 'a', cardId: 'interrupt-z' }))
    expect(s2.cs).toBe(s.cs - s2.config.declineCs)
  })

  it('手戻りカードを謝絶すると検収が復帰する', () => {
    let state = newGame(59)
    state = {
      ...state,
      slots: state.slots.map((s) => (s.slotId === 'requirements' ? { ...s, level: 1 } : s)),
      metAcceptanceIds: ['ac-p1-reqs'],
    }
    state = must(applyAction(state, { type: 'FINISH_SCOPE', playerId: 'a' }))
    state = drainPending(state)
    state = { ...state, pendingEvent: { kind: 'week_start', cardId: 'ev-rework-1', targetPlayerId: null } }
    state = must(applyAction(state, { type: 'RESOLVE_EVENT' }))
    expect(state.metAcceptanceIds).not.toContain('ac-p1-reqs')
    const reworkCard = state.board.find((b) => b.interrupt === 'rework')!

    const declined = must(
      applyAction(state, { type: 'DECLINE_INTERRUPT', playerId: 'a', cardId: reworkCard.cardId }),
    )
    expect(declined.board.some((b) => b.interrupt === 'rework')).toBe(false)
    expect(hasReworkCard(declined, 'requirements')).toBe(false)
    expect(declined.metAcceptanceIds).toContain('ac-p1-reqs')
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
