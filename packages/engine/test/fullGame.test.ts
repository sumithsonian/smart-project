import { describe, it, expect } from 'vitest'
import type { GameAction, GameState, TaskInstance } from '../src/types'
import { isRuleViolation } from '../src/types'
import { applyAction } from '../src/applyAction'
import { createInitialState } from '../src/initialState'
import { replay } from '../src/replay'
import { PLAYERS } from './util'

/**
 * 通しプレイ検証:単純な方針の自動プレイヤーで
 * セットアップ → 4フェーズ → 勝敗判定まで到達できることを確認する。
 * シード固定なので、アクション列・最終状態とも決定的。
 */
function playFullGame(seed: number): { state: GameState; actions: GameAction[] } {
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

  /** 解決待ち(イベント・要件カード)をすべて処理する */
  const drain = (): void => {
    let guard = 0
    while ((state.pendingEvent || state.pendingRequirementChoice) && guard++ < 50) {
      if (state.pendingEvent) {
        act({ type: 'RESOLVE_EVENT' })
        continue
      }
      const choice = state.pendingRequirementChoice!
      const instance = state.taskArea.find((t) => t.tileId === choice.taskTileId)!
      const participants = Object.entries(instance.tokens)
        .filter(([, c]) => c > 0)
        .map(([id]) => state.players.find((p) => p.id === id)!)
      // 追加スキル条件を満たせないカードは避ける
      const ok = (cardId: string): boolean => {
        const card = state.content.requirements.find((c) => c.id === cardId)!
        if (card.effect.type !== 'EXTRA_SKILL') return true
        const req = card.effect.requirement
        return participants.some((p) => p.skills[req.skill] >= req.level)
      }
      act({ type: 'SELECT_REQUIREMENT_CARD', choiceIndex: ok(choice.optionIds[0]) ? 0 : 1 })
    }
  }

  /** 依存順(コンテンツ定義順 × フェーズ昇順)のタスク並び */
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

  /** プランニング:休憩 → 追加請求 → スキル適合者を軸にトークン配置 */
  const plan = (): void => {
    for (const p of state.players) {
      if (p.fatigue >= 2 && p.tokens > 0) act({ type: 'REST', playerId: p.id })
    }
    if (state.budget <= 3 && state.cs >= 3) {
      const payer = state.players.find((p) => p.tokens > 0)
      if (payer) act({ type: 'EXTRA_BILLING', playerId: payer.id })
    }
    for (const tileId of topoOrder(state.taskArea.filter((t) => !t.resolved))) {
      const tile = state.content.tasks.find((t) => t.id === tileId)!
      const instance = state.taskArea.find((t) => t.tileId === tileId)!
      const placed = () => {
        const cur = state.taskArea.find((t) => t.tileId === tileId)!
        return Object.values(cur.tokens).reduce((a, b) => a + b, 0)
      }
      const placersOn = () => {
        const cur = state.taskArea.find((t) => t.tileId === tileId)!
        return Object.entries(cur.tokens).filter(([, c]) => c > 0).length
      }
      // スキル条件を満たすプレイヤーがいなければ配置しない
      const fitters = state.players.filter(
        (p) => !tile.skillRequirement || p.skills[tile.skillRequirement.skill] >= tile.skillRequirement.level,
      )
      if (fitters.length === 0) continue
      // 1個目はスキル適合者から
      const lead = fitters.find((p) => p.tokens > 0)
      if (!lead) continue
      if (placed() < tile.requiredTokens && (instance.tokens[lead.id] ?? 0) === 0) {
        act({ type: 'PLACE_TOKEN', playerId: lead.id, target: { kind: 'task', taskTileId: tileId } })
      }
      // 残りはトークンの多い人から(協業タスクは2人目を優先)
      let guard = 0
      while (placed() < tile.requiredTokens && guard++ < 20) {
        const cur = state.taskArea.find((t) => t.tileId === tileId)!
        const needSecond = tile.collaboration && placersOn() < 2
        const candidates = [...state.players]
          .filter((p) => p.tokens > 0 && (!needSecond || (cur.tokens[p.id] ?? 0) === 0))
          .sort((a, b) => b.tokens - a.tokens)
        const giver = candidates[0]
        if (!giver) break
        act({ type: 'PLACE_TOKEN', playerId: giver.id, target: { kind: 'task', taskTileId: tileId } })
      }
    }
    for (const p of state.players) act({ type: 'DECLARE_READY', playerId: p.id })
  }

  // ── ゲーム開始 ──
  act({
    type: 'SETUP_GAME',
    seed,
    players: PLAYERS,
    clientId: 'cl-komakai',
    projectCardId: 'pj-corporate',
    projectSheetId: 'ps-standard',
  })
  drain()

  let guard = 0
  while (state.result === null && guard++ < 1000) {
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

describe('通しプレイ(セットアップ → 4フェーズ → 勝敗判定)', () => {
  it('1ゲームを最後までプレイでき、勝敗が判定される', () => {
    const { state } = playFullGame(42)
    expect(state.step).toBe('finished')
    expect(state.result).not.toBeNull()
    expect(['win', 'lose']).toContain(state.result!.outcome)
    expect(Object.keys(state.result!.personalResults)).toHaveLength(4)
  })

  it('アクションログのリプレイで同じ最終状態が再現できる(イベントソーシング)', () => {
    const { state, actions } = playFullGame(42)
    // JSON 経由(永続化想定)でもリプレイ可能
    const serialized = JSON.parse(JSON.stringify(actions)) as GameAction[]
    expect(replay(serialized)).toEqual(state)
  })

  it('シードが同じなら全プレイが決定的', () => {
    const a = playFullGame(123)
    const b = playFullGame(123)
    expect(a.actions).toEqual(b.actions)
    expect(a.state).toEqual(b.state)
  })

  it('複数シードでクラッシュせず終局する', () => {
    for (const seed of [1, 7, 99, 2026]) {
      const { state } = playFullGame(seed)
      expect(state.step).toBe('finished')
    }
  })
})
