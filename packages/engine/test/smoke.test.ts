/**
 * スモークテスト:v5 のコアループが最後まで回ること
 * (スコープ会議 → 3週 → フェーズ清算 ×4 → 最終検収)
 */
import { describe, expect, it } from 'vitest'
import { applyAction } from '../src/applyAction'
import { isRuleViolation } from '../src/types'
import type { GameState } from '../src/types'
import { apply, must, newGame } from './util'

/** 解決待ちイベントを流す(選択肢は先頭。予算不足なら次の選択肢) */
function resolveAll(state: GameState): GameState {
  let s = state
  let guard = 0
  while (s.pendingEvent !== null && guard++ < 50) {
    const pending = s.pendingEvent
    const card =
      pending.kind === 'weekend'
        ? s.content.events.find((e) => e.id === pending.cardId)
        : undefined
    const choices = card?.choices ?? []
    if (choices.length === 0) {
      s = must(applyAction(s, { type: 'RESOLVE_EVENT' }))
      continue
    }
    let resolved = false
    for (const choice of choices) {
      const r = applyAction(s, { type: 'RESOLVE_EVENT', choiceId: choice.id })
      if (!isRuleViolation(r)) {
        s = r
        resolved = true
        break
      }
    }
    if (!resolved) throw new Error('どの選択肢も選べませんでした')
  }
  return s
}

/** 素朴なボット:座れるものに全員を置き、週末は納品できるものを全部納品 */
function playStandup(state: GameState): GameState {
  let s = state
  for (const p of s.players) {
    let placed = false
    for (const task of s.board) {
      const r = applyAction(s, {
        type: 'ASSIGN_WORKER',
        playerId: p.id,
        target: { kind: 'task', cardId: task.cardId },
      })
      if (!isRuleViolation(r)) {
        s = r
        placed = true
        break
      }
    }
    if (!placed) {
      s = apply(s, { type: 'ASSIGN_WORKER', playerId: p.id, target: { kind: 'rest' } })
    }
  }
  for (const p of s.players) {
    s = must(applyAction(s, { type: 'DECLARE_READY', playerId: p.id }))
    s = resolveAll(s)
    if (s.result !== null) return s
  }
  // 納品できるものを全部納品
  let delivered = true
  while (delivered && s.result === null) {
    delivered = false
    for (const task of s.board) {
      const r = applyAction(s, { type: 'DELIVER_TASK', cardId: task.cardId })
      if (!isRuleViolation(r)) {
        s = r
        delivered = true
        break
      }
    }
  }
  return s
}

/** スコープ会議:置けるタスクを3週に散らす */
function planPhase(state: GameState): GameState {
  let s = state
  let week = 1
  let placed = 0
  for (const cardId of [...s.taskPool]) {
    if (placed >= 4) break
    const r = applyAction(s, { type: 'PLAN_TASK', playerId: 'a', cardId, week })
    if (!isRuleViolation(r)) {
      s = r
      placed++
      week = (week % s.config.roundsPerPhase) + 1
    }
  }
  return apply(s, { type: 'FINISH_SCOPE', playerId: 'a' })
}

describe('スモーク:1ゲーム完走', () => {
  it('セットアップ → 4フェーズ → 最終検収まで例外なく到達する', () => {
    let s = newGame(7)
    expect(s.step).toBe('scope_meeting')
    expect(s.phase).toBe(1)
    expect(s.requirements.length).toBeGreaterThan(0)
    expect(s.taskPool.length).toBeGreaterThan(0)

    let guard = 0
    while (s.result === null && guard++ < 300) {
      if (s.pendingEvent !== null) {
        s = resolveAll(s)
      } else if (s.step === 'scope_meeting') {
        s = resolveAll(planPhase(s))
      } else if (s.step === 'standup') {
        s = playStandup(s)
      } else if (s.step === 'weekend') {
        s = resolveAll(apply(s, { type: 'END_WEEKEND', playerId: 'a' }))
      } else if (s.step === 'phase_end') {
        s = apply(s, { type: 'ADVANCE_PHASE' })
      } else {
        break
      }
    }
    expect(guard).toBeLessThan(300)
    expect(s.result).not.toBeNull()
    expect(['win', 'lose']).toContain(s.result!.outcome)
    expect(s.log.some((l) => l.message.includes('要件が公開'))).toBe(true)
  })

  it('複数シードで完走する(デッドロックしない)', () => {
    for (const seed of [1, 11, 101, 2026]) {
      let s = newGame(seed)
      let guard = 0
      while (s.result === null && guard++ < 300) {
        if (s.pendingEvent !== null) s = resolveAll(s)
        else if (s.step === 'scope_meeting') s = resolveAll(planPhase(s))
        else if (s.step === 'standup') s = playStandup(s)
        else if (s.step === 'weekend') {
          s = resolveAll(apply(s, { type: 'END_WEEKEND', playerId: 'a' }))
        } else if (s.step === 'phase_end') s = apply(s, { type: 'ADVANCE_PHASE' })
        else break
      }
      expect(s.result, `seed=${seed}`).not.toBeNull()
    }
  })

  it('リプレイ再現性:同じシードで同じ初期局面になる', () => {
    const a = newGame(123)
    const b = newGame(123)
    expect(a.taskPool).toEqual(b.taskPool)
    expect(a.requirements).toEqual(b.requirements)
    expect(a.players.map((p) => p.memberId)).toEqual(b.players.map((p) => p.memberId))
  })
})
