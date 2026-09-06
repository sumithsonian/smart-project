/**
 * 週末イベントと選択肢(RULES.md §7。Issue #6)
 */
import { describe, expect, it } from 'vitest'
import { applyAction } from '../src/applyAction'
import { isRuleViolation } from '../src/types'
import { capacityPenalty, isTaskBlocked, weekLoad } from '../src/helpers'
import type { GameState } from '../src/types'
import { addBoardTask, allReady, makeBoardTask, must, newGame, toStandup, withSlot } from './util'

/** 指定のイベントカードを解決待ちにする(局面捏造) */
function pending(state: GameState, cardId: string): GameState {
  return { ...state, pendingEvent: { kind: 'weekend', cardId, targetPlayerId: null } }
}

describe('イベントは週末に起きる(RULES.md §7-1)', () => {
  it('週初は炎上のみで、イベントは引かれない', () => {
    let s = newGame(60)
    s = must(applyAction(s, { type: 'PLAN_TASK', playerId: 'a', cardId: 't-req-light', week: 1 }))
    s = must(applyAction(s, { type: 'FINISH_SCOPE', playerId: 'a' }))
    expect(s.step).toBe('standup')
    expect(s.pendingEvent).toBeNull() // 週初イベントは廃止
    expect(s.remainingFireDraws).toBe(0)
    expect(s.board.some((t) => t.fire > 0)).toBe(true) // 炎上は週初に来る
  })

  it('週末を締めるとイベントが1枚めくられ、解決後に再計画できる', () => {
    let s = toStandup(newGame(61))
    s = allReady(s)
    expect(s.step).toBe('weekend')
    expect(s.pendingWeekendEventDraw).toBe(true)
    s = must(applyAction(s, { type: 'END_WEEKEND', playerId: 'a' }))
    expect(s.pendingEvent).not.toBeNull()
    expect(s.pendingEvent!.kind).toBe('weekend')
    expect(s.step).toBe('weekend') // まだ週末のまま
  })
})

describe('選択肢(RULES.md §7-2)', () => {
  it('選択肢のあるイベントは choiceId なしでは解決できない', () => {
    const s = pending(allReady(toStandup(newGame(62))), 'ev-help-other')
    const r = applyAction(s, { type: 'RESOLVE_EVENT' })
    expect(isRuleViolation(r) && r.code).toBe('INVALID_TARGET')
  })

  it('存在しない選択肢は NOT_FOUND', () => {
    const s = pending(allReady(toStandup(newGame(63))), 'ev-help-other')
    const r = applyAction(s, { type: 'RESOLVE_EVENT', choiceId: 'nope' })
    expect(isRuleViolation(r) && r.code).toBe('NOT_FOUND')
  })

  it('選択と結果がログに残る(リプレイで再現できる)', () => {
    const s = pending(allReady(toStandup(newGame(64))), 'ev-help-other')
    const next = must(applyAction(s, { type: 'RESOLVE_EVENT', choiceId: 'decline' }))
    expect(next.log.some((l) => l.message.includes('選択:「断る」'))).toBe(true)
  })

  it('予算が足りない選択肢は選べない', () => {
    const base = allReady(toStandup(newGame(65)))
    const s = pending({ ...base, budget: 1 }, 'ev-spec-change')
    const r = applyAction(s, { type: 'RESOLVE_EVENT', choiceId: 'negotiate' })
    expect(isRuleViolation(r) && r.code).toBe('NOT_ENOUGH_BUDGET')
  })

  it('交渉で予算を払えば手戻りを回避できる', () => {
    const base = allReady(toStandup(newGame(66)))
    const s = pending(base, 'ev-spec-change')
    const next = must(applyAction(s, { type: 'RESOLVE_EVENT', choiceId: 'negotiate' }))
    expect(next.board.some((t) => t.interrupt === 'rework')).toBe(false)
    expect(next.budget).toBe(base.budget - 3)
  })
})

describe('CAPACITY_DOWN — 他案件ヘルプ(RULES.md §7-3)', () => {
  it('受けると次週のキャパシティが下がる', () => {
    let s = allReady(toStandup(newGame(67)))
    s = pending(s, 'ev-help-other')
    s = must(applyAction(s, { type: 'RESOLVE_EVENT', choiceId: 'accept' }))
    const affected = s.players.filter((p) => p.capacityDownUntilWeek === s.week + 1)
    expect(affected).toHaveLength(1)
    expect(s.log.some((l) => l.message.includes('他案件のヘルプ'))).toBe(true)
    // 来週の供給能力が減っている
    const load = weekLoad(s, s.week + 1)
    const full = s.players.reduce((sum, p) => sum + p.skills.direction, 0)
    expect(load.capacity.direction).toBeLessThanOrEqual(full)
  })

  it('キャパシティ減はその週だけ効き、積むキューブが減る', () => {
    let s = toStandup(newGame(68))
    s = {
      ...s,
      players: s.players.map((p) => (p.id === 'a' ? { ...p, capacityDownUntilWeek: s.week } : p)),
    }
    expect(capacityPenalty(s, s.players.find((p) => p.id === 'a')!)).toBe(
      s.config.capacityDownCubes,
    )
    expect(capacityPenalty(s, s.players.find((p) => p.id === 'b')!)).toBe(0)
  })

  it('断ると CS が下がる', () => {
    const base = allReady(toStandup(newGame(69)))
    const s = pending(base, 'ev-help-other')
    const next = must(applyAction(s, { type: 'RESOLVE_EVENT', choiceId: 'decline' }))
    expect(next.cs).toBe(base.cs - 1)
  })
})

describe('BLOCK_TASK — クライアント確認待ち(RULES.md §7-3)', () => {
  it('待つと対象タスクが次週ブロックされる', () => {
    let s = toStandup(newGame(70))
    s = addBoardTask(s, makeBoardTask('t-req-light', { plannedWeek: 1 }))
    s = allReady(s)
    s = pending(s, 'ev-client-review-wait')
    s = must(applyAction(s, { type: 'RESOLVE_EVENT', choiceId: 'wait' }))
    const task = s.board.find((t) => t.cardId === 't-req-light')!
    expect(task.blockedUntilWeek).toBe(s.week + 1)
    // 来週の局面ではブロック中になる
    const nextWeekState = { ...s, week: s.week + 1 }
    expect(isTaskBlocked(nextWeekState, task)).toBe(true)
    // 再来週には外れる
    expect(isTaskBlocked({ ...s, week: s.week + 2 }, task)).toBe(false)
  })

  it('押し切ると CS を払ってブロックを避けられる', () => {
    let s = toStandup(newGame(71))
    s = addBoardTask(s, makeBoardTask('t-req-light', { plannedWeek: 1 }))
    s = allReady(s)
    const before = s.cs
    s = pending(s, 'ev-client-review-wait')
    s = must(applyAction(s, { type: 'RESOLVE_EVENT', choiceId: 'push' }))
    expect(s.cs).toBe(before - 1)
    expect(s.board.find((t) => t.cardId === 't-req-light')!.blockedUntilWeek).toBe(0)
  })
})

describe('ADD_REQUIREMENT — 要件追加(RULES.md §3-6)', () => {
  it('Must として受けるとスコープボードに Must で入る', () => {
    let s = allReady(toStandup(newGame(72)))
    s = pending(s, 'ev-add-request-style')
    s = must(applyAction(s, { type: 'RESOLVE_EVENT', choiceId: 'must' }))
    const added = s.requirements.find((r) => r.requirementId === 'rq-add-styleguide')!
    expect(added.tier).toBe('must')
    expect(added.addedByEvent).toBe(true)
    expect(added.csOnFulfill).toBe(1)
  })

  it('Better として受けると Better で入る', () => {
    let s = allReady(toStandup(newGame(73)))
    s = pending(s, 'ev-add-request-style')
    s = must(applyAction(s, { type: 'RESOLVE_EVENT', choiceId: 'better' }))
    expect(s.requirements.find((r) => r.requirementId === 'rq-add-styleguide')!.tier).toBe('better')
  })

  it('断ると要件は増えず CS が下がる', () => {
    const base = allReady(toStandup(newGame(74)))
    const s = pending(base, 'ev-add-request-style')
    const next = must(applyAction(s, { type: 'RESOLVE_EVENT', choiceId: 'decline' }))
    expect(next.requirements.some((r) => r.requirementId === 'rq-add-styleguide')).toBe(false)
    expect(next.cs).toBe(base.cs - 1)
  })

  it('追加された要件は通常の要件と同じく交渉できる', () => {
    let s = allReady(toStandup(newGame(75)))
    s = pending(s, 'ev-add-request-style')
    s = must(applyAction(s, { type: 'RESOLVE_EVENT', choiceId: 'must' }))
    const next = must(
      applyAction(s, {
        type: 'CHANGE_SCOPE',
        playerId: 'a',
        requirementId: 'rq-add-styleguide',
        mode: 'demote',
      }),
    )
    expect(next.requirements.find((r) => r.requirementId === 'rq-add-styleguide')!.tier).toBe(
      'better',
    )
  })

  it('すでに条件を満たしていれば追加と同時に達成になる', () => {
    let s = allReady(toStandup(newGame(76)))
    s = withSlot(s, 'styleguide', { level: 1 })
    s = pending(s, 'ev-add-request-style')
    s = must(applyAction(s, { type: 'RESOLVE_EVENT', choiceId: 'better' }))
    expect(s.requirements.find((r) => r.requirementId === 'rq-add-styleguide')!.met).toBe(true)
  })
})

describe('イベントの結果が次週の計画に効く', () => {
  it('イベント解決後、締める前に再計画できる', () => {
    let s = newGame(77)
    s = must(applyAction(s, { type: 'PLAN_TASK', playerId: 'a', cardId: 't-req-light', week: 1 }))
    s = toStandup(s)
    s = allReady(s)
    s = must(applyAction(s, { type: 'END_WEEKEND', playerId: 'a' }))
    // イベントを解決してから再計画
    const card = s.content.events.find((e) => e.id === s.pendingEvent!.cardId)!
    s = must(applyAction(s, { type: 'RESOLVE_EVENT', choiceId: card.choices?.[0]?.id }))
    expect(s.step).toBe('weekend')
    s = must(applyAction(s, { type: 'MOVE_TASK', playerId: 'a', cardId: 't-req-light', week: 3 }))
    expect(s.board.find((t) => t.cardId === 't-req-light')!.plannedWeek).toBe(3)
  })
})

describe('割り込みの必要スキル(RULES.md §8-4。Issue #7)', () => {
  it('バグ報告はエンジニアリング系統の割り込みになる', () => {
    let s = allReady(toStandup(newGame(78)))
    s = pending(s, 'ev-bug-report')
    s = must(applyAction(s, { type: 'RESOLVE_EVENT', choiceId: 'fix' }))
    const bug = s.board.find((t) => t.interrupt === 'bug')!
    expect(bug.interruptSkill).toBe('engineering')
    expect(bug.csOnFulfill).toBe(1)
  })

  it('手戻りは対象スロットの系統を必要とする', () => {
    let s = allReady(toStandup(newGame(79)))
    s = withSlot(s, 'wireframe', { level: 1, qualityRisk: true })
    s = pending(s, 'ev-design-rework')
    s = must(applyAction(s, { type: 'RESOLVE_EVENT' }))
    const rework = s.board.find((t) => t.interrupt === 'rework')!
    expect(rework.targetSlotId).toBe('wireframe')
    expect(rework.interruptSkill).toBe('design') // wireframe は design 系統
  })

  it('相談ごとは系統不問(最高スキルで対応)', () => {
    let s = allReady(toStandup(newGame(80)))
    s = pending(s, 'ev-consult')
    s = must(applyAction(s, { type: 'RESOLVE_EVENT' }))
    const consult = s.board.find((t) => t.interrupt === 'consult')!
    expect(consult.interruptSkill).toBeNull()
  })
})
