import { describe, it, expect } from 'vitest'
import type { GameState } from '../src/types'
import { isRuleViolation } from '../src/types'
import { applyAction } from '../src/applyAction'
import { addFire, continueFireDraws } from '../src/actions/fire'
import { apply, must, newGame, newGameV2 } from './util'

/** タスクに🔥を直接セットする(局面の捏造) */
function withFire(state: GameState, tileId: string, fire: number): GameState {
  return {
    ...state,
    taskArea: state.taskArea.map((t) => (t.tileId === tileId ? { ...t, fire } : t)),
  }
}

function fireOf(state: GameState, tileId: string): number {
  return state.taskArea.find((t) => t.tileId === tileId)!.fire
}

describe('炎上システム:🔥の付与と延焼(RULES.md §10)', () => {
  it('🔥が1個置かれ、ログに記録される', () => {
    const state = newGame()
    const next = addFire(state, 'p1-hearing', new Set())
    expect(fireOf(next, 'p1-hearing')).toBe(1)
    expect(next.fireLog.at(-1)).toContain('キックオフヒアリング')
  })

  it('閾値到達で延焼:🔥は置かれず、子タスクに飛び火して CS が減る', () => {
    // p1-hearing の子は p1-requirements と p1-sitemap
    const state = withFire(newGame(), 'p1-hearing', 3) // 閾値4の手前
    const next = addFire(state, 'p1-hearing', new Set())
    expect(fireOf(next, 'p1-hearing')).toBe(3) // 増えない
    expect(fireOf(next, 'p1-requirements')).toBe(1)
    expect(fireOf(next, 'p1-sitemap')).toBe(1)
    expect(next.cs).toBe(state.cs - 1)
  })

  it('連鎖延焼:子も閾値なら連鎖し、同一連鎖内で同じタスクは延焼しない', () => {
    let state = withFire(newGame(), 'p1-hearing', 3)
    state = withFire(state, 'p1-requirements', 3)
    const next = addFire(state, 'p1-hearing', new Set())
    expect(next.cs).toBe(state.cs - 2) // hearing と requirements の延焼
    // requirements の子(estimate)に飛び火している
    expect(fireOf(next, 'p1-estimate')).toBe(1)
  })

  it('子がいないタスクの延焼は同フェーズの未解決タスクへ飛び火する', () => {
    // p1-estimate は子を持たない
    const state = withFire(newGame(), 'p1-estimate', 3)
    const next = addFire(state, 'p1-estimate', new Set())
    expect(next.cs).toBe(state.cs - 1)
    const others = next.taskArea.filter((t) => t.tileId !== 'p1-estimate')
    expect(others.every((t) => t.fire === 1)).toBe(true)
  })
})

describe('炎上システム:必要トークンの増加', () => {
  it('🔥1個につき必要トークンが +1 される(不足なら未解決)', () => {
    // p1-hearing は基本2個。🔥1個で3個必要になる
    let state = withFire(newGame(), 'p1-hearing', 1)
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
    expect(state.taskArea.find((t) => t.tileId === 'p1-hearing')!.resolved).toBe(false)
    expect(state.resolutionLog.at(-1)!.failReason).toBe('NOT_ENOUGH_TOKENS')
    expect(state.resolutionLog.at(-1)!.message).toContain('🔥')
  })
})

describe('炎上システム:消火', () => {
  it('トークンを支払って🔥を1個除去できる(消火回数と消火者を記録)', () => {
    const state = withFire(newGame(), 'p1-hearing', 2)
    const next = apply(state, { type: 'EXTINGUISH_FIRE', playerId: 'b', taskTileId: 'p1-hearing' })
    expect(fireOf(next, 'p1-hearing')).toBe(1)
    const player = next.players.find((p) => p.id === 'b')!
    expect(player.tokens).toBe(state.players.find((p) => p.id === 'b')!.tokens - 1)
    expect(player.extinguishCount).toBe(1)
    expect(next.taskArea.find((t) => t.tileId === 'p1-hearing')!.extinguisherIds).toEqual(['b'])
  })

  it('🔥がないタスクは消火できない', () => {
    const result = applyAction(newGame(), {
      type: 'EXTINGUISH_FIRE',
      playerId: 'b',
      taskTileId: 'p1-hearing',
    })
    expect(isRuleViolation(result) && result.code).toBe('NO_FIRE')
  })
})

describe('炎上システム:大炎上(エピデミック)', () => {
  /** 炎上ドローを仕込んだ状態を作る */
  function withFireDraws(state: GameState, drawPile: string[], discardPile: string[]): GameState {
    return {
      ...state,
      decks: { ...state.decks, fires: { drawPile, discardPile } },
      remainingFireDraws: 2,
      phaseStartReplenish: null,
    }
  }

  it('大炎上で捨て札が山に戻り、PM のターゲット選択待ちになる', () => {
    const state = withFireDraws(newGame(), ['epidemic-1', 'p1-hearing'], ['p1-research'])
    const next = continueFireDraws(state)
    expect(next.pendingEpidemicCount).toBe(1)
    expect(next.remainingFireDraws).toBe(1) // 残り1枚はターゲット選択後に引かれる
    // 捨て札がリシャッフルされて山に戻っている
    expect(next.decks.fires.discardPile).toEqual([])
    expect(next.decks.fires.drawPile).toContain('p1-research')
  })

  it('PM がターゲットを選ぶと🔥2個 + 残りのドローが続行される', () => {
    const state = withFireDraws(newGame(), ['epidemic-1'], [])
    const mid = continueFireDraws(state)
    const next = must(
      applyAction(mid, { type: 'SELECT_EPIDEMIC_TARGET', playerId: 'a', taskTileId: 'p1-sitemap' }),
    )
    expect(fireOf(next, 'p1-sitemap')).toBe(2)
    expect(next.pendingEpidemicCount).toBe(0)
    expect(next.remainingFireDraws).toBe(0)
  })

  it('PM 以外はターゲットを選べない', () => {
    const state = withFireDraws(newGame(), ['epidemic-1'], [])
    const mid = continueFireDraws(state)
    const result = applyAction(mid, {
      type: 'SELECT_EPIDEMIC_TARGET',
      playerId: 'b',
      taskTileId: 'p1-sitemap',
    })
    expect(isRuleViolation(result) && result.code).toBe('NOT_PM')
  })

  it('ターゲット選択待ちの間は配置できない', () => {
    const state = withFireDraws(newGame(), ['epidemic-1'], [])
    const mid = continueFireDraws(state)
    const result = applyAction(mid, {
      type: 'PLACE_TOKEN',
      playerId: 'a',
      target: { kind: 'task', taskTileId: 'p1-hearing' },
    })
    expect(isRuleViolation(result) && result.code).toBe('FIRE_PHASE_ACTIVE')
  })
})

describe('炎上システム:フェーズ開始フロー(v2.1 デフォルト設定)', () => {
  it('セットアップ → 目標選択 → 炎上ドロー → イベントの順で進む', () => {
    const state = newGameV2()
    expect(state.step).toBe('planning')
    expect(state.remainingFireDraws).toBe(0)
    expect(state.pendingEpidemicCount).toBe(0)
    expect(state.pendingEvent).toBeNull()
    // firePerPhase=2 のドローが行われ、ログが残っている
    expect(state.fireLog.length).toBeGreaterThanOrEqual(2)
  })

  it('未解決タスクの🔥は次フェーズに持ち越される', () => {
    let state = newGameV2()
    // 全タスク未解決のままフェーズを終わらせる
    state = withFire(state, 'p1-hearing', 2)
    for (const p of state.players) {
      state = apply(state, { type: 'DECLARE_READY', playerId: p.id })
    }
    state = apply(state, {
      type: 'DECLARE_TASK_ORDER',
      playerId: 'a',
      order: state.taskArea.filter((t) => !t.resolved).map((t) => t.tileId),
    })
    for (let i = 0; i < 5; i++) {
      state = apply(state, { type: 'RESOLVE_NEXT_TASK' })
    }
    expect(state.step).toBe('phase_end')
    const hearingFire = fireOf(state, 'p1-hearing')
    expect(hearingFire).toBeGreaterThanOrEqual(2) // 持ち越し(さらに燃えている可能性あり)
  })
})
