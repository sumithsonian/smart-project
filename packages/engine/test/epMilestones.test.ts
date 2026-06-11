import { describe, it, expect } from 'vitest'
import type { GameState } from '../src/types'
import { isRuleViolation } from '../src/types'
import { applyAction } from '../src/applyAction'
import { createInitialState } from '../src/initialState'
import { processPhaseEnd } from '../src/actions/phaseEnd'
import { apply, must, newGame, withPlayer, PLAYERS } from './util'

describe('個人目標の選択(RULES.md §11)', () => {
  function setupWithChoices(): GameState {
    return must(
      applyAction(createInitialState(), {
        type: 'SETUP_GAME',
        seed: 42,
        players: PLAYERS,
        clientId: 'cl-komakai',
        projectCardId: 'pj-corporate',
        projectSheetId: 'ps-standard',
        config: { fireEnabled: false }, // 目標選択だけを見る
      }),
    )
  }

  it('各プレイヤーに2枚配られ、全員が選ぶまで他のアクションはできない', () => {
    const state = setupWithChoices()
    expect(state.step).toBe('goal_selection')
    expect(state.players.every((p) => p.goalOptionIds.length === 2)).toBe(true)
    expect(state.players.every((p) => p.personalGoalId === '')).toBe(true)
    // 配られた16枚...ではなく 4人×2枚 = 8枚はすべて別カード
    const dealt = state.players.flatMap((p) => p.goalOptionIds)
    expect(new Set(dealt).size).toBe(8)

    const blocked = applyAction(state, { type: 'DECLARE_READY', playerId: 'a' })
    expect(isRuleViolation(blocked) && blocked.code).toBe('GOAL_SELECTION_PENDING')
  })

  it('全員が選択するとプランニングへ進む(選択肢は手元から消える)', () => {
    let state = setupWithChoices()
    for (const p of PLAYERS) {
      state = apply(state, { type: 'SELECT_PERSONAL_GOAL', playerId: p.id, choiceIndex: 1 })
    }
    expect(state.step).toBe('planning')
    expect(state.players.every((p) => p.personalGoalId !== '')).toBe(true)
    expect(state.players.every((p) => p.goalOptionIds.length === 0)).toBe(true)
  })

  it('二重選択と範囲外の選択は拒否される', () => {
    let state = setupWithChoices()
    state = apply(state, { type: 'SELECT_PERSONAL_GOAL', playerId: 'a', choiceIndex: 0 })
    const again = applyAction(state, { type: 'SELECT_PERSONAL_GOAL', playerId: 'a', choiceIndex: 1 })
    expect(isRuleViolation(again) && again.code).toBe('GOAL_ALREADY_SELECTED')
    const outOfRange = applyAction(state, {
      type: 'SELECT_PERSONAL_GOAL',
      playerId: 'b',
      choiceIndex: 5,
    })
    expect(isRuleViolation(outOfRange) && outOfRange.code).toBe('INVALID_GOAL_CHOICE')
  })
})

describe('EP:自分の仕事が他人に使われた回数(RULES.md §11)', () => {
  /** p1-hearing(親)の参加者を b に捏造し、a が p1-requirements を解決する状況を作る */
  function resolveChildWithoutParentParticipant(): GameState {
    let state = newGame(42, { config: { epEnabled: true } })
    state = {
      ...state,
      // 親は解決済み・参加者は b と記録
      taskArea: state.taskArea.map((t) =>
        t.tileId === 'p1-hearing' ? { ...t, resolved: true, resolvedPhase: 1 } : t,
      ),
      taskParticipants: { 'p1-hearing': ['b'] },
      // 要件カードの山を固定(効果なしを選ばせる)
      decks: {
        ...state.decks,
        requirements: { drawPile: ['rq-as-spec', 'rq-license'], discardPile: [] },
      },
    }
    state = apply(
      state,
      { type: 'PLACE_TOKEN', playerId: 'a', target: { kind: 'task', taskTileId: 'p1-requirements' } },
      { type: 'PLACE_TOKEN', playerId: 'a', target: { kind: 'task', taskTileId: 'p1-requirements' } },
      { type: 'PLACE_TOKEN', playerId: 'a', target: { kind: 'task', taskTileId: 'p1-requirements' } },
      { type: 'DECLARE_READY', playerId: 'a' },
      { type: 'DECLARE_READY', playerId: 'b' },
      { type: 'DECLARE_READY', playerId: 'c' },
      { type: 'DECLARE_READY', playerId: 'd' },
      {
        type: 'DECLARE_TASK_ORDER',
        playerId: 'a',
        order: ['p1-requirements', 'p1-sitemap', 'p1-research', 'p1-estimate'],
      },
      { type: 'RESOLVE_NEXT_TASK' },
      { type: 'SELECT_REQUIREMENT_CARD', choiceIndex: 0 },
    )
    return state
  }

  it('親タスクの参加者は、子を他人が解決すると EP +1', () => {
    const state = resolveChildWithoutParentParticipant()
    expect(state.taskArea.find((t) => t.tileId === 'p1-requirements')!.resolved).toBe(true)
    expect(state.players.find((p) => p.id === 'b')!.ep).toBe(1) // 親参加者
    expect(state.players.find((p) => p.id === 'a')!.ep).toBe(0) // 解決者自身は増えない
  })

  it('消火したタスクが他人に解決されると EP +1', () => {
    let state = newGame(42, { config: { epEnabled: true } })
    state = {
      ...state,
      taskArea: state.taskArea.map((t) =>
        t.tileId === 'p1-hearing' ? { ...t, extinguisherIds: ['c'] } : t,
      ),
    }
    state = apply(
      state,
      { type: 'PLACE_TOKEN', playerId: 'a', target: { kind: 'task', taskTileId: 'p1-hearing' } },
      { type: 'PLACE_TOKEN', playerId: 'a', target: { kind: 'task', taskTileId: 'p1-hearing' } },
      { type: 'DECLARE_READY', playerId: 'a' },
      { type: 'DECLARE_READY', playerId: 'b' },
      { type: 'DECLARE_READY', playerId: 'c' },
      { type: 'DECLARE_READY', playerId: 'd' },
      {
        type: 'DECLARE_TASK_ORDER',
        playerId: 'a',
        order: ['p1-hearing', 'p1-requirements', 'p1-sitemap', 'p1-research', 'p1-estimate'],
      },
      { type: 'RESOLVE_NEXT_TASK' },
    )
    expect(state.players.find((p) => p.id === 'c')!.ep).toBe(1)
  })

  it('epEnabled=false なら EP は増えない', () => {
    let state = newGame() // epEnabled: false
    state = {
      ...state,
      taskArea: state.taskArea.map((t) =>
        t.tileId === 'p1-hearing' ? { ...t, resolved: true, resolvedPhase: 1 } : t,
      ),
      taskParticipants: { 'p1-hearing': ['b'] },
      decks: {
        ...state.decks,
        requirements: { drawPile: ['rq-as-spec', 'rq-license'], discardPile: [] },
      },
    }
    state = apply(
      state,
      { type: 'PLACE_TOKEN', playerId: 'a', target: { kind: 'task', taskTileId: 'p1-requirements' } },
      { type: 'PLACE_TOKEN', playerId: 'a', target: { kind: 'task', taskTileId: 'p1-requirements' } },
      { type: 'PLACE_TOKEN', playerId: 'a', target: { kind: 'task', taskTileId: 'p1-requirements' } },
      { type: 'DECLARE_READY', playerId: 'a' },
      { type: 'DECLARE_READY', playerId: 'b' },
      { type: 'DECLARE_READY', playerId: 'c' },
      { type: 'DECLARE_READY', playerId: 'd' },
      {
        type: 'DECLARE_TASK_ORDER',
        playerId: 'a',
        order: ['p1-requirements', 'p1-sitemap', 'p1-research', 'p1-estimate'],
      },
      { type: 'RESOLVE_NEXT_TASK' },
      { type: 'SELECT_REQUIREMENT_CARD', choiceIndex: 0 },
    )
    expect(state.players.every((p) => p.ep === 0)).toBe(true)
  })
})

describe('マイルストーン:公開・早取り(RULES.md §11)', () => {
  function withMilestone(state: GameState, cardId: string): GameState {
    return {
      ...state,
      config: { ...state.config, milestonesEnabled: true },
      milestones: [{ cardId, achievedBy: null }],
    }
  }

  it('最初に条件を達成した1人だけが獲得する', () => {
    // 鬼の工数:1フェーズにトークン5個以上をタスクへ配置
    let state = withMilestone(newGame(), 'ms-workhorse')
    for (let i = 0; i < 5; i++) {
      state = apply(state, {
        type: 'PLACE_TOKEN',
        playerId: 'a',
        target: { kind: 'task', taskTileId: 'p1-estimate' },
      })
    }
    expect(state.milestones[0]!.achievedBy).toBe('a')

    // b が後から達成しても変わらない
    state = withPlayer(state, 'b', { tokens: 6 })
    for (let i = 0; i < 5; i++) {
      state = apply(state, {
        type: 'PLACE_TOKEN',
        playerId: 'b',
        target: { kind: 'task', taskTileId: 'p1-research' },
      })
    }
    expect(state.milestones[0]!.achievedBy).toBe('a')
  })

  it('消火系マイルストーン:累計消火回数で判定される', () => {
    let state = withMilestone(newGame(), 'ms-firefighter')
    state = withPlayer(state, 'c', { extinguishCount: 4 })
    state = {
      ...state,
      taskArea: state.taskArea.map((t) =>
        t.tileId === 'p1-hearing' ? { ...t, fire: 1 } : t,
      ),
    }
    state = apply(state, { type: 'EXTINGUISH_FIRE', playerId: 'c', taskTileId: 'p1-hearing' })
    expect(state.milestones[0]!.achievedBy).toBe('c')
  })

  it('個人勝利:目標未達でもマイルストーン獲得で個人勝利になる', () => {
    let state = newGame(42, { config: { milestonesEnabled: true, csInstantLose: false } })
    state = {
      ...state,
      phase: 4,
      milestones: [{ cardId: 'ms-workhorse', achievedBy: 'b' }],
      // 品質を満たして CS を保つ
      deliverables: [
        { level: 2, acquiredPhase: 4, sourceTileId: 'p1-requirements', participants: ['a'] },
      ],
      taskArea: state.taskArea.map((t) => ({ ...t, resolved: true, resolvedPhase: 4 })),
    }
    // b の個人目標は未達にしておく(学習マニア)
    state = withPlayer(state, 'b', { personalGoalId: 'pg-learner' })
    state = processPhaseEnd(state)
    const next = apply(state, { type: 'ADVANCE_PHASE' })
    expect(next.result?.outcome).toBe('win')
    expect(next.result?.personalResults['b']).toBe(true) // マイルストーンで個人勝利
  })

  it('新しい個人目標条件:EP・消火・全系統スキルが判定できる', () => {
    let state = newGame(42, { config: { epEnabled: true } })
    state = withPlayer(state, 'a', { personalGoalId: 'pg-hub', ep: 5 })
    state = withPlayer(state, 'b', { personalGoalId: 'pg-firefighter', extinguishCount: 4 })
    state = withPlayer(state, 'c', {
      personalGoalId: 'pg-generalist',
      skills: { direction: 1, design: 2, engineering: 1 },
    })
    state = {
      ...state,
      phase: 4,
      deliverables: [
        { level: 2, acquiredPhase: 4, sourceTileId: 'p1-requirements', participants: ['a'] },
      ],
      taskArea: state.taskArea.map((t) => ({ ...t, resolved: true, resolvedPhase: 4 })),
    }
    state = processPhaseEnd(state)
    const next = apply(state, { type: 'ADVANCE_PHASE' })
    expect(next.result?.personalResults['a']).toBe(true)
    expect(next.result?.personalResults['b']).toBe(true)
    expect(next.result?.personalResults['c']).toBe(true)
  })
})
