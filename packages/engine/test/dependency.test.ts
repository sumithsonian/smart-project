/**
 * 依存関係と遅延の伝播(RULES.md §6。Issue #4)
 */
import { describe, expect, it } from 'vitest'
import { applyAction } from '../src/applyAction'
import { isRuleViolation } from '../src/types'
import { isTaskBlocked, unmetPrerequisites } from '../src/helpers'
import {
  addBoardTask,
  allReady,
  endWeekend,
  makeBoardTask,
  must,
  newGame,
  toStandup,
  withSlot,
} from './util'

describe('前提成果物(RULES.md §6-1)', () => {
  it('タスクカードは前提成果物を持つ', () => {
    const s = newGame(1)
    const sitemap = s.content.tasks.find((t) => t.id === 't-sitemap-light')!
    expect(sitemap.prerequisiteSlots).toEqual(['requirements'])
    const req = s.content.tasks.find((t) => t.id === 't-req-light')!
    expect(req.prerequisiteSlots).toEqual([])
  })

  it('前提が未納品のタスクはブロック中になる', () => {
    let s = toStandup(newGame(2))
    s = addBoardTask(s, makeBoardTask('t-sitemap-light', { plannedWeek: 1 }))
    const task = s.board.find((t) => t.cardId === 't-sitemap-light')!
    expect(isTaskBlocked(s, task)).toBe(true)
    expect(unmetPrerequisites(s, task)).toEqual(['requirements'])
  })

  it('前提が納品されるとブロックが外れる', () => {
    let s = toStandup(newGame(3))
    s = addBoardTask(s, makeBoardTask('t-sitemap-light', { plannedWeek: 1 }))
    s = withSlot(s, 'requirements', { level: 1 })
    const task = s.board.find((t) => t.cardId === 't-sitemap-light')!
    expect(isTaskBlocked(s, task)).toBe(false)
    expect(unmetPrerequisites(s, task)).toEqual([])
  })

  it('前提スロットに手戻りが乗っている間はブロックが戻る', () => {
    let s = toStandup(newGame(4))
    s = withSlot(s, 'requirements', { level: 1 })
    s = addBoardTask(s, makeBoardTask('t-sitemap-light', { plannedWeek: 1 }))
    s = addBoardTask(
      s,
      makeBoardTask('interrupt-1', {
        interrupt: 'rework',
        interruptEffort: 2,
        targetSlotId: 'requirements',
        plannedWeek: null,
      }),
    )
    const task = s.board.find((t) => t.cardId === 't-sitemap-light')!
    expect(isTaskBlocked(s, task)).toBe(true)
  })
})

describe('ブロック中タスクへの配属(RULES.md §6-2)', () => {
  it('エンジンが TASK_BLOCKED で拒否する', () => {
    let s = toStandup(newGame(5))
    s = addBoardTask(s, makeBoardTask('t-sitemap-light', { plannedWeek: 1 }))
    const r = applyAction(s, {
      type: 'ASSIGN_WORKER',
      playerId: 'a',
      target: { kind: 'task', cardId: 't-sitemap-light' },
    })
    expect(isRuleViolation(r) && r.code).toBe('TASK_BLOCKED')
    expect(isRuleViolation(r) && r.message).toContain('要件定義書')
  })

  it('前提を満たせば配属できる', () => {
    let s = toStandup(newGame(6))
    s = withSlot(s, 'requirements', { level: 1 })
    s = addBoardTask(s, makeBoardTask('t-sitemap-light', { plannedWeek: 1 }))
    const next = must(
      applyAction(s, {
        type: 'ASSIGN_WORKER',
        playerId: 'a',
        target: { kind: 'task', cardId: 't-sitemap-light' },
      }),
    )
    expect(next.assignments).toHaveLength(1)
  })

  it('計画ボードへの配置自体はブロック中でも自由にできる(先を見越した計画)', () => {
    const s = newGame(7)
    const next = must(
      applyAction(s, { type: 'PLAN_TASK', playerId: 'a', cardId: 't-sitemap-light', week: 3 }),
    )
    expect(next.board.find((t) => t.cardId === 't-sitemap-light')!.plannedWeek).toBe(3)
  })
})

describe('遅延の伝播(RULES.md §6-3)', () => {
  it('先行が遅れると後続はブロックされたまま予定週を迎え、翌週へ繰り越される', () => {
    let s = newGame(8)
    // 第1週:要件定義(重い方=見積5)、第2週:サイトマップ
    s = must(applyAction(s, { type: 'PLAN_TASK', playerId: 'a', cardId: 't-req-heavy', week: 1 }))
    s = must(applyAction(s, { type: 'PLAN_TASK', playerId: 'a', cardId: 't-sitemap-light', week: 2 }))
    s = toStandup(s)

    // 第1週は誰も要件定義を進めない(全員休憩)
    s = endWeekend(allReady(s))
    expect(s.week).toBe(2)

    // 第2週:サイトマップは前提未達でブロック
    const sitemap = s.board.find((t) => t.cardId === 't-sitemap-light')!
    expect(isTaskBlocked(s, sitemap)).toBe(true)
    const r = applyAction(s, {
      type: 'ASSIGN_WORKER',
      playerId: 'a',
      target: { kind: 'task', cardId: 't-sitemap-light' },
    })
    expect(isRuleViolation(r) && r.code).toBe('TASK_BLOCKED')

    // 第2週も進まず → 第3週へ繰り越される
    s = endWeekend(allReady(s))
    expect(s.week).toBe(3)
    expect(s.board.find((t) => t.cardId === 't-sitemap-light')!.plannedWeek).toBe(3)
  })

  it('再計画で後続を移動できる(週末のみ)', () => {
    let s = newGame(9)
    s = must(applyAction(s, { type: 'PLAN_TASK', playerId: 'a', cardId: 't-sitemap-light', week: 2 }))
    s = toStandup(s)
    s = allReady(s) // 週末へ
    expect(s.step).toBe('weekend')
    s = must(applyAction(s, { type: 'MOVE_TASK', playerId: 'a', cardId: 't-sitemap-light', week: 3 }))
    expect(s.board.find((t) => t.cardId === 't-sitemap-light')!.plannedWeek).toBe(3)
  })
})
