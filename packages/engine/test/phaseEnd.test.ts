import { describe, it, expect } from 'vitest'
import type { GameState } from '../src/types'
import { isRuleViolation } from '../src/types'
import { applyAction } from '../src/applyAction'
import { processPhaseEnd, evaluatePersonalGoal } from '../src/actions/phaseEnd'
import { apply, newGame, withPlayer } from './util'

/** フェーズ1のタスクを resolvedCount 枚だけ解決済みにした状態を作る */
function withResolved(state: GameState, resolvedCount: number): GameState {
  return {
    ...state,
    taskArea: state.taskArea.map((t, i) =>
      i < resolvedCount ? { ...t, resolved: true, resolvedPhase: state.phase } : t,
    ),
  }
}

/** Lv2 成果物を count 個持たせる */
function withLv2Deliverables(state: GameState, count: number, participants: string[]): GameState {
  return {
    ...state,
    deliverables: Array.from({ length: count }, () => ({
      level: 2 as const,
      acquiredPhase: state.phase,
      sourceTileId: 'p1-requirements',
      participants,
    })),
  }
}

/** 品質判定を満たした(D判定だけを見たい時用の)状態 */
function qualityOk(state: GameState): GameState {
  return withLv2Deliverables(state, 1, ['a'])
}

describe('フェーズ終了:納期(D)判定の境界値(RULES.md §2-4)', () => {
  it('未解決数 = 許容数なら CS は減らない', () => {
    // ps-standard フェーズ1の許容数は1
    const state = qualityOk(withResolved(newGame(), 4)) // 未解決1
    const next = processPhaseEnd(state)
    expect(next.cs).toBe(state.cs)
    expect(next.lastPhaseSummary!.deadlineMet).toBe(true)
  })

  it('未解決数 = 許容数+1 なら CS が D 重みぶん減る', () => {
    const state = qualityOk(withResolved(newGame(), 3)) // 未解決2 > 許容1
    const next = processPhaseEnd(state) // cl-komakai: d=1
    expect(next.cs).toBe(state.cs - 1)
    expect(next.lastPhaseSummary!.deadlineMet).toBe(false)
  })

  it('納期重視クライアント(D重み3)だと納期超過が重い', () => {
    const state = qualityOk(withResolved(newGame(42, { clientId: 'cl-marunage' }), 3))
    const next = processPhaseEnd(state)
    expect(next.cs).toBe(state.cs - 3) // 基本1 × D重み3
  })

  it('qcdWeightMode=add なら重みは加算される', () => {
    const base = newGame(42, { clientId: 'cl-marunage', config: { qcdWeightMode: 'add' } })
    const state = qualityOk(withResolved(base, 3))
    const next = processPhaseEnd(state)
    expect(next.cs).toBe(state.cs - (1 + 3)) // 基本1 + D重み3
  })
})

describe('フェーズ終了:品質(Q)判定(RULES.md §2-4)', () => {
  it('Lv2 成果物が基準に達していれば CS は減らない', () => {
    const state = withLv2Deliverables(withResolved(newGame(), 5), 1, ['a'])
    const next = processPhaseEnd(state)
    expect(next.cs).toBe(state.cs)
    expect(next.lastPhaseSummary!.qualityMet).toBe(true)
  })

  it('基準未達なら CS が Q 重みぶん減る(品質重視クライアント)', () => {
    const state = withResolved(newGame(), 5) // Lv2 成果物 0 個。cl-komakai: q=3
    const next = processPhaseEnd(state)
    expect(next.cs).toBe(state.cs - 3)
    expect(next.lastPhaseSummary!.qualityMet).toBe(false)
  })
})

describe('フェーズ終了:疲労回復とトークン処理(RULES.md §2-4, §4)', () => {
  it('全員の疲労が 1 回復する', () => {
    let state = qualityOk(withResolved(newGame(), 5))
    state = withPlayer(state, 'a', { fatigue: 2 })
    const next = processPhaseEnd(state)
    expect(next.players.find((p) => p.id === 'a')!.fatigue).toBe(1)
    expect(next.players.find((p) => p.id === 'b')!.fatigue).toBe(0) // 0未満にならない
  })

  it('解決済みタスクはエリアから除去され、未解決タスクのトークンは持ち越される', () => {
    let state = qualityOk(withResolved(newGame(), 4))
    const unresolvedId = state.taskArea[4]!.tileId
    state = {
      ...state,
      taskArea: state.taskArea.map((t, i) => (i === 4 ? { ...t, tokens: { a: 2 } } : t)),
    }
    const next = processPhaseEnd(state)
    expect(next.taskArea).toHaveLength(1)
    expect(next.taskArea[0]!.tileId).toBe(unresolvedId)
    expect(next.taskArea[0]!.tokens).toEqual({ a: 2 }) // carryOverTokens: true
  })

  it('carryOverTokens=false なら未解決タスクのトークンは失われる', () => {
    let state = qualityOk(withResolved(newGame(42, { config: { carryOverTokens: false } }), 4))
    state = {
      ...state,
      taskArea: state.taskArea.map((t, i) => (i === 4 ? { ...t, tokens: { a: 2 } } : t)),
    }
    const next = processPhaseEnd(state)
    expect(next.taskArea[0]!.tokens).toEqual({})
  })
})

describe('疲労システム:Lv3 → 限界イベント → Lv2 復帰(RULES.md §4)', () => {
  function reachLv3(limitPile: string[]): GameState {
    let state = newGame()
    // a の疲労を2にして、疲労+1 のタスク(p1-hearing)を実行させる
    state = withPlayer(state, 'a', { fatigue: 2 })
    state = {
      ...state,
      decks: { ...state.decks, limitEvents: { drawPile: limitPile, discardPile: [] } },
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
    return state
  }

  it('疲労 Lv3 到達で即座に限界イベントが発生する', () => {
    const state = reachLv3(['lm-nothing'])
    expect(state.players.find((p) => p.id === 'a')!.fatigue).toBe(3)
    expect(state.pendingEvent).toMatchObject({ kind: 'limit', targetPlayerId: 'a' })
  })

  it('「何も起きない」でも解決後に Lv2 へ戻る', () => {
    const state = reachLv3(['lm-nothing'])
    const next = apply(state, { type: 'RESOLVE_EVENT' })
    expect(next.players.find((p) => p.id === 'a')!.fatigue).toBe(2)
    expect(next.pendingEvent).toBeNull()
  })

  it('トークンペナルティの限界イベントは次フェーズの補充を減らす', () => {
    const state = reachLv3(['lm-sick']) // 次フェーズ補充 -1
    const next = apply(state, { type: 'RESOLVE_EVENT' })
    const player = next.players.find((p) => p.id === 'a')!
    expect(player.fatigue).toBe(2)
    expect(player.nextPhaseTokenPenalty).toBe(1)
  })
})

describe('フェーズ進行と補充(RULES.md §2-1)', () => {
  it('ADVANCE_PHASE で次フェーズのタスクが公開され、イベント解決後にトークンが補充される', () => {
    let state = qualityOk(withResolved(newGame(), 5))
    state = processPhaseEnd(state)
    expect(state.step).toBe('phase_end')
    state = apply(state, { type: 'ADVANCE_PHASE' })
    expect(state.phase).toBe(2)
    expect(state.step).toBe('planning')
    expect(state.taskArea).toHaveLength(5) // フェーズ2の5枚
    expect(state.pendingEvent?.kind).toBe('phase_start')

    const tokensBefore = state.players.map((p) => p.tokens)
    // 補充を決定的にするため、無害なイベントに差し替える
    state = {
      ...state,
      pendingEvent: { kind: 'phase_start', cardId: 'ev-smooth-week', targetPlayerId: null },
    }
    state = apply(state, { type: 'RESOLVE_EVENT' })
    state.players.forEach((p, i) => {
      expect(p.tokens).toBe(tokensBefore[i]! + state.config.tokensPerPhase)
    })
  })

  it('疲労 Lv2 のプレイヤーは補充が -1 される', () => {
    let state = qualityOk(withResolved(newGame(), 5))
    state = withPlayer(state, 'a', { fatigue: 3 }) // 自然回復後に Lv2 になる
    state = processPhaseEnd(state)
    expect(state.players.find((p) => p.id === 'a')!.fatigue).toBe(2)
    state = apply(state, { type: 'ADVANCE_PHASE' })
    const tokensBefore = state.players.find((p) => p.id === 'a')!.tokens
    state = {
      ...state,
      pendingEvent: { kind: 'phase_start', cardId: 'ev-smooth-week', targetPlayerId: null },
    }
    state = apply(state, { type: 'RESOLVE_EVENT' })
    expect(state.players.find((p) => p.id === 'a')!.tokens).toBe(
      tokensBefore + state.config.tokensPerPhase - state.config.fatigueLv2TokenPenalty,
    )
  })
})

describe('勝敗判定(RULES.md §1)', () => {
  it('CS が 0 未満になった時点で即時敗北する(csInstantLose=true)', () => {
    let state = withResolved(newGame(), 3) // 未解決2 → D未達 -1、Q未達 -3
    state = { ...state, cs: 3 } // 合計 -4 で 0 未満になる
    const next = processPhaseEnd(state)
    expect(next.step).toBe('finished')
    expect(next.result?.outcome).toBe('lose')
    expect(Object.values(next.result!.personalResults).every((v) => v === false)).toBe(true)
  })

  it('csInstantLose=false なら CS がマイナスでもゲームは続く', () => {
    let state = withResolved(newGame(42, { config: { csInstantLose: false } }), 3)
    state = { ...state, cs: 3 }
    const next = processPhaseEnd(state)
    expect(next.step).toBe('phase_end')
    expect(next.cs).toBeLessThan(0)
    expect(next.result).toBeNull()
  })

  it('最終フェーズ終了時に CS ≥ 0 ならチーム勝利し、個人目標が評価される', () => {
    let state = qualityOk(withResolved(newGame(), 5))
    state = { ...state, phase: 4 }
    state = withPlayer(state, 'a', { personalGoalId: 'pg-balance', fatigue: 1 }) // 回復後 Lv0
    state = withPlayer(state, 'b', { personalGoalId: 'pg-learner' }) // 成長なし → 未達
    state = processPhaseEnd(state)
    const next = apply(state, { type: 'ADVANCE_PHASE' })
    expect(next.step).toBe('finished')
    expect(next.result?.outcome).toBe('win')
    expect(next.result?.personalResults['a']).toBe(true)
    expect(next.result?.personalResults['b']).toBe(false)
  })

  it('最終フェーズ終了時に CS < 0 なら敗北し、個人目標は評価されない(csInstantLose=false)', () => {
    let state = qualityOk(withResolved(newGame(42, { config: { csInstantLose: false } }), 5))
    state = { ...state, phase: 4, cs: -1 }
    state = withPlayer(state, 'a', { personalGoalId: 'pg-balance', fatigue: 0 })
    state = processPhaseEnd(state)
    const next = apply(state, { type: 'ADVANCE_PHASE' })
    expect(next.result?.outcome).toBe('lose')
    expect(next.result?.personalResults['a']).toBe(false)
  })
})

describe('個人目標の達成条件', () => {
  it('LV2_DELIVERABLES_AT_LEAST:自分が参加した Lv2 成果物の数で判定', () => {
    let state = newGame()
    state = withPlayer(state, 'c', { personalGoalId: 'pg-quality' })
    state = withLv2Deliverables(state, 3, ['c', 'd'])
    expect(evaluatePersonalGoal(state, state.players.find((p) => p.id === 'c')!)).toBe(true)
    expect(
      evaluatePersonalGoal(
        withLv2Deliverables(state, 2, ['c']),
        state.players.find((p) => p.id === 'c')!,
      ),
    ).toBe(false)
  })

  it('SKILL_GROWTH_AT_LEAST:初期値からの成長量で判定', () => {
    let state = newGame()
    state = withPlayer(state, 'c', {
      personalGoalId: 'pg-learner',
      skills: { direction: 1, design: 3, engineering: 0 }, // 初期合計2 → 現在4
    })
    expect(evaluatePersonalGoal(state, state.players.find((p) => p.id === 'c')!)).toBe(true)
  })

  it('BUDGET_RATIO_AT_LEAST:終了時予算の初期予算比で判定', () => {
    let state = newGame()
    state = withPlayer(state, 'a', { personalGoalId: 'pg-cost-keeper' })
    const player = state.players.find((p) => p.id === 'a')!
    expect(evaluatePersonalGoal({ ...state, budget: 6 }, player)).toBe(true) // 18×0.3=5.4
    expect(evaluatePersonalGoal({ ...state, budget: 5 }, player)).toBe(false)
  })
})
