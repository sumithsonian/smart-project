import { describe, it, expect } from 'vitest'
import { applyAction } from '../src/applyAction'
import { createInitialState } from '../src/initialState'
import { isRuleViolation } from '../src/types'
import { apply, must, newGame, withPlayer, PLAYERS, V1_CONFIG } from './util'

describe('プランニング:トークン配置(RULES.md §2-2)', () => {
  it('タスクにトークンを配置すると、手持ちが減りタスクに積まれる', () => {
    const state = newGame()
    const next = apply(state, {
      type: 'PLACE_TOKEN',
      playerId: 'a',
      target: { kind: 'task', taskTileId: 'p1-hearing' },
    })
    expect(next.players.find((p) => p.id === 'a')!.tokens).toBe(
      state.players.find((p) => p.id === 'a')!.tokens - 1,
    )
    expect(next.taskArea.find((t) => t.tileId === 'p1-hearing')!.tokens['a']).toBe(1)
  })

  it('応援配置:複数プレイヤーのトークンが同じタスクに積み上がる', () => {
    const state = newGame()
    const next = apply(
      state,
      { type: 'PLACE_TOKEN', playerId: 'a', target: { kind: 'task', taskTileId: 'p1-hearing' } },
      { type: 'PLACE_TOKEN', playerId: 'b', target: { kind: 'task', taskTileId: 'p1-hearing' } },
      { type: 'PLACE_TOKEN', playerId: 'b', target: { kind: 'task', taskTileId: 'p1-hearing' } },
    )
    const task = next.taskArea.find((t) => t.tileId === 'p1-hearing')!
    expect(task.tokens).toEqual({ a: 1, b: 2 })
  })

  it('手持ちトークンがないと配置できない', () => {
    const state = withPlayer(newGame(), 'a', { tokens: 0 })
    const result = applyAction(state, {
      type: 'PLACE_TOKEN',
      playerId: 'a',
      target: { kind: 'task', taskTileId: 'p1-hearing' },
    })
    expect(isRuleViolation(result) && result.code).toBe('NOT_ENOUGH_TOKENS')
  })

  it('存在しないタスクへの配置は拒否される', () => {
    const result = applyAction(newGame(), {
      type: 'PLACE_TOKEN',
      playerId: 'a',
      target: { kind: 'task', taskTileId: 'p2-wireframe' }, // フェーズ2のタスクは未公開
    })
    expect(isRuleViolation(result) && result.code).toBe('TASK_NOT_FOUND')
  })

  it('フェーズ開始イベントの解決前は配置できない', () => {
    const state = must(
      applyAction(createInitialState(), {
        type: 'SETUP_GAME',
        seed: 42,
        players: PLAYERS,
        clientId: 'cl-komakai',
        projectCardId: 'pj-corporate',
        config: { ...V1_CONFIG },
      }),
    )
    const result = applyAction(state, {
      type: 'PLACE_TOKEN',
      playerId: 'a',
      target: { kind: 'task', taskTileId: 'p1-hearing' },
    })
    expect(isRuleViolation(result) && result.code).toBe('PENDING_EVENT')
  })
})

describe('プランニング:トークン回収', () => {
  it('自分のトークンをタスクから回収できる', () => {
    const state = newGame()
    const next = apply(
      state,
      { type: 'PLACE_TOKEN', playerId: 'a', target: { kind: 'task', taskTileId: 'p1-hearing' } },
      { type: 'RETRIEVE_TOKEN', playerId: 'a', target: { kind: 'task', taskTileId: 'p1-hearing' } },
    )
    expect(next.players.find((p) => p.id === 'a')!.tokens).toBe(
      state.players.find((p) => p.id === 'a')!.tokens,
    )
    expect(next.taskArea.find((t) => t.tileId === 'p1-hearing')!.tokens['a']).toBe(0)
  })

  it('自分のトークンがない場所からは回収できない', () => {
    const result = applyAction(newGame(), {
      type: 'RETRIEVE_TOKEN',
      playerId: 'a',
      target: { kind: 'task', taskTileId: 'p1-hearing' },
    })
    expect(isRuleViolation(result) && result.code).toBe('NO_TOKEN_TO_RETRIEVE')
  })
})

describe('プランニング:休憩スペース(RULES.md §4)', () => {
  it('トークン1個で疲労が restRecovery ぶん回復する', () => {
    const state = withPlayer(newGame(), 'a', { fatigue: 2 })
    const next = apply(state, { type: 'REST', playerId: 'a' })
    const player = next.players.find((p) => p.id === 'a')!
    expect(player.fatigue).toBe(0)
    expect(player.tokens).toBe(state.players.find((p) => p.id === 'a')!.tokens - 1)
  })

  it('疲労は 0 未満にならない', () => {
    const next = apply(newGame(), { type: 'REST', playerId: 'a' })
    expect(next.players.find((p) => p.id === 'a')!.fatigue).toBe(0)
  })
})

describe('プランニング:追加請求(RULES.md §3)', () => {
  it('CS を払って予算が回復する(C 重み1のクライアント)', () => {
    const state = newGame() // cl-komakai: c=1
    const next = apply(state, { type: 'EXTRA_BILLING', playerId: 'a' })
    expect(next.budget).toBe(state.budget + state.config.extraBillingBudget)
    expect(next.cs).toBe(state.cs - 1)
  })

  it('コスト重視クライアント(C重み3)だと CS コストが重い', () => {
    const state = newGame(42, { clientId: 'cl-genba' })
    const next = apply(state, { type: 'EXTRA_BILLING', playerId: 'a' })
    expect(next.cs).toBe(state.cs - 3) // 1 × C重み3(multiply)
  })
})

describe('プランニング:学習タイル(RULES.md §5)', () => {
  it('現在Lv+1 個のトークンで該当系統が +1Lv される', () => {
    // designer(c)の design は Lv2 → 必要トークン3個
    const state = newGame()
    let next = apply(state, {
      type: 'PLACE_TOKEN',
      playerId: 'c',
      target: { kind: 'learning', skill: 'design' },
    })
    expect(next.players.find((p) => p.id === 'c')!.skills.design).toBe(2) // まだ
    next = apply(
      next,
      { type: 'PLACE_TOKEN', playerId: 'c', target: { kind: 'learning', skill: 'design' } },
      { type: 'PLACE_TOKEN', playerId: 'c', target: { kind: 'learning', skill: 'design' } },
    )
    const player = next.players.find((p) => p.id === 'c')!
    expect(player.skills.design).toBe(3)
    expect(player.learningProgress.design).toBe(0)
  })

  it('上限レベルの系統は学習できない', () => {
    const state = withPlayer(newGame(), 'c', {
      skills: { direction: 0, design: 3, engineering: 0 },
    })
    const result = applyAction(state, {
      type: 'PLACE_TOKEN',
      playerId: 'c',
      target: { kind: 'learning', skill: 'design' },
    })
    expect(isRuleViolation(result) && result.code).toBe('SKILL_MAX')
  })
})

describe('プランニング:Ready 宣言(RULES.md §2-2)', () => {
  it('全員が Ready を宣言すると実行ステップへ遷移する', () => {
    let state = newGame()
    state = apply(
      state,
      { type: 'DECLARE_READY', playerId: 'a' },
      { type: 'DECLARE_READY', playerId: 'b' },
      { type: 'DECLARE_READY', playerId: 'c' },
    )
    expect(state.step).toBe('planning') // まだ3人
    state = apply(state, { type: 'DECLARE_READY', playerId: 'd' })
    expect(state.step).toBe('execution')
  })

  it('二重の Ready 宣言は拒否される', () => {
    const state = apply(newGame(), { type: 'DECLARE_READY', playerId: 'a' })
    const result = applyAction(state, { type: 'DECLARE_READY', playerId: 'a' })
    expect(isRuleViolation(result) && result.code).toBe('ALREADY_READY')
  })

  it('Ready 宣言後はトークンを配置できない', () => {
    const state = apply(newGame(), { type: 'DECLARE_READY', playerId: 'a' })
    const result = applyAction(state, {
      type: 'PLACE_TOKEN',
      playerId: 'a',
      target: { kind: 'task', taskTileId: 'p1-hearing' },
    })
    expect(isRuleViolation(result) && result.code).toBe('ALREADY_READY')
  })
})
