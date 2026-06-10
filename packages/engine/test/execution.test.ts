import { describe, it, expect } from 'vitest'
import type { GameAction, GameState } from '../src/types'
import { isRuleViolation } from '../src/types'
import { applyAction } from '../src/applyAction'
import { apply, newGame } from './util'

/** 指定の配置を行い、全員 Ready で実行ステップに入った状態を作る */
function toExecution(
  state: GameState,
  placements: Array<{ playerId: string; taskTileId: string; count: number }>,
): GameState {
  const actions: GameAction[] = []
  for (const p of placements) {
    for (let i = 0; i < p.count; i++) {
      actions.push({
        type: 'PLACE_TOKEN',
        playerId: p.playerId,
        target: { kind: 'task', taskTileId: p.taskTileId },
      })
    }
  }
  for (const player of state.players) {
    actions.push({ type: 'DECLARE_READY', playerId: player.id })
  }
  return apply(state, ...actions)
}

/** フェーズ1の依存順を満たす処理順 */
const VALID_ORDER = ['p1-hearing', 'p1-requirements', 'p1-sitemap', 'p1-research', 'p1-estimate']

describe('実行ステップ:タスク処理順の宣言(RULES.md §2-3)', () => {
  it('PM 以外は処理順を宣言できない', () => {
    const state = toExecution(newGame(), [])
    const result = applyAction(state, { type: 'DECLARE_TASK_ORDER', playerId: 'b', order: VALID_ORDER })
    expect(isRuleViolation(result) && result.code).toBe('NOT_PM')
  })

  it('依存順違反の処理順は拒否される(子が未解決の親より先)', () => {
    const state = toExecution(newGame(), [])
    const result = applyAction(state, {
      type: 'DECLARE_TASK_ORDER',
      playerId: 'a',
      order: ['p1-requirements', 'p1-hearing', 'p1-sitemap', 'p1-research', 'p1-estimate'],
    })
    expect(isRuleViolation(result) && result.code).toBe('INVALID_TASK_ORDER')
  })

  it('未解決タスクの過不足がある処理順は拒否される', () => {
    const state = toExecution(newGame(), [])
    const result = applyAction(state, {
      type: 'DECLARE_TASK_ORDER',
      playerId: 'a',
      order: VALID_ORDER.slice(0, 3),
    })
    expect(isRuleViolation(result) && result.code).toBe('INVALID_TASK_ORDER')
  })

  it('処理順の宣言前にタスクは解決できない', () => {
    const state = toExecution(newGame(), [])
    const result = applyAction(state, { type: 'RESOLVE_NEXT_TASK' })
    expect(isRuleViolation(result) && result.code).toBe('ORDER_NOT_DECLARED')
  })
})

describe('実行ステップ:タスク解決の8手順', () => {
  it('トークン充足 + スキル充足で解決され、コスト支払い・成果物・疲労加算が行われる', () => {
    let state = toExecution(newGame(), [{ playerId: 'a', taskTileId: 'p1-hearing', count: 2 }])
    state = apply(state, { type: 'DECLARE_TASK_ORDER', playerId: 'a', order: VALID_ORDER })
    const budgetBefore = state.budget
    state = apply(state, { type: 'RESOLVE_NEXT_TASK' })

    const task = state.taskArea.find((t) => t.tileId === 'p1-hearing')!
    expect(task.resolved).toBe(true)
    expect(state.budget).toBe(budgetBefore - 1) // 実行コスト1
    expect(state.deliverables).toHaveLength(1) // Lv1 ×1
    expect(state.deliverables[0]!.participants).toEqual(['a'])
    expect(state.players.find((p) => p.id === 'a')!.fatigue).toBe(1) // 実行時疲労 +1
  })

  it('トークン不足のタスクは未解決のまま残る', () => {
    let state = toExecution(newGame(), [{ playerId: 'a', taskTileId: 'p1-hearing', count: 1 }])
    state = apply(
      state,
      { type: 'DECLARE_TASK_ORDER', playerId: 'a', order: VALID_ORDER },
      { type: 'RESOLVE_NEXT_TASK' },
    )
    expect(state.taskArea.find((t) => t.tileId === 'p1-hearing')!.resolved).toBe(false)
    expect(state.resolutionLog.at(-1)!.failReason).toBe('NOT_ENOUGH_TOKENS')
    // トークンは盤上に残る(持ち越し)
    expect(state.taskArea.find((t) => t.tileId === 'p1-hearing')!.tokens['a']).toBe(1)
  })

  it('スキル条件を満たす参加者がいないと未解決になる', () => {
    // p1-requirements は direction Lv2 が必要。b(director)は Lv1
    let state = newGame()
    state = toExecution(state, [
      { playerId: 'b', taskTileId: 'p1-hearing', count: 2 },
      { playerId: 'b', taskTileId: 'p1-requirements', count: 3 },
    ])
    state = apply(
      state,
      { type: 'DECLARE_TASK_ORDER', playerId: 'a', order: VALID_ORDER },
      { type: 'RESOLVE_NEXT_TASK' }, // hearing 解決(direction Lv1 でOK)
      { type: 'RESOLVE_NEXT_TASK' }, // requirements → スキル不足
    )
    // 秘匿要件の選択が出た場合は選んでから判定される
    if (state.pendingRequirementChoice) {
      state = apply(state, { type: 'SELECT_REQUIREMENT_CARD', choiceIndex: 0 })
    }
    expect(state.taskArea.find((t) => t.tileId === 'p1-requirements')!.resolved).toBe(false)
    expect(state.resolutionLog.at(-1)!.failReason).toBe('SKILL_NOT_MET')
  })

  it('未解決の親を持つタスクは実行できない(依存の強制)', () => {
    // hearing にトークンを置かず requirements に置く → 順番は守られるが親が失敗
    let state = toExecution(newGame(), [{ playerId: 'a', taskTileId: 'p1-requirements', count: 3 }])
    state = apply(
      state,
      { type: 'DECLARE_TASK_ORDER', playerId: 'a', order: VALID_ORDER },
      { type: 'RESOLVE_NEXT_TASK' }, // hearing: トークン不足で未解決
      { type: 'RESOLVE_NEXT_TASK' }, // requirements: 親未解決
    )
    expect(state.resolutionLog.at(-1)!.failReason).toBe('DEPENDENCY_UNRESOLVED')
  })

  it('協業タスクは1人のトークンだけでは実行できない', () => {
    // 親(hearing→requirements)を解決した上で、estimate に b のトークンだけを置く
    let state = toExecution(newGame(), [
      { playerId: 'a', taskTileId: 'p1-hearing', count: 2 },
      { playerId: 'a', taskTileId: 'p1-requirements', count: 3 },
      { playerId: 'b', taskTileId: 'p1-estimate', count: 3 },
    ])
    state = {
      ...state,
      decks: {
        ...state.decks,
        requirements: { drawPile: ['rq-as-spec', 'rq-license'], discardPile: [] },
      },
    }
    const step = (action: GameAction): void => {
      state = apply(state, action)
      while (state.pendingEvent) state = apply(state, { type: 'RESOLVE_EVENT' })
    }
    step({ type: 'DECLARE_TASK_ORDER', playerId: 'a', order: VALID_ORDER })
    step({ type: 'RESOLVE_NEXT_TASK' }) // hearing
    step({ type: 'RESOLVE_NEXT_TASK' }) // requirements → 要件カード選択
    step({ type: 'SELECT_REQUIREMENT_CARD', choiceIndex: 0 }) // 効果なし → 解決
    step({ type: 'RESOLVE_NEXT_TASK' }) // sitemap(トークンなし→未解決)
    step({ type: 'RESOLVE_NEXT_TASK' }) // research(トークンなし→未解決)
    step({ type: 'RESOLVE_NEXT_TASK' }) // estimate(b 1人だけ)
    const entry = state.resolutionLog.find((e) => e.tileId === 'p1-estimate')!
    expect(entry.failReason).toBe('COLLABORATION_REQUIRED')
  })

  it('予算不足のタスクは未解決になる', () => {
    let state = toExecution(newGame(), [{ playerId: 'a', taskTileId: 'p1-hearing', count: 2 }])
    state = { ...state, budget: 0 }
    state = apply(
      state,
      { type: 'DECLARE_TASK_ORDER', playerId: 'a', order: VALID_ORDER },
      { type: 'RESOLVE_NEXT_TASK' },
    )
    expect(state.resolutionLog.at(-1)!.failReason).toBe('BUDGET_SHORT')
  })
})

describe('実行ステップ:秘匿要件(要件カード)', () => {
  /** 要件カードの山札を固定して、選択フローを決定的にテストする */
  function withRequirementsPile(state: GameState, pile: string[]): GameState {
    return {
      ...state,
      decks: { ...state.decks, requirements: { drawPile: pile, discardPile: [] } },
    }
  }

  function setupForRequirements(): GameState {
    let state = newGame()
    state = toExecution(state, [
      { playerId: 'a', taskTileId: 'p1-hearing', count: 2 },
      { playerId: 'a', taskTileId: 'p1-requirements', count: 3 },
    ])
    state = withRequirementsPile(state, ['rq-license', 'rq-as-spec'])
    return apply(
      state,
      { type: 'DECLARE_TASK_ORDER', playerId: 'a', order: VALID_ORDER },
      { type: 'RESOLVE_NEXT_TASK' }, // hearing
      { type: 'RESOLVE_NEXT_TASK' }, // requirements → 要件カード選択待ち
    )
  }

  it('秘匿要件タスクは2枚引いて選択待ちになる', () => {
    const state = setupForRequirements()
    expect(state.pendingRequirementChoice).toEqual({
      taskTileId: 'p1-requirements',
      optionIds: ['rq-license', 'rq-as-spec'],
    })
    // 選択前は次のタスクへ進めない
    const result = applyAction(state, { type: 'RESOLVE_NEXT_TASK' })
    expect(isRuleViolation(result) && result.code).toBe('PENDING_REQUIREMENT')
  })

  it('追加コストの要件カードを選ぶと、コストが増えて解決される', () => {
    const state = setupForRequirements()
    const budgetBefore = state.budget
    const next = apply(state, { type: 'SELECT_REQUIREMENT_CARD', choiceIndex: 0 }) // rq-license: コスト+1
    const task = next.taskArea.find((t) => t.tileId === 'p1-requirements')!
    expect(task.resolved).toBe(true)
    expect(task.appliedRequirementId).toBe('rq-license')
    expect(next.budget).toBe(budgetBefore - (2 + 1)) // 基本コスト2 + 追加1
    // 選ばれなかったカードは捨て札へ
    expect(next.decks.requirements.discardPile).toContain('rq-as-spec')
  })

  it('効果なしの要件カードを選ぶと、基本コストのまま解決される', () => {
    const state = setupForRequirements()
    const budgetBefore = state.budget
    const next = apply(state, { type: 'SELECT_REQUIREMENT_CARD', choiceIndex: 1 }) // rq-as-spec: 効果なし
    expect(next.taskArea.find((t) => t.tileId === 'p1-requirements')!.resolved).toBe(true)
    expect(next.budget).toBe(budgetBefore - 2)
  })
})

describe('実行ステップ:イベントマークと完了遷移', () => {
  it('イベントマーク付きタスクの解決でイベントが発生する', () => {
    let state = toExecution(newGame(), [{ playerId: 'a', taskTileId: 'p1-research', count: 2 }])
    state = apply(
      state,
      {
        type: 'DECLARE_TASK_ORDER',
        playerId: 'a',
        order: ['p1-research', 'p1-hearing', 'p1-requirements', 'p1-sitemap', 'p1-estimate'],
      },
      { type: 'RESOLVE_NEXT_TASK' },
    )
    expect(state.taskArea.find((t) => t.tileId === 'p1-research')!.resolved).toBe(true)
    expect(state.pendingEvent?.kind).toBe('task')
  })

  it('全タスクの処理が終わるとフェーズ終了ステップへ遷移する', () => {
    let state = toExecution(newGame(), [{ playerId: 'a', taskTileId: 'p1-hearing', count: 2 }])
    state = apply(state, { type: 'DECLARE_TASK_ORDER', playerId: 'a', order: VALID_ORDER })
    for (let i = 0; i < 5; i++) {
      state = apply(state, { type: 'RESOLVE_NEXT_TASK' })
      while (state.pendingEvent) state = apply(state, { type: 'RESOLVE_EVENT' })
      if (state.pendingRequirementChoice) {
        state = apply(state, { type: 'SELECT_REQUIREMENT_CARD', choiceIndex: 0 })
      }
    }
    expect(state.step).toBe('phase_end')
  })

  it('特殊効果:次タスクコスト減が適用される', () => {
    // p1-sitemap(特殊効果: 次タスクコスト-1)→ 直後の p1-research(コスト1)が0になる
    let state = toExecution(newGame(), [
      { playerId: 'a', taskTileId: 'p1-sitemap', count: 2 },
      { playerId: 'b', taskTileId: 'p1-hearing', count: 2 },
      { playerId: 'c', taskTileId: 'p1-research', count: 2 },
    ])
    state = apply(
      state,
      { type: 'DECLARE_TASK_ORDER', playerId: 'a', order: VALID_ORDER },
      { type: 'RESOLVE_NEXT_TASK' }, // hearing(コスト1)
    )
    const budgetAfterHearing = state.budget
    state = apply(state, { type: 'RESOLVE_NEXT_TASK' }) // requirements: トークンなし→未解決
    state = apply(state, { type: 'RESOLVE_NEXT_TASK' }) // sitemap(コスト1、特殊効果発動)
    expect(state.budget).toBe(budgetAfterHearing - 1)
    expect(state.nextTaskCostModifier).toBe(-1)
    state = apply(state, { type: 'RESOLVE_NEXT_TASK' }) // research(コスト1 → 0)
    expect(state.budget).toBe(budgetAfterHearing - 1)
    expect(state.nextTaskCostModifier).toBe(0)
  })
})
