import { describe, expect, it } from 'vitest'
import {
  allocateV7Workdays,
  assignV7Lead,
  assignV7Support,
  createV7State,
  isRuleViolation,
  leaveV7Lead,
  planV7Task,
  resolveV7Week,
  scheduleV7Handoff,
  urgentV7Handoff,
  type V7State,
} from '../src'

function state(): V7State {
  return createV7State({
    players: [
      { id: 'a', name: 'A', skills: { direction: 2, design: 1, engineering: 0 } },
      { id: 'b', name: 'B', skills: { direction: 1, design: 2, engineering: 1 } },
      { id: 'c', name: 'C', skills: { direction: 1, design: 1, engineering: 2 } },
      { id: 'd', name: 'D', skills: { direction: 1, design: 1, engineering: 1 } },
    ],
    slots: [
      { id: 'requirements', name: '要件' },
      { id: 'design', name: '設計' },
    ],
    tasks: [
      {
        id: 'interview',
        name: 'ユーザーインタビュー',
        slotId: 'requirements',
        skill: 'direction',
        effort: 4,
        prerequisiteSlotIds: [],
      },
      {
        id: 'survey',
        name: 'アンケート',
        slotId: 'requirements',
        skill: 'direction',
        effort: 3,
        prerequisiteSlotIds: [],
      },
      {
        id: 'wireframe',
        name: 'ワイヤーフレーム',
        slotId: 'design',
        skill: 'design',
        effort: 4,
        prerequisiteSlotIds: ['requirements'],
      },
    ],
  })
}

function ok(result: ReturnType<typeof planV7Task>): V7State {
  if (isRuleViolation(result)) throw new Error(`${result.code}: ${result.message}`)
  return result
}

function planned(): V7State {
  let next = state()
  next = ok(planV7Task(next, 'interview'))
  next = ok(planV7Task(next, 'wireframe'))
  return next
}

describe('v7 計画: 成果物枠へタスクタイルを選ぶ', () => {
  it('同じ成果物枠には候補を1枚だけ置く', () => {
    const next = ok(planV7Task(state(), 'interview'))
    const result = planV7Task(next, 'survey')
    expect(isRuleViolation(result) && result.code).toBe('INVALID_TARGET')
  })

  it('前提成果物が完成するまで後続タスクへ工数を置けない', () => {
    let next = planned()
    next = ok(assignV7Lead(next, 'b', 'wireframe'))
    const result = allocateV7Workdays(next, 'b', 'wireframe', 1)
    expect(isRuleViolation(result) && result.code).toBe('TASK_BLOCKED')
  })
})

describe('v7 ワーカー配置: 5営業日のうち有効な日を配分する', () => {
  it('開始時は3日で、能力補正は主担当が働いた週に1回だけ加算される', () => {
    let next = planned()
    expect(next.config.maxWorkdays).toBe(5)
    expect(next.players.every((player) => player.workdayCapacity === 3)).toBe(true)
    next = ok(assignV7Lead(next, 'a', 'interview'))
    next = ok(assignV7Support(next, 'b', 'interview'))
    next = ok(allocateV7Workdays(next, 'a', 'interview', 2))
    next = ok(allocateV7Workdays(next, 'b', 'interview', 1))

    next = resolveV7Week(next)
    expect(next.board.find((task) => task.taskId === 'interview')?.progress).toBe(4)
    expect(next.board.find((task) => task.taskId === 'interview')?.status).toBe('completed')
    expect(next.slots.find((slot) => slot.id === 'requirements')?.completedByTaskId).toBe(
      'interview',
    )
    expect(next.allocations).toEqual([])
  })

  it('有効営業日を超える配置は拒否する', () => {
    let next = planned()
    next = ok(assignV7Lead(next, 'a', 'interview'))
    const result = allocateV7Workdays(next, 'a', 'interview', 4)
    expect(isRuleViolation(result) && result.code).toBe('LIMIT_REACHED')
  })

  it('主担当と副担当は各プレイヤー同時に1タスクまで', () => {
    let next = planned()
    next = ok(assignV7Lead(next, 'a', 'interview'))
    const secondLead = assignV7Lead(next, 'a', 'wireframe')
    expect(isRuleViolation(secondLead) && secondLead.code).toBe('LIMIT_REACHED')

    next = ok(assignV7Lead(next, 'b', 'wireframe'))
    next = ok(assignV7Support(next, 'c', 'interview'))
    const secondSupport = assignV7Support(next, 'c', 'wireframe')
    expect(isRuleViolation(secondSupport) && secondSupport.code).toBe('LIMIT_REACHED')
  })
})

describe('v7 引き継ぎ: 目先の進捗と翌週の自由度を交換する', () => {
  it('通常引き継ぎは双方1日を使い、交代は翌週から有効になる', () => {
    let next = planned()
    next = ok(assignV7Lead(next, 'a', 'interview'))
    next = ok(scheduleV7Handoff(next, {
      taskId: 'interview',
      role: 'lead',
      fromPlayerId: 'a',
      toPlayerId: 'b',
    }))
    expect(next.board.find((task) => task.taskId === 'interview')?.leadPlayerId).toBe('a')
    expect(next.allocations).toHaveLength(2)

    next = resolveV7Week(next)
    expect(next.board.find((task) => task.taskId === 'interview')?.leadPlayerId).toBe('b')
  })

  it('緊急引き継ぎは3日を使い即時交代し、炎上対応クレジットを得る', () => {
    let next = planned()
    next = ok(assignV7Lead(next, 'a', 'interview'))
    next = ok(urgentV7Handoff(next, { taskId: 'interview', role: 'lead', toPlayerId: 'b' }))
    expect(next.board.find((task) => task.taskId === 'interview')?.leadPlayerId).toBe('b')
    expect(next.allocations.find((allocation) => allocation.playerId === 'b')?.days).toBe(3)
    expect(next.emergencyResponseCredits.b).toBe(1)
    const noDayLeft = allocateV7Workdays(next, 'b', 'interview', 1)
    expect(isRuleViolation(noDayLeft) && noDayLeft.code).toBe('LIMIT_REACHED')
  })

  it('引き継ぎなしの離脱は炎上を1増やし、通常作業を止める', () => {
    let next = planned()
    next = ok(assignV7Lead(next, 'a', 'interview'))
    next = ok(leaveV7Lead(next, 'a', 'interview'))
    expect(next.board.find((task) => task.taskId === 'interview')?.fire).toBe(1)
    next = ok(assignV7Lead(next, 'b', 'interview'))
    const blocked = allocateV7Workdays(next, 'b', 'interview', 1)
    expect(isRuleViolation(blocked) && blocked.code).toBe('TASK_BLOCKED')
  })
})
