import { describe, expect, it } from 'vitest'
import {
  allocateV7Workdays,
  allocateV7Learning,
  assignV7Lead,
  assignV7Support,
  createV7State,
  isRuleViolation,
  leaveV7Lead,
  investigateV7Incident,
  planV7Task,
  resolveV7Week,
  resolveV7Incident,
  scheduleV7Handoff,
  triggerV7Event,
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

describe('v7 複数週炎上', () => {
  it('原因不明のまま週末を迎えると炎上が増え、究明後は増加が止まる', () => {
    let next = planned()
    next = ok(assignV7Lead(next, 'a', 'interview'))
    next = ok(triggerV7Event(next, {
      id: 'server', name: 'サーバー障害', source: 'personal', tone: 'bad', fire: 1,
      investigationRequired: 1, resolutionRequired: 2, spreadTarget: 'dependents',
    }, { taskId: 'interview', playerId: 'a' }))
    expect(next.board.find((task) => task.taskId === 'interview')?.fire).toBe(1)
    next = resolveV7Week(next)
    expect(next.board.find((task) => task.taskId === 'interview')?.fire).toBe(2)

    const incidentId = next.incidents[0]!.id
    next = ok(investigateV7Incident(next, incidentId, 'a'))
    expect(next.incidents[0]?.status).toBe('investigated')
    next = resolveV7Week(next)
    expect(next.board.find((task) => task.taskId === 'interview')?.fire).toBe(2)
  })

  it('究明前に原因対応はできず、解決には複数営業日が必要', () => {
    let next = planned()
    next = ok(assignV7Lead(next, 'a', 'interview'))
    next = ok(triggerV7Event(next, {
      id: 'change', name: '仕様変更', source: 'project', tone: 'bad', fire: 1,
      investigationRequired: 1, resolutionRequired: 2, spreadTarget: 'same_skill',
    }, { taskId: 'interview' }))
    const incidentId = next.incidents[0]!.id
    const blocked = resolveV7Incident(next, incidentId, 'a')
    expect(isRuleViolation(blocked) && blocked.code).toBe('TASK_BLOCKED')
    next = ok(investigateV7Incident(next, incidentId, 'a'))
    next = ok(resolveV7Incident(next, incidentId, 'a'))
    expect(next.incidents[0]?.status).toBe('investigated')
    next = ok(resolveV7Incident(next, incidentId, 'a'))
    expect(next.incidents[0]?.status).toBe('resolved')
  })

  it('プロジェクトイベントは複数タスクへ影響する', () => {
    let next = planned()
    next = ok(triggerV7Event(next, {
      id: 'change-all', name: '全体仕様変更', source: 'project', tone: 'bad', fire: 1,
      investigationRequired: 1, resolutionRequired: 1, spreadTarget: 'same_skill',
    }))
    expect(next.board.every((task) => task.fire === 1)).toBe(true)
    expect(next.incidents).toHaveLength(2)
  })
})

describe('v7 成長と資産・負債', () => {
  it('学習2日で4日目を予約し、次週から使える', () => {
    let next = state()
    next = ok(allocateV7Learning(next, 'a', 2))
    expect(next.players[0]?.workdayCapacity).toBe(3)
    expect(next.players[0]?.pendingCapacityGain).toBe(1)
    next = resolveV7Week(next)
    expect(next.players[0]?.workdayCapacity).toBe(4)
  })

  it('フェーズ終了時にLv2は資産、未完了は負債として次フェーズへ残る', () => {
    let next = state()
    next.taskDefinitions = next.taskDefinitions.map((task) =>
      task.id === 'interview' ? { ...task, quality: 2, effort: 1 } : task,
    )
    next = ok(planV7Task(next, 'interview'))
    next = ok(planV7Task(next, 'wireframe'))
    next = ok(assignV7Lead(next, 'a', 'interview'))
    next = ok(allocateV7Workdays(next, 'a', 'interview', 1))
    next = resolveV7Week(next)
    next = resolveV7Week(next)
    next = resolveV7Week(next)
    expect(next.phase).toBe(2)
    expect(next.availableTiles.some((tile) => tile.kind === 'asset')).toBe(true)
    expect(next.availableTiles.some((tile) => tile.kind === 'debt')).toBe(true)
    expect(next.availableTiles.every((tile) => tile.source.length > 0)).toBe(true)
  })
})
