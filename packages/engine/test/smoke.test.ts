/**
 * スモークテスト:v4 のコアループが最後まで回ること
 * (スコープ会議 → 3週 → フェーズ清算 ×4 → 最終検収)
 */
import { describe, expect, it } from 'vitest'
import { applyAction } from '../src/applyAction'
import { isRuleViolation } from '../src/types'
import { apply, drainPending, must, newGame } from './util'
import type { GameState } from '../src/types'

/** 素朴なボット:全員を最初の座れるタスクに置き、週末は納品できるものを全部納品 */
function playWeek(state: GameState): GameState {
  let s = state
  // 朝会:各自、座れる盤上タスク or 休憩
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
  // 全員 Ready → 週末
  for (const p of s.players) {
    s = must(applyAction(s, { type: 'DECLARE_READY', playerId: p.id }))
    s = drainPending(s)
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

describe('スモーク:1ゲーム完走', () => {
  it('セットアップ → 4フェーズ → 最終検収まで例外なく到達する', () => {
    let s = newGame(7)
    expect(s.step).toBe('scope_meeting')
    expect(s.phase).toBe(1)
    expect(s.openAcceptanceIds.length).toBeGreaterThan(0)
    expect(s.taskPool.length).toBeGreaterThan(0)

    let guard = 0
    while (s.result === null && guard++ < 200) {
      if (s.pendingEvent !== null) {
        s = drainPending(s)
      } else if (s.step === 'scope_meeting') {
        // 公開済み・未約束の条件を1つ約束し、候補から置けるものを2枚配置
        const open = s.openAcceptanceIds.find(
          (id) =>
            !s.metAcceptanceIds.includes(id) &&
            !s.commitments.some((c) => c.acceptanceId === id),
        )
        if (open) {
          s = apply(s, { type: 'COMMIT_ACCEPTANCE', playerId: 'a', acceptanceId: open })
        }
        let placedCount = 0
        for (const cardId of [...s.taskPool]) {
          if (placedCount >= 2) break
          const r = applyAction(s, { type: 'PLACE_TASK', playerId: 'a', cardId })
          if (!isRuleViolation(r)) {
            s = r
            placedCount++
          }
        }
        s = apply(s, { type: 'FINISH_SCOPE', playerId: 'a' })
        s = drainPending(s)
      } else if (s.step === 'standup') {
        s = playWeek(s)
      } else if (s.step === 'weekend') {
        s = apply(s, { type: 'END_WEEKEND', playerId: 'a' })
        s = drainPending(s)
      } else if (s.step === 'phase_end') {
        s = apply(s, { type: 'ADVANCE_PHASE' })
      } else {
        break
      }
    }
    expect(guard).toBeLessThan(200)
    expect(s.result).not.toBeNull()
    expect(['win', 'lose']).toContain(s.result!.outcome)
    // ログに主要イベントが記録されている
    expect(s.log.some((l) => l.message.includes('検収条件が公開'))).toBe(true)
  })

  it('リプレイ再現性:同じシードで同じ結果になる', () => {
    const a = newGame(123)
    const b = newGame(123)
    expect(a.taskPool).toEqual(b.taskPool)
    expect(a.openAcceptanceIds).toEqual(b.openAcceptanceIds)
    expect(a.players.map((p) => p.memberId)).toEqual(b.players.map((p) => p.memberId))
  })
})
