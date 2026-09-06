/**
 * 見積工数と実工数の差異(RULES.md §2-2。Issue #3)
 */
import { describe, expect, it } from 'vitest'
import { applyAction } from '../src/applyAction'
import { estimatedCubes, requiredCubes } from '../src/helpers'
import { DEFAULT_CONFIG } from '../src/types'
import {
  addBoardTask,
  allReady,
  apply,
  endWeekend,
  makeBoardTask,
  must,
  newGame,
  toStandup,
} from './util'

describe('リスク分布(RULES.md §2-2)', () => {
  it('低リスクは振れ幅が小さく、高リスクは上振れする。中リスクだけ下振れを持つ', () => {
    const { low, medium, high } = DEFAULT_CONFIG.riskVariance
    expect(Math.min(...low)).toBe(0)
    expect(Math.max(...low)).toBe(1)
    expect(Math.min(...medium)).toBe(-1)
    expect(Math.max(...high)).toBe(2)
    expect(Math.min(...high)).toBe(0)

    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    expect(mean(low)).toBeLessThan(mean(medium))
    expect(mean(medium)).toBeLessThan(mean(high))
  })
})

describe('実工数の公開', () => {
  it('着手前は見積工数で扱われ、実工数は伏せられている', () => {
    let s = newGame(20)
    s = must(applyAction(s, { type: 'PLAN_TASK', playerId: 'a', cardId: 't-req-heavy', week: 1 }))
    const task = s.board.find((t) => t.cardId === 't-req-heavy')!
    expect(task.actualEffort).toBeNull()
    expect(requiredCubes(s, task)).toBe(5) // 見積5
  })

  it('初めてキューブが積まれた週の週末に実工数が公開される', () => {
    let s = newGame(21)
    s = must(applyAction(s, { type: 'PLAN_TASK', playerId: 'a', cardId: 't-req-heavy', week: 1 }))
    s = toStandup(s)
    s = apply(s, {
      type: 'ASSIGN_WORKER',
      playerId: 'a',
      target: { kind: 'task', cardId: 't-req-heavy' },
    })
    s = allReady(s)

    const task = s.board.find((t) => t.cardId === 't-req-heavy')!
    expect(task.actualEffort).not.toBeNull()
    // 低リスク:見積5 に対して 5 か 6
    expect([5, 6]).toContain(task.actualEffort)
    expect(s.log.some((l) => l.message.includes('実工数'))).toBe(true)
  })

  it('公開後は必要工数が実工数ベースになる', () => {
    let s = toStandup(newGame(22))
    s = addBoardTask(s, makeBoardTask('t-req-heavy', { cubes: 1, actualEffort: 7 }))
    const task = s.board.find((t) => t.cardId === 't-req-heavy')!
    expect(requiredCubes(s, task)).toBe(7)
    expect(estimatedCubes(s, task)).toBe(5) // 見積ベースの表示は 5 のまま
  })

  it('🔥は実工数に加算される', () => {
    let s = toStandup(newGame(23))
    s = addBoardTask(s, makeBoardTask('t-req-heavy', { actualEffort: 6, fire: 2 }))
    expect(requiredCubes(s, s.board[s.board.length - 1]!)).toBe(8)
  })

  it('誰も座らなかったタスクの実工数は公開されない', () => {
    let s = newGame(24)
    s = must(applyAction(s, { type: 'PLAN_TASK', playerId: 'a', cardId: 't-req-heavy', week: 1 }))
    s = toStandup(s)
    s = allReady(s) // 全員休憩
    expect(s.board.find((t) => t.cardId === 't-req-heavy')!.actualEffort).toBeNull()
  })
})

describe('リプレイ再現性(RULES.md §2-2)', () => {
  it('同じシード・同じアクション列なら同じ実工数になる', () => {
    const run = () => {
      let s = newGame(999)
      s = must(applyAction(s, { type: 'PLAN_TASK', playerId: 'a', cardId: 't-req-light', week: 1 }))
      s = toStandup(s)
      s = apply(s, {
        type: 'ASSIGN_WORKER',
        playerId: 'a',
        target: { kind: 'task', cardId: 't-req-light' },
      })
      s = allReady(s)
      return s.board.find((t) => t.cardId === 't-req-light')?.actualEffort ?? null
    }
    const first = run()
    const second = run()
    expect(first).not.toBeNull()
    expect(first).toBe(second)
  })

  it('シードが違えば実工数がばらつきうる(高リスクタスク)', () => {
    const run = (seed: number) => {
      let s = newGame(seed)
      s = must(applyAction(s, { type: 'PLAN_TASK', playerId: 'a', cardId: 't-req-light', week: 1 }))
      s = toStandup(s)
      s = apply(s, {
        type: 'ASSIGN_WORKER',
        playerId: 'a',
        target: { kind: 'task', cardId: 't-req-light' },
      })
      s = allReady(s)
      return s.board.find((t) => t.cardId === 't-req-light')!.actualEffort!
    }
    const results = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(run))
    // t-req-light は high リスク(見積2 → 2〜4)
    for (const value of results) {
      expect(value).toBeGreaterThanOrEqual(2)
      expect(value).toBeLessThanOrEqual(4)
    }
    expect(results.size).toBeGreaterThan(1)
  })
})

describe('差分のフィードバック', () => {
  it('見積と実工数がずれたらログに差分が出る', () => {
    let s = newGame(3)
    s = must(applyAction(s, { type: 'PLAN_TASK', playerId: 'a', cardId: 't-req-light', week: 1 }))
    s = toStandup(s)
    s = apply(s, {
      type: 'ASSIGN_WORKER',
      playerId: 'a',
      target: { kind: 'task', cardId: 't-req-light' },
    })
    s = allReady(s)
    const line = s.log.find((l) => l.message.includes('実工数'))!
    expect(line.message).toMatch(/実工数/)
  })
})

describe('差し込みカードには振れ幅がない', () => {
  it('割り込みの必要工数は定義値のまま', () => {
    let s = toStandup(newGame(25))
    s = addBoardTask(
      s,
      makeBoardTask('interrupt-1', {
        interrupt: 'bug',
        interruptEffort: 2,
        plannedWeek: null,
      }),
    )
    s = apply(s, {
      type: 'ASSIGN_WORKER',
      playerId: 'd',
      target: { kind: 'task', cardId: 'interrupt-1' },
    })
    s = endWeekend(allReady(s))
    // 週末を跨いでも interruptEffort は変わらない(公開・振れ幅の対象外)
    const task = s.board.find((t) => t.cardId === 'interrupt-1')
    if (task) {
      expect(task.actualEffort).toBeNull()
      expect(task.interruptEffort).toBe(2)
    }
  })
})
