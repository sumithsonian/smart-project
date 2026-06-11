import { describe, it, expect } from 'vitest'
import type { GameAction, GameState, TaskInstance } from '../src/types'
import { isRuleViolation } from '../src/types'
import { applyAction } from '../src/applyAction'
import { createInitialState } from '../src/initialState'
import { replay } from '../src/replay'
import { PLAYERS } from './util'

/**
 * v2.1 ルール(炎上 + EP + マイルストーン + 目標選択)での通しプレイ検証。
 * 自動プレイヤーは消火もしながら、終局(勝敗判定 or 即時敗北)まで到達できること。
 */
function playFullGameV2(seed: number): { state: GameState; actions: GameAction[] } {
  let state = createInitialState()
  const actions: GameAction[] = []

  const act = (action: GameAction): void => {
    const next = applyAction(state, action)
    if (isRuleViolation(next)) {
      throw new Error(`ボットが違反: ${next.code}: ${next.message}(${action.type})`)
    }
    state = next
    actions.push(action)
  }

  /** 解決待ち(大炎上 → イベント → 要件カード)をすべて処理する */
  const drain = (): void => {
    let guard = 0
    while (guard++ < 100) {
      if (state.result !== null) return
      if (state.pendingEpidemicCount > 0) {
        const pm = state.players.find((p) => p.role === 'pm')!
        // 🔥が一番多い未解決タスクに重ねる(延焼ドラマを起こしやすく)
        const target = [...state.taskArea]
          .filter((t) => !t.resolved)
          .sort((a, b) => b.fire - a.fire)[0]!
        act({ type: 'SELECT_EPIDEMIC_TARGET', playerId: pm.id, taskTileId: target.tileId })
        continue
      }
      if (state.pendingEvent !== null) {
        act({ type: 'RESOLVE_EVENT' })
        continue
      }
      if (state.pendingRequirementChoice !== null) {
        act({ type: 'SELECT_REQUIREMENT_CARD', choiceIndex: 0 })
        continue
      }
      return
    }
  }

  const topoOrder = (tasks: TaskInstance[]): string[] => {
    const indexOf = (id: string) => state.content.tasks.findIndex((t) => t.id === id)
    return tasks
      .map((t) => t.tileId)
      .sort((a, b) => indexOf(a) - indexOf(b))
      .sort((a, b) => {
        const ta = state.content.tasks.find((t) => t.id === a)!
        const tb = state.content.tasks.find((t) => t.id === b)!
        return ta.phase - tb.phase
      })
  }

  /** プランニング:休憩 → 消火(🔥2個以上のタスク) → 配置 */
  const plan = (): void => {
    for (const p of state.players) {
      if (p.fatigue >= 2 && p.tokens > 0) act({ type: 'REST', playerId: p.id })
    }
    if (state.budget <= 3 && state.cs >= 3) {
      const payer = state.players.find((p) => p.tokens > 0)
      if (payer) act({ type: 'EXTRA_BILLING', playerId: payer.id })
    }
    // 延焼間際(閾値-1)のタスクを優先消火
    for (const t of state.taskArea.filter((x) => !x.resolved && x.fire >= 2)) {
      const fighter = state.players.find((p) => p.tokens > 1)
      if (!fighter) break
      act({ type: 'EXTINGUISH_FIRE', playerId: fighter.id, taskTileId: t.tileId })
    }
    for (const tileId of topoOrder(state.taskArea.filter((t) => !t.resolved))) {
      const tile = state.content.tasks.find((t) => t.id === tileId)!
      const required = () => {
        const cur = state.taskArea.find((t) => t.tileId === tileId)!
        return tile.requiredTokens + cur.fire
      }
      const placed = () => {
        const cur = state.taskArea.find((t) => t.tileId === tileId)!
        return Object.values(cur.tokens).reduce((a, b) => a + b, 0)
      }
      const placersOn = () => {
        const cur = state.taskArea.find((t) => t.tileId === tileId)!
        return Object.entries(cur.tokens).filter(([, c]) => c > 0).length
      }
      const fitters = state.players.filter(
        (p) =>
          !tile.skillRequirement ||
          p.skills[tile.skillRequirement.skill] >= tile.skillRequirement.level,
      )
      if (fitters.length === 0) continue
      const lead = fitters.find((p) => p.tokens > 0)
      if (!lead) continue
      const cur = state.taskArea.find((t) => t.tileId === tileId)!
      if (placed() < required() && (cur.tokens[lead.id] ?? 0) === 0) {
        act({ type: 'PLACE_TOKEN', playerId: lead.id, target: { kind: 'task', taskTileId: tileId } })
      }
      let guard = 0
      while (placed() < required() && guard++ < 25) {
        const now = state.taskArea.find((t) => t.tileId === tileId)!
        const needSecond = tile.collaboration && placersOn() < 2
        const candidates = [...state.players]
          .filter((p) => p.tokens > 0 && (!needSecond || (now.tokens[p.id] ?? 0) === 0))
          .sort((a, b) => b.tokens - a.tokens)
        const giver = candidates[0]
        if (!giver) break
        act({ type: 'PLACE_TOKEN', playerId: giver.id, target: { kind: 'task', taskTileId: tileId } })
      }
    }
    for (const p of state.players) act({ type: 'DECLARE_READY', playerId: p.id })
  }

  // ── ゲーム開始(v2.1 デフォルト設定)──
  act({
    type: 'SETUP_GAME',
    seed,
    players: PLAYERS,
    clientId: 'cl-komakai',
    projectCardId: 'pj-corporate',
    projectSheetId: 'ps-standard',
  })
  // 個人目標の選択
  while (state.step === 'goal_selection') {
    const pending = state.players.find((p) => p.personalGoalId === '')!
    act({ type: 'SELECT_PERSONAL_GOAL', playerId: pending.id, choiceIndex: 0 })
  }
  drain()

  let guard = 0
  while (state.result === null && guard++ < 1500) {
    if (state.step === 'planning') {
      plan()
    } else if (state.step === 'execution' && state.resolutionQueue === null) {
      const pm = state.players.find((p) => p.role === 'pm')!
      act({
        type: 'DECLARE_TASK_ORDER',
        playerId: pm.id,
        order: topoOrder(state.taskArea.filter((t) => !t.resolved)),
      })
    } else if (state.step === 'execution') {
      act({ type: 'RESOLVE_NEXT_TASK' })
    } else if (state.step === 'phase_end') {
      act({ type: 'ADVANCE_PHASE' })
    } else {
      throw new Error(`想定外のステップ: ${state.step}`)
    }
    drain()
  }

  return { state, actions }
}

describe('v2.1 通しプレイ(炎上 + EP + マイルストーン)', () => {
  it('終局(勝敗判定)まで到達できる', () => {
    const { state } = playFullGameV2(42)
    expect(state.step).toBe('finished')
    expect(state.result).not.toBeNull()
    expect(Object.keys(state.result!.personalResults)).toHaveLength(4)
  })

  it('アクションログのリプレイで同じ最終状態が再現できる', () => {
    const { state, actions } = playFullGameV2(42)
    const serialized = JSON.parse(JSON.stringify(actions)) as GameAction[]
    expect(replay(serialized)).toEqual(state)
  })

  it('複数シードでクラッシュせず終局する(炎上の乱数経路を含む)', () => {
    for (const seed of [1, 7, 99, 555, 2026]) {
      const { state } = playFullGameV2(seed)
      expect(state.step).toBe('finished')
    }
  })
})
