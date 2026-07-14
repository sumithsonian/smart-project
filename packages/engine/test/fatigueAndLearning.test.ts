/**
 * 疲労(限界イベント)・学習(rules-v4-core.md §0・§1-2-2)
 */
import { describe, expect, it } from 'vitest'
import { applyAction } from '../src/applyAction'
import { isRuleViolation } from '../src/types'
import { addBoardTask, makeBoardTask, must, newGame, toStandup, withPlayer } from './util'

describe('疲労と限界イベント', () => {
  it('fatigueMaxに到達すると限界イベントが発生し、解決するとlimitResetFatigueに戻る', () => {
    let state = toStandup(newGame(110))
    state = withPlayer(state, 'a', { fatigue: 3 })
    state = addBoardTask(state, makeBoardTask('t-req-light')) // fatigue1 → 3+1=4(fatigueMax)
    state = must(
      applyAction(state, {
        type: 'ASSIGN_WORKER',
        playerId: 'a',
        target: { kind: 'task', cardId: 't-req-light' },
      }),
    )

    // 最後(PM 'a')が Ready を宣言する直前まで進め、途中で自動解決させない
    for (const p of ['b', 'c', 'd']) {
      state = must(applyAction(state, { type: 'DECLARE_READY', playerId: p }))
    }
    state = must(applyAction(state, { type: 'DECLARE_READY', playerId: 'a' }))

    expect(state.pendingEvent?.kind).toBe('limit')
    expect(state.pendingEvent?.targetPlayerId).toBe('a')
    expect(state.players.find((p) => p.id === 'a')!.fatigue).toBe(4)

    const resolved = must(applyAction(state, { type: 'RESOLVE_EVENT' }))
    expect(resolved.pendingEvent).toBeNull()
    expect(resolved.players.find((p) => p.id === 'a')!.fatigue).toBe(2) // limitResetFatigue
  })

  it('OVERTIME_BANの限界イベントは次フェーズの残業を禁止する', () => {
    let state = toStandup(newGame(111))
    state = withPlayer(state, 'a', { fatigue: 3 })
    // 局面捏造:次に引く限界イベントを OVERTIME_BAN に固定する
    state = {
      ...state,
      decks: { ...state.decks, limitEvents: { drawPile: ['lm-overtime-ban'], discardPile: [] } },
    }
    state = addBoardTask(state, makeBoardTask('t-req-light'))
    state = must(
      applyAction(state, {
        type: 'ASSIGN_WORKER',
        playerId: 'a',
        target: { kind: 'task', cardId: 't-req-light' },
      }),
    )
    for (const p of ['b', 'c', 'd']) {
      state = must(applyAction(state, { type: 'DECLARE_READY', playerId: p }))
    }
    state = must(applyAction(state, { type: 'DECLARE_READY', playerId: 'a' }))
    expect(state.pendingEvent?.cardId).toBe('lm-overtime-ban')

    state = must(applyAction(state, { type: 'RESOLVE_EVENT' }))
    const a = state.players.find((p) => p.id === 'a')!
    expect(a.overtimeBanPhase).toBe(state.phase + 1)

    // 次フェーズを模して残業を試みる(疲労ゲートの影響を排除するため疲労は0にする)
    const nextPhase = {
      ...state,
      phase: state.phase + 1,
      step: 'standup' as const,
      pendingLimitPlayerIds: [],
      assignments: [],
      readyPlayerIds: [],
      players: state.players.map((p) => (p.id === 'a' ? { ...p, fatigue: 0 } : p)),
    }
    const withPrimary = must(
      applyAction(nextPhase, {
        type: 'ASSIGN_WORKER',
        playerId: 'a',
        target: { kind: 'rest' },
      }),
    )
    const r = applyAction(withPrimary, {
      type: 'ASSIGN_WORKER',
      playerId: 'a',
      target: { kind: 'rest' },
      overtime: true,
    })
    expect(isRuleViolation(r) && r.code).toBe('OVERTIME_FORBIDDEN')
    expect(isRuleViolation(r) && r.message).toContain('体調不良')
  })
})

describe('学習(skillMaxとpendingLearn)', () => {
  it('skillMaxに達している系統は学習できない(SKILL_MAX)', () => {
    let state = toStandup(newGame(120))
    state = withPlayer(state, 'c', { skills: { direction: 1, design: 3, engineering: 0 } })
    const r = applyAction(state, {
      type: 'ASSIGN_WORKER',
      playerId: 'c',
      target: { kind: 'learn', skill: 'design' },
    })
    expect(isRuleViolation(r) && r.code).toBe('SKILL_MAX')
  })

  it('pendingLearn中の系統は上限までの残りに繰り入れられ、二重に学習できない', () => {
    let state = toStandup(newGame(121))
    state = withPlayer(state, 'c', {
      skills: { direction: 1, design: 2, engineering: 0 },
      pendingLearn: 'design',
    })
    const r = applyAction(state, {
      type: 'ASSIGN_WORKER',
      playerId: 'c',
      target: { kind: 'learn', skill: 'design' },
    })
    expect(isRuleViolation(r) && r.code).toBe('SKILL_MAX') // 2 + pendingLearn分1 = skillMax(3)

    const withoutPending = withPlayer(state, 'c', { pendingLearn: null })
    const ok = must(
      applyAction(withoutPending, {
        type: 'ASSIGN_WORKER',
        playerId: 'c',
        target: { kind: 'learn', skill: 'design' },
      }),
    )
    expect(ok.assignments.some((a) => a.playerId === 'c')).toBe(true)
  })
})
