/**
 * 週末処理:配属効果の一括適用(rules-v4-core.md §0・§1-2-3)
 * 残業疲労 → 休憩 → 学習 → 消火 → キューブ → 着席疲労、の順で適用される。
 */
import { describe, expect, it } from 'vitest'
import { applyAction } from '../src/applyAction'
import { addBoardTask, allReady, makeBoardTask, must, newGame, toStandup, withPlayer } from './util'

describe('週末処理:キューブと着席疲労', () => {
  it('キューブ加算は複数人のスキル値の足し算、着席疲労はタスクの疲労値ぶん乗る', () => {
    let state = toStandup(newGame(20))
    state = addBoardTask(state, makeBoardTask('t-req-heavy')) // direction / effort5 / fatigue2
    state = must(
      applyAction(state, {
        type: 'ASSIGN_WORKER',
        playerId: 'a', // direction 2
        target: { kind: 'task', cardId: 't-req-heavy' },
      }),
    )
    state = must(
      applyAction(state, {
        type: 'ASSIGN_WORKER',
        playerId: 'b', // direction 1
        target: { kind: 'task', cardId: 't-req-heavy' },
      }),
    )
    state = allReady(state)

    const task = state.board.find((b) => b.cardId === 't-req-heavy')!
    expect(task.cubes).toBe(3) // 2 + 1
    expect(task.contributorIds.sort()).toEqual(['a', 'b'])

    const a = state.players.find((p) => p.id === 'a')!
    const b = state.players.find((p) => p.id === 'b')!
    expect(a.fatigue).toBe(2) // タスクの疲労値2
    expect(b.fatigue).toBe(2)
  })

  it('残業疲労はマルチタスク持ちには乗らない(同じタスクに主担当+残業で2枠)', () => {
    let state = toStandup(newGame(21))
    state = addBoardTask(state, makeBoardTask('t-req-light')) // fatigue1
    state = must(
      applyAction(state, {
        type: 'ASSIGN_WORKER',
        playerId: 'a', // expedite持ち(マルチタスクではない)
        target: { kind: 'task', cardId: 't-req-light' },
      }),
    )
    state = must(
      applyAction(state, {
        type: 'ASSIGN_WORKER',
        playerId: 'a',
        target: { kind: 'task', cardId: 't-req-light' },
        overtime: true,
      }),
    )
    state = must(
      applyAction(state, {
        type: 'ASSIGN_WORKER',
        playerId: 'b', // マルチタスク持ち
        target: { kind: 'task', cardId: 't-req-light' },
      }),
    )
    state = must(
      applyAction(state, {
        type: 'ASSIGN_WORKER',
        playerId: 'b',
        target: { kind: 'task', cardId: 't-req-light' },
        overtime: true,
      }),
    )
    state = allReady(state)

    const a = state.players.find((p) => p.id === 'a')!
    const b = state.players.find((p) => p.id === 'b')!
    // a: 残業の即時疲労+1 + 着席疲労(主担当1 + 残業1) = 3
    expect(a.fatigue).toBe(3)
    // b: マルチタスクなので残業の即時疲労なし。着席疲労(主担当1 + 残業1) = 2
    expect(b.fatigue).toBe(2)
    expect(a.fatigue - b.fatigue).toBe(state.config.overtimeFatigue)
  })

  it('休憩は疲労-restRecovery(0未満にはならない)', () => {
    let state = toStandup(newGame(22))
    state = withPlayer(state, 'a', { fatigue: 1 })
    state = must(
      applyAction(state, { type: 'ASSIGN_WORKER', playerId: 'a', target: { kind: 'rest' } }),
    )
    state = allReady(state)
    const a = state.players.find((p) => p.id === 'a')!
    expect(a.fatigue).toBe(0) // max(0, 1 - 2)
  })

  it('学習は来週開始時にスキル+1として反映される', () => {
    let state = toStandup(newGame(23))
    state = must(
      applyAction(state, {
        type: 'ASSIGN_WORKER',
        playerId: 'd', // direction 0
        target: { kind: 'learn', skill: 'direction' },
      }),
    )
    state = allReady(state)
    let d = state.players.find((p) => p.id === 'd')!
    expect(d.pendingLearn).toBe('direction')
    expect(d.skills.direction).toBe(0) // まだ反映されない

    state = must(applyAction(state, { type: 'END_WEEKEND', playerId: 'a' })) // 次週へ
    d = state.players.find((p) => p.id === 'd')!
    expect(state.week).toBe(2)
    expect(d.pendingLearn).toBeNull()
    expect(d.skills.direction).toBe(1) // 来週開始時に反映
  })

  it('消火は納品判定より先に適用される(🔥を消せば必要工数が下がり納品できる)', () => {
    let state = toStandup(newGame(24))
    // effort2 + fire1 = 必要工数3。cubesは2しかないので消火しないと届かない
    state = addBoardTask(state, makeBoardTask('t-req-light', { cubes: 2, fire: 1 }))
    state = must(
      applyAction(state, {
        type: 'ASSIGN_WORKER',
        playerId: 'a',
        target: { kind: 'extinguish', cardId: 't-req-light' },
      }),
    )
    state = allReady(state)

    const task = state.board.find((b) => b.cardId === 't-req-light')!
    expect(task.fire).toBe(0)
    expect(task.cubes).toBe(2)

    const delivered = must(applyAction(state, { type: 'DELIVER_TASK', cardId: 't-req-light' }))
    expect(delivered.board.some((b) => b.cardId === 't-req-light')).toBe(false)
  })
})
