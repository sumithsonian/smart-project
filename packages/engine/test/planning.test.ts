/**
 * ローリング計画ボード(RULES.md §5。Issue #2)
 */
import { describe, expect, it } from 'vitest'
import { applyAction } from '../src/applyAction'
import { isRuleViolation } from '../src/types'
import { weekLoad } from '../src/helpers'
import {
  addBoardTask,
  allReady,
  apply,
  drainPending,
  endWeekend,
  makeBoardTask,
  must,
  newGame,
  toStandup,
  withSlot,
} from './util'

describe('PLAN_TASK — 3週間への配置', () => {
  it('候補プールのタスクを予定週つきで配置できる', () => {
    const s = newGame(1)
    const next = must(
      applyAction(s, { type: 'PLAN_TASK', playerId: 'a', cardId: 't-req-light', week: 2 }),
    )
    const task = next.board.find((t) => t.cardId === 't-req-light')!
    expect(task.plannedWeek).toBe(2)
    expect(next.taskPool.includes('t-req-light')).toBe(false)
  })

  it('Backlog(week: null)にも置ける', () => {
    const s = newGame(2)
    const next = must(
      applyAction(s, { type: 'PLAN_TASK', playerId: 'a', cardId: 't-req-light', week: null }),
    )
    expect(next.board.find((t) => t.cardId === 't-req-light')!.plannedWeek).toBeNull()
  })

  it('範囲外の週は INVALID_WEEK', () => {
    const s = newGame(3)
    const r = applyAction(s, { type: 'PLAN_TASK', playerId: 'a', cardId: 't-req-light', week: 4 })
    expect(isRuleViolation(r) && r.code).toBe('INVALID_WEEK')
  })

  it('候補プール外・同じ成果物の二重配置・納品済みスロットは拒否される', () => {
    const s = newGame(4)
    const poolOut = applyAction(s, {
      type: 'PLAN_TASK',
      playerId: 'a',
      cardId: 't-wireframe-light',
      week: 1,
    })
    expect(isRuleViolation(poolOut) && poolOut.code).toBe('NOT_FOUND')

    const placed = must(
      applyAction(s, { type: 'PLAN_TASK', playerId: 'a', cardId: 't-req-light', week: 1 }),
    )
    const dup = applyAction(placed, {
      type: 'PLAN_TASK',
      playerId: 'a',
      cardId: 't-req-heavy',
      week: 2,
    })
    expect(isRuleViolation(dup) && dup.code).toBe('INVALID_TARGET')

    const deliveredSlot = withSlot(s, 'sitemap', { level: 1 })
    const onDelivered = applyAction(deliveredSlot, {
      type: 'PLAN_TASK',
      playerId: 'a',
      cardId: 't-sitemap-light',
      week: 1,
    })
    expect(isRuleViolation(onDelivered) && onDelivered.code).toBe('INVALID_TARGET')
  })

  it('レーン文法(起点・中盤・仕上げ)は廃止され、どの週にも自由に置ける', () => {
    // v4 では start 列に1枚置くまで middle 列に置けなかった。v5 では依存関係が担う。
    const s = { ...newGame(5), taskPool: ['t-design-light'] }
    const next = must(
      applyAction(s, { type: 'PLAN_TASK', playerId: 'a', cardId: 't-design-light', week: 1 }),
    )
    expect(next.board.some((t) => t.cardId === 't-design-light')).toBe(true)
  })
})

describe('MOVE_TASK / DROP_TASK — 再計画(RULES.md §5-4)', () => {
  it('予定週を移動できる', () => {
    let s = newGame(6)
    s = must(applyAction(s, { type: 'PLAN_TASK', playerId: 'a', cardId: 't-req-light', week: 1 }))
    s = must(applyAction(s, { type: 'MOVE_TASK', playerId: 'a', cardId: 't-req-light', week: 3 }))
    expect(s.board.find((t) => t.cardId === 't-req-light')!.plannedWeek).toBe(3)
  })

  it('見送りにすると盤から外れ、積んだキューブは失われる', () => {
    let s = newGame(7)
    s = must(applyAction(s, { type: 'PLAN_TASK', playerId: 'a', cardId: 't-req-light', week: 1 }))
    s = {
      ...s,
      board: s.board.map((t) => (t.cardId === 't-req-light' ? { ...t, cubes: 2 } : t)),
    }
    s = must(applyAction(s, { type: 'DROP_TASK', playerId: 'a', cardId: 't-req-light' }))
    expect(s.board.some((t) => t.cardId === 't-req-light')).toBe(false)
    expect(s.log.some((l) => l.message.includes('見送り'))).toBe(true)
  })

  it('朝会中は計画を変更できない(RULES.md §5-3)', () => {
    let s = newGame(8)
    s = must(applyAction(s, { type: 'PLAN_TASK', playerId: 'a', cardId: 't-req-light', week: 1 }))
    s = toStandup(s)
    const r = applyAction(s, { type: 'MOVE_TASK', playerId: 'a', cardId: 't-req-light', week: 2 })
    expect(isRuleViolation(r) && r.code).toBe('INVALID_STEP')
  })

  it('割り込みカードは予定週を持たず、MOVE_TASK の対象外', () => {
    let s = toStandup(newGame(9))
    s = addBoardTask(
      s,
      makeBoardTask('interrupt-1', {
        interrupt: 'bug',
        interruptEffort: 2,
        plannedWeek: null,
      }),
    )
    s = allReady(s)
    const r = applyAction(s, { type: 'MOVE_TASK', playerId: 'a', cardId: 'interrupt-1', week: 1 })
    expect(isRuleViolation(r) && r.code).toBe('INVALID_TARGET')
  })
})

describe('今週の予定だけに座れる(RULES.md §5-3)', () => {
  it('第2週予定のタスクには第1週の朝会で座れない', () => {
    let s = newGame(10)
    s = must(applyAction(s, { type: 'PLAN_TASK', playerId: 'a', cardId: 't-req-light', week: 2 }))
    s = toStandup(s)
    const r = applyAction(s, {
      type: 'ASSIGN_WORKER',
      playerId: 'a',
      target: { kind: 'task', cardId: 't-req-light' },
    })
    expect(isRuleViolation(r) && r.code).toBe('NOT_PLANNED_THIS_WEEK')
  })

  it('Backlog のタスクにも座れない', () => {
    let s = newGame(11)
    s = must(applyAction(s, { type: 'PLAN_TASK', playerId: 'a', cardId: 't-req-light', week: null }))
    s = toStandup(s)
    const r = applyAction(s, {
      type: 'ASSIGN_WORKER',
      playerId: 'a',
      target: { kind: 'task', cardId: 't-req-light' },
    })
    expect(isRuleViolation(r) && r.code).toBe('NOT_PLANNED_THIS_WEEK')
  })

  it('割り込みカードは予定週に関係なくいつでも着手できる', () => {
    let s = toStandup(newGame(12))
    s = addBoardTask(
      s,
      makeBoardTask('interrupt-1', {
        interrupt: 'bug',
        interruptEffort: 2,
        interruptSkill: 'engineering',
        plannedWeek: null,
      }),
    )
    const next = must(
      applyAction(s, {
        type: 'ASSIGN_WORKER',
        playerId: 'd', // m-engineer-automate は engineering 2
        target: { kind: 'task', cardId: 'interrupt-1' },
      }),
    )
    expect(next.assignments).toHaveLength(1)
  })
})

describe('未完了タスクの自動繰越(RULES.md §5-4)', () => {
  it('第1週に終わらなかったタスクは第2週へ繰り越される', () => {
    let s = newGame(13)
    s = must(applyAction(s, { type: 'PLAN_TASK', playerId: 'a', cardId: 't-req-heavy', week: 1 }))
    s = toStandup(s)
    s = endWeekend(allReady(s))
    expect(s.week).toBe(2)
    expect(s.board.find((t) => t.cardId === 't-req-heavy')!.plannedWeek).toBe(2)
    expect(s.log.some((l) => l.message.includes('繰り越し'))).toBe(true)
  })
})

describe('週別の予定工数と供給能力(RULES.md §5-2)', () => {
  it('系統別に予定工数と能力を集計する', () => {
    let s = newGame(14)
    s = must(applyAction(s, { type: 'PLAN_TASK', playerId: 'a', cardId: 't-req-heavy', week: 1 }))
    const load = weekLoad(s, 1)
    // t-req-heavy: direction / 見積5
    expect(load.planned.direction).toBe(5)
    expect(load.planned.design).toBe(0)
    // 供給能力 = 全員の direction スキルの合計
    const expected = s.players.reduce((sum, p) => sum + p.skills.direction, 0)
    expect(load.capacity.direction).toBe(expected)
  })

  it('過負荷でも配置自体は許可される(警告は UI 側)', () => {
    let s = newGame(15)
    s = must(applyAction(s, { type: 'PLAN_TASK', playerId: 'a', cardId: 't-req-heavy', week: 1 }))
    s = must(applyAction(s, { type: 'PLAN_TASK', playerId: 'a', cardId: 't-sitemap-heavy', week: 1 }))
    const load = weekLoad(s, 1)
    expect(load.planned.direction).toBeGreaterThan(load.capacity.direction)
  })
})

describe('CANCEL_READY / 未配属 Ready の防止(RULES.md §10-4)', () => {
  it('未配属のままでは準備完了できない', () => {
    const s = toStandup(newGame(16))
    const r = applyAction(s, { type: 'DECLARE_READY', playerId: 'a' })
    expect(isRuleViolation(r) && r.code).toBe('NOT_ASSIGNED')
  })

  it('全員が揃う前は準備完了を解除できる', () => {
    let s = toStandup(newGame(17))
    s = apply(
      s,
      { type: 'ASSIGN_WORKER', playerId: 'a', target: { kind: 'rest' } },
      { type: 'DECLARE_READY', playerId: 'a' },
    )
    expect(s.readyPlayerIds).toEqual(['a'])
    s = must(applyAction(s, { type: 'CANCEL_READY', playerId: 'a' }))
    expect(s.readyPlayerIds).toEqual([])
    // 解除後は配属を変えられる
    s = drainPending(
      apply(s, { type: 'UNASSIGN_WORKER', playerId: 'a' }),
    )
    expect(s.assignments).toHaveLength(0)
  })
})
