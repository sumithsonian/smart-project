/**
 * フェーズ終了と最終検収(RULES.md §8-6・§4-4)
 */
import { describe, expect, it } from 'vitest'
import { applyAction } from '../src/applyAction'
import { isRuleViolation } from '../src/types'
import type { GameState } from '../src/types'
import { processPhaseEnd } from '../src/actions/phaseEnd'
import { must, newGame, toStandup, withPlayer, withRequirement, withSlot } from './util'

/** 最終フェーズの phase_end 状態を捏造する */
function atFinalPhaseEnd(seed: number): GameState {
  const s = toStandup(newGame(seed))
  return { ...s, phase: s.config.phases, step: 'phase_end', week: s.config.roundsPerPhase }
}

describe('フェーズ終了の後始末', () => {
  it('疲労が phaseEndRecovery ぶん回復し、キャパシティ減と一時ブロックがクリアされる', () => {
    let s = toStandup(newGame(120))
    s = withPlayer(s, 'a', { fatigue: 3, capacityDownUntilWeek: 5 })
    s = {
      ...s,
      board: [
        ...s.board,
        {
          cardId: 't-req-light',
          cubes: 0,
          fire: 0,
          plannedWeek: 1,
          interrupt: null,
          interruptEffort: null,
          interruptSkill: null,
          targetSlotId: null,
          rewardBudget: null,
          actualEffort: null,
          contributorIds: [],
          placedSeq: 1,
          effortReduction: 0,
          blockedUntilWeek: 3,
          csOnFulfill: 0,
          sourceEventId: null,
        },
      ],
    }
    const after = processPhaseEnd({ ...s, week: s.config.roundsPerPhase })
    expect(after.step).toBe('phase_end')
    expect(after.players.find((p) => p.id === 'a')!.fatigue).toBe(3 - after.config.phaseEndRecovery)
    expect(after.players.every((p) => p.capacityDownUntilWeek === 0)).toBe(true)
    expect(after.board.every((t) => t.blockedUntilWeek === 0)).toBe(true)
  })
})

describe('ADVANCE_PHASE', () => {
  it('次フェーズのスコープ会議へ進み、フェーズ回数がリセットされる', () => {
    let s = toStandup(newGame(121))
    s = { ...s, step: 'phase_end', scopeChangeUsedThisPhase: 2, redrawUsedThisPhase: 1 }
    const next = must(applyAction(s, { type: 'ADVANCE_PHASE' }))
    expect(next.phase).toBe(2)
    expect(next.step).toBe('scope_meeting')
    expect(next.scopeChangeUsedThisPhase).toBe(0)
    expect(next.redrawUsedThisPhase).toBe(0)
    // フェーズ2の要件が追加公開される
    expect(next.requirements.some((r) => r.requirementId === 'rq-p2-wire')).toBe(true)
  })

  it('phase_end 以外では拒否される', () => {
    const r = applyAction(toStandup(newGame(122)), { type: 'ADVANCE_PHASE' })
    expect(isRuleViolation(r) && r.code).toBe('INVALID_STEP')
  })
})

describe('最終検収(RULES.md §4-4)', () => {
  it('要求 Lv を満たしていれば減点なし', () => {
    let s = atFinalPhaseEnd(123)
    s = withSlot(s, 'requirements', { level: 1 })
    s = withSlot(s, 'sitemap', { level: 2 })
    const before = s.cs
    const after = must(applyAction(s, { type: 'ADVANCE_PHASE' }))
    expect(after.cs).toBe(before)
    expect(after.result!.outcome).toBe('win')
  })

  it('Lv2 要求を Lv1 で納めると finalCompromiseCs、未達成なら finalMissCs', () => {
    let s = atFinalPhaseEnd(124)
    s = withSlot(s, 'requirements', { level: 1 }) // Lv1 要求 → 充足
    s = withSlot(s, 'sitemap', { level: 1 }) // Lv2 要求を Lv1 → 妥協
    const before = s.cs
    const after = must(applyAction(s, { type: 'ADVANCE_PHASE' }))
    expect(after.cs).toBe(before - after.config.finalCompromiseCs)

    const s2 = atFinalPhaseEnd(125) // 何も納品していない
    const before2 = s2.cs
    const after2 = must(applyAction(s2, { type: 'ADVANCE_PHASE' }))
    expect(after2.cs).toBe(before2 - after2.config.finalMissCs * 2)
  })

  it('見送りにした要件も最終検収では評価される', () => {
    let s = atFinalPhaseEnd(126)
    s = withRequirement(s, 'rq-p1-reqs', { tier: 'dropped', settled: true })
    s = withRequirement(s, 'rq-p1-map', { tier: 'dropped', settled: true })
    const before = s.cs
    const after = must(applyAction(s, { type: 'ADVANCE_PHASE' }))
    expect(after.cs).toBe(before - after.config.finalMissCs * 2)
  })

  it('手戻り中のスロットは最終検収でも未達成扱い', () => {
    let s = atFinalPhaseEnd(127)
    s = withSlot(s, 'requirements', { level: 1 })
    s = withSlot(s, 'sitemap', { level: 2 })
    s = {
      ...s,
      board: [
        ...s.board,
        {
          cardId: 'interrupt-1',
          cubes: 0,
          fire: 0,
          plannedWeek: null,
          interrupt: 'rework' as const,
          interruptEffort: 2,
          interruptSkill: null,
          targetSlotId: 'sitemap',
          rewardBudget: null,
          actualEffort: null,
          contributorIds: [],
          placedSeq: 1,
          effortReduction: 0,
          blockedUntilWeek: 0,
          csOnFulfill: 0,
          sourceEventId: null,
        },
      ],
    }
    const before = s.cs
    const after = must(applyAction(s, { type: 'ADVANCE_PHASE' }))
    expect(after.cs).toBe(before - after.config.finalMissCs)
  })

  it('CS が 0 未満なら敗北になる', () => {
    const s = { ...atFinalPhaseEnd(128), cs: 1 }
    const after = must(applyAction(s, { type: 'ADVANCE_PHASE' }))
    expect(after.result!.outcome).toBe('lose')
  })
})
