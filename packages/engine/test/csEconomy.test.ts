/**
 * CS の増減:Better 達成・信頼ボーナス・追加対応・重複防止(RULES.md §4。Issue #8)
 */
import { describe, expect, it } from 'vitest'
import { applyAction } from '../src/applyAction'
import type { GameState } from '../src/types'
import { processPhaseEnd } from '../src/actions/phaseEnd'
import {
  addBoardTask,
  addRequirement,
  allReady,
  makeBoardTask,
  must,
  newGame,
  toStandup,
  withRequirement,
  withSlot,
} from './util'

/** 最終週の週末という状態を作ってフェーズ末清算だけを回す */
function settlePhase(state: GameState): GameState {
  return processPhaseEnd({ ...state, week: state.config.roundsPerPhase })
}

describe('Better 達成で CS が増える(RULES.md §4-1)', () => {
  it('期限フェーズ末に Better を達成していれば CS+1', () => {
    let s = toStandup(newGame(100))
    // rq-p1-map: sitemap Lv2 / 期限フェーズ2 → 期限をフェーズ1にして清算対象にする
    s = withRequirement(s, 'rq-p1-map', { deadlinePhase: 1 })
    s = withSlot(s, 'sitemap', { level: 2 })
    // Must は達成しておく(Must 未達の減点を混ぜない)
    s = withSlot(s, 'requirements', { level: 1 })
    const before = s.cs
    const after = settlePhase(s)
    // Better +1、信頼ボーナス +1
    expect(after.cs).toBe(before + s.config.betterMeetCs + s.config.allMustBonusCs)
    expect(after.log.some((l) => l.message.includes('Better'))).toBe(true)
  })

  it('Better 未達には罰がない(失効するだけ)', () => {
    let s = toStandup(newGame(101))
    s = withRequirement(s, 'rq-p1-map', { deadlinePhase: 1 })
    s = withSlot(s, 'requirements', { level: 1 })
    const before = s.cs
    const after = settlePhase(s)
    // 信頼ボーナスのみ
    expect(after.cs).toBe(before + s.config.allMustBonusCs)
    const req = after.requirements.find((r) => r.requirementId === 'rq-p1-map')!
    expect(req.settledOutcome).toBe('expired')
  })
})

describe('Must の清算(RULES.md §3-4)', () => {
  it('Must 未達は期限フェーズ末に1回だけ CS を減らす', () => {
    const s = toStandup(newGame(102))
    const before = s.cs
    const after = settlePhase(s)
    expect(after.cs).toBe(before - s.config.mustMissCs)
    const req = after.requirements.find((r) => r.requirementId === 'rq-p1-reqs')!
    expect(req.settled).toBe(true)
    expect(req.settledOutcome).toBe('failed')
  })

  it('清算済みの Must はフェーズ末に再度罰されない', () => {
    const s = toStandup(newGame(103))
    const firstSettle = settlePhase(s)
    const csAfterFirst = firstSettle.cs
    // 次フェーズでもう一度清算しても、清算済みなので減らない
    const secondSettle = processPhaseEnd({
      ...firstSettle,
      phase: 2,
      step: 'weekend',
      week: firstSettle.config.roundsPerPhase,
    })
    expect(secondSettle.cs).toBe(csAfterFirst)
  })

  it('期限が先のフェーズの Must は今フェーズ末には清算されない', () => {
    let s = toStandup(newGame(104))
    s = withRequirement(s, 'rq-p1-reqs', { deadlinePhase: 3 })
    s = withRequirement(s, 'rq-p1-map', { deadlinePhase: 3 })
    const before = s.cs
    const after = settlePhase(s)
    expect(after.cs).toBe(before)
    expect(after.requirements.every((r) => !r.settled)).toBe(true)
  })

  it('見送りにした要件は清算対象外', () => {
    let s = toStandup(newGame(105))
    s = withRequirement(s, 'rq-p1-reqs', { tier: 'dropped' })
    const before = s.cs
    const after = settlePhase(s)
    expect(after.cs).toBe(before)
  })
})

describe('信頼ボーナス(RULES.md §4-2)', () => {
  it('期限フェーズの Must をすべて達成すると CS+1', () => {
    let s = toStandup(newGame(106))
    s = withSlot(s, 'requirements', { level: 1 })
    s = withRequirement(s, 'rq-p1-map', { deadlinePhase: 4 }) // 対象外にする
    const before = s.cs
    const after = settlePhase(s)
    expect(after.cs).toBe(before + s.config.allMustBonusCs)
    expect(after.log.some((l) => l.message.includes('信頼ボーナス'))).toBe(true)
  })

  it('Must が1つでも未達ならボーナスは出ない', () => {
    let s = toStandup(newGame(107))
    s = addRequirement(s, 'rq-p2-wire', { deadlinePhase: 1 })
    s = withSlot(s, 'requirements', { level: 1 }) // 片方だけ達成
    const before = s.cs
    const after = settlePhase(s)
    expect(after.cs).toBe(before - s.config.mustMissCs)
    expect(after.log.some((l) => l.message.includes('信頼ボーナス'))).toBe(false)
  })

  it('期限の Must が0枚のフェーズにはボーナスが出ない', () => {
    let s = toStandup(newGame(108))
    s = withRequirement(s, 'rq-p1-reqs', { deadlinePhase: 4 })
    s = withRequirement(s, 'rq-p1-map', { deadlinePhase: 4 })
    const before = s.cs
    const after = settlePhase(s)
    expect(after.cs).toBe(before)
  })
})

describe('イベント由来の追加対応(RULES.md §4-1)', () => {
  it('引き受けた追加要件を達成すると即時 CS を得る', () => {
    let s = toStandup(newGame(109))
    s = allReady(s)
    s = {
      ...s,
      pendingEvent: { kind: 'weekend', cardId: 'ev-add-request-style', targetPlayerId: null },
    }
    s = must(applyAction(s, { type: 'RESOLVE_EVENT', choiceId: 'must' }))
    const before = s.cs
    // スタイルガイドを納品して達成させる
    s = addBoardTask(s, makeBoardTask('t-guide-light', { cubes: 2, actualEffort: 2 }))
    s = withSlot(s, 'wireframe', { level: 1 })
    s = must(applyAction(s, { type: 'DELIVER_TASK', cardId: 't-guide-light' }))
    expect(s.cs).toBe(before + 1)
    expect(s.csAwardedEventIds).toContain('ev-add-request-style')
  })

  it('引き受けたバグ対応をやり切ると CS を得る', () => {
    let s = toStandup(newGame(110))
    s = allReady(s)
    s = { ...s, pendingEvent: { kind: 'weekend', cardId: 'ev-bug-report', targetPlayerId: null } }
    s = must(applyAction(s, { type: 'RESOLVE_EVENT', choiceId: 'fix' }))
    const bug = s.board.find((t) => t.interrupt === 'bug')!
    const before = s.cs
    s = { ...s, board: s.board.map((t) => (t.cardId === bug.cardId ? { ...t, cubes: 9 } : t)) }
    s = must(applyAction(s, { type: 'DELIVER_TASK', cardId: bug.cardId }))
    expect(s.cs).toBe(before + 1)
  })

  it('様子を見る選択では追加 CS は付かない', () => {
    let s = toStandup(newGame(111))
    s = allReady(s)
    s = { ...s, pendingEvent: { kind: 'weekend', cardId: 'ev-bug-report', targetPlayerId: null } }
    s = must(applyAction(s, { type: 'RESOLVE_EVENT', choiceId: 'watch' }))
    expect(s.board.find((t) => t.interrupt === 'bug')!.csOnFulfill).toBe(0)
  })
})

describe('重複獲得の防止(RULES.md §4-3)', () => {
  it('同じ要件から Better の CS を2回は得られない', () => {
    let s = toStandup(newGame(112))
    s = withRequirement(s, 'rq-p1-map', { deadlinePhase: 1 })
    s = withSlot(s, 'sitemap', { level: 2 })
    s = withSlot(s, 'requirements', { level: 1 })
    const first = settlePhase(s)
    expect(first.csAwardedRequirementIds).toContain('rq-p1-map')

    // 清算済みフラグを外して再度回しても、獲得済みリストで弾かれる
    const replayed = processPhaseEnd({
      ...first,
      step: 'weekend',
      week: first.config.roundsPerPhase,
      requirements: first.requirements.map((r) =>
        r.requirementId === 'rq-p1-map' ? { ...r, settled: false } : r,
      ),
    })
    expect(replayed.cs).toBe(first.cs)
  })

  it('同じイベントから追加対応の CS を2回は得られない', () => {
    let s = toStandup(newGame(113))
    s = allReady(s)
    s = {
      ...s,
      csAwardedEventIds: ['ev-add-request-style'],
      pendingEvent: { kind: 'weekend', cardId: 'ev-add-request-style', targetPlayerId: null },
    }
    s = must(applyAction(s, { type: 'RESOLVE_EVENT', choiceId: 'must' }))
    const before = s.cs
    s = addBoardTask(s, makeBoardTask('t-guide-light', { cubes: 2, actualEffort: 2 }))
    s = withSlot(s, 'wireframe', { level: 1 })
    s = must(applyAction(s, { type: 'DELIVER_TASK', cardId: 't-guide-light' }))
    expect(s.cs).toBe(before)
  })
})

describe('CS 増減の理由がログに残る(RULES.md §4-5)', () => {
  it('清算のログに要件名と増減量が入る', () => {
    const s = toStandup(newGame(114))
    const after = settlePhase(s)
    const line = after.log.find((l) => l.message.includes('Must「'))!
    expect(line.message).toContain('要件定義書')
    expect(line.message).toContain(`CS-${after.config.mustMissCs}`)
  })
})
