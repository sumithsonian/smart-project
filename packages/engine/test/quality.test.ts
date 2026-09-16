/**
 * 品質リスク:Lv1 と Lv2 の意味づけ(RULES.md §2-4。Issue #5)
 */
import { describe, expect, it } from 'vitest'
import { applyAction } from '../src/applyAction'
import { requiredCubes, riskyPrerequisiteCount } from '../src/helpers'
import type { GameState } from '../src/types'
import {
  addBoardTask,
  allReady,
  apply,
  makeBoardTask,
  must,
  newGame,
  toStandup,
  withPlayer,
  withSlot,
} from './util'

/** 週末まで進めて指定タスクを納品する */
function deliverAt(state: GameState, cardId: string): GameState {
  const s = allReady(state)
  return must(applyAction(s, { type: 'DELIVER_TASK', cardId }))
}

describe('Lv1 納品と品質リスク', () => {
  it('Lv1 で納品すると品質リスクマーカーが立つ', () => {
    let s = toStandup(newGame(40))
    s = addBoardTask(s, makeBoardTask('t-sitemap-mid', { cubes: 3, actualEffort: 3 }))
    s = deliverAt(s, 't-sitemap-mid')
    const slot = s.slots.find((sl) => sl.slotId === 'sitemap')!
    expect(slot.level).toBe(1)
    expect(slot.qualityRisk).toBe(true)
    expect(s.log.some((l) => l.message.includes('品質リスクが残ります'))).toBe(true)
  })

  it('Lv2 で納品すれば品質リスクは付かない', () => {
    let s = toStandup(newGame(41))
    // 必要3 + qualityOvershoot2 = 5
    s = addBoardTask(s, makeBoardTask('t-sitemap-mid', { cubes: 5, actualEffort: 3 }))
    s = deliverAt(s, 't-sitemap-mid')
    const slot = s.slots.find((sl) => sl.slotId === 'sitemap')!
    expect(slot.level).toBe(2)
    expect(slot.qualityRisk).toBe(false)
  })

  it('上限 Lv1 のタスクは積み増しても Lv1 のまま(品質リスクが残る)', () => {
    let s = toStandup(newGame(42))
    s = addBoardTask(s, makeBoardTask('t-req-light', { cubes: 8, actualEffort: 2 }))
    s = deliverAt(s, 't-req-light')
    const slot = s.slots.find((sl) => sl.slotId === 'requirements')!
    expect(slot.level).toBe(1)
    expect(slot.qualityRisk).toBe(true)
  })
})

describe('品質リスクの解消', () => {
  it('改修(upgradeCost 到達)で Lv2 になり、品質リスクが消える', () => {
    let s = toStandup(newGame(43))
    s = withSlot(s, 'sitemap', { level: 1, qualityRisk: true, upgradeCubes: 0 })
    // 全員 direction を上げて、1週で upgradeCost(3)に届くようにする
    for (const p of s.players) {
      s = withPlayer(s, p.id, { skills: { direction: 3, design: 1, engineering: 1 } })
    }
    s = apply(s, {
      type: 'ASSIGN_WORKER',
      playerId: 'a',
      target: { kind: 'slot', slotId: 'sitemap' },
    })
    s = allReady(s)
    const slot = s.slots.find((sl) => sl.slotId === 'sitemap')!
    expect(slot.level).toBe(2)
    expect(slot.qualityRisk).toBe(false)
  })

  it('個人能力「磨き込み」でも品質リスクが消える', () => {
    let s = toStandup(newGame(44))
    s = withSlot(s, 'sitemap', { level: 1, qualityRisk: true })
    s = allReady(s) // 週末へ('c' は m-designer-polish)
    const next = must(
      applyAction(s, { type: 'USE_ABILITY', playerId: 'c', slotId: 'sitemap' }),
    )
    const slot = next.slots.find((sl) => sl.slotId === 'sitemap')!
    expect(slot.level).toBe(2)
    expect(slot.qualityRisk).toBe(false)
  })
})

describe('品質リスクの影響', () => {
  it('品質リスクのあるスロットへの手戻り対応は工数が増える', () => {
    let s = toStandup(newGame(45))
    s = withSlot(s, 'sitemap', { level: 1, qualityRisk: true })
    s = withSlot(s, 'requirements', { level: 2, qualityRisk: false })
    s = addBoardTask(
      s,
      makeBoardTask('interrupt-risky', {
        interrupt: 'rework',
        interruptEffort: 2,
        targetSlotId: 'sitemap',
        plannedWeek: null,
      }),
    )
    s = addBoardTask(
      s,
      makeBoardTask('interrupt-clean', {
        interrupt: 'rework',
        interruptEffort: 2,
        targetSlotId: 'requirements',
        plannedWeek: null,
      }),
    )
    const risky = s.board.find((t) => t.cardId === 'interrupt-risky')!
    const clean = s.board.find((t) => t.cardId === 'interrupt-clean')!
    expect(requiredCubes(s, risky)).toBe(2 + s.config.qualityRiskEffortPenalty)
    expect(requiredCubes(s, clean)).toBe(2)
  })

  it('手戻り・バグの対象は品質リスクのあるスロットが優先される', () => {
    // 3スロット納品済み。品質リスクは1つだけ → 必ずそれが選ばれる
    let s = toStandup(newGame(46))
    s = withSlot(s, 'requirements', { level: 2, qualityRisk: false })
    s = withSlot(s, 'sitemap', { level: 2, qualityRisk: false })
    s = withSlot(s, 'wireframe', { level: 1, qualityRisk: true })
    s = allReady(s)

    // 手戻りイベント(ev-design-rework)を直接発火させる
    s = {
      ...s,
      pendingEvent: { kind: 'weekend', cardId: 'ev-design-rework', targetPlayerId: null },
    }
    s = must(applyAction(s, { type: 'RESOLVE_EVENT' }))
    const rework = s.board.find((t) => t.interrupt === 'rework')!
    expect(rework.targetSlotId).toBe('wireframe')
  })

  it('品質レビューイベントは品質リスクのある成果物の数だけ CS を削る(上限つき)', () => {
    let s = toStandup(newGame(47))
    s = withSlot(s, 'requirements', { level: 1, qualityRisk: true })
    s = withSlot(s, 'sitemap', { level: 1, qualityRisk: true })
    s = withSlot(s, 'wireframe', { level: 1, qualityRisk: true })
    s = allReady(s)
    const before = s.cs
    s = {
      ...s,
      pendingEvent: { kind: 'weekend', cardId: 'ev-quality-audit', targetPlayerId: null },
    }
    s = must(applyAction(s, { type: 'RESOLVE_EVENT', choiceId: 'accept' }))
    expect(s.cs).toBe(before - 2) // maxPenalty: 2
  })

  it('品質リスクが無ければ品質レビューで指摘されない', () => {
    let s = toStandup(newGame(48))
    s = withSlot(s, 'requirements', { level: 2, qualityRisk: false })
    s = allReady(s)
    const before = s.cs
    s = {
      ...s,
      pendingEvent: { kind: 'weekend', cardId: 'ev-quality-audit', targetPlayerId: null },
    }
    s = must(applyAction(s, { type: 'RESOLVE_EVENT', choiceId: 'accept' }))
    expect(s.cs).toBe(before)
    expect(s.log.some((l) => l.message.includes('指摘なし'))).toBe(true)
  })
})

describe('雑な土台は後続を重くする(RULES.md §2-4-6)', () => {
  it('前提成果物に品質リスクがあると、後続タスクの必要工数が増える', () => {
    let s = toStandup(newGame(51))
    // t-sitemap-light の前提は requirements。Lv1(品質リスクあり)で納品済みにする
    s = withSlot(s, 'requirements', { level: 1, qualityRisk: true })
    s = addBoardTask(s, makeBoardTask('t-sitemap-light', { actualEffort: 2 }))
    const task = s.board.find((t) => t.cardId === 't-sitemap-light')!
    expect(riskyPrerequisiteCount(s, task)).toBe(1)
    expect(requiredCubes(s, task)).toBe(2 + s.config.qualityRiskPrereqPenalty)
  })

  it('前提を Lv2 で納めていれば増えない', () => {
    let s = toStandup(newGame(52))
    s = withSlot(s, 'requirements', { level: 2, qualityRisk: false })
    s = addBoardTask(s, makeBoardTask('t-sitemap-light', { actualEffort: 2 }))
    const task = s.board.find((t) => t.cardId === 't-sitemap-light')!
    expect(riskyPrerequisiteCount(s, task)).toBe(0)
    expect(requiredCubes(s, task)).toBe(2)
  })

  it('改修で前提を Lv2 にすると、後続の増加が消える', () => {
    let s = toStandup(newGame(53))
    s = withSlot(s, 'requirements', { level: 1, qualityRisk: true })
    s = addBoardTask(s, makeBoardTask('t-sitemap-light', { actualEffort: 2 }))
    const before = requiredCubes(s, s.board.find((t) => t.cardId === 't-sitemap-light')!)

    // 全員 direction を上げて1週で改修を完了させる
    for (const p of s.players) {
      s = withPlayer(s, p.id, { skills: { direction: 3, design: 1, engineering: 1 } })
    }
    s = apply(s, {
      type: 'ASSIGN_WORKER',
      playerId: 'a',
      target: { kind: 'slot', slotId: 'requirements' },
    })
    s = allReady(s)
    expect(s.slots.find((sl) => sl.slotId === 'requirements')!.qualityRisk).toBe(false)

    const after = requiredCubes(s, s.board.find((t) => t.cardId === 't-sitemap-light')!)
    expect(after).toBe(before - s.config.qualityRiskPrereqPenalty)
  })

  it('前提を持たないタスクは影響を受けない', () => {
    let s = toStandup(newGame(54))
    s = withSlot(s, 'requirements', { level: 1, qualityRisk: true })
    // t-req-light は前提なし
    s = addBoardTask(s, makeBoardTask('t-req-light', { actualEffort: 2 }))
    const task = s.board.find((t) => t.cardId === 't-req-light')!
    expect(riskyPrerequisiteCount(s, task)).toBe(0)
    expect(requiredCubes(s, task)).toBe(2)
  })

  it('割り込みカードは前提を持たないため影響を受けない', () => {
    let s = toStandup(newGame(55))
    s = withSlot(s, 'requirements', { level: 1, qualityRisk: true })
    s = addBoardTask(
      s,
      makeBoardTask('interrupt-1', {
        interrupt: 'bug',
        interruptEffort: 2,
        plannedWeek: null,
      }),
    )
    const task = s.board.find((t) => t.cardId === 'interrupt-1')!
    expect(riskyPrerequisiteCount(s, task)).toBe(0)
    expect(requiredCubes(s, task)).toBe(2)
  })
})

describe('急ぐ判断と待つ判断がどちらも成立する', () => {
  it('Lv1 で早く納めれば要件(Lv1 要求)は即達成できる', () => {
    let s = toStandup(newGame(49))
    s = addBoardTask(s, makeBoardTask('t-req-light', { cubes: 2, actualEffort: 2 }))
    s = deliverAt(s, 't-req-light')
    const req = s.requirements.find((r) => r.requirementId === 'rq-p1-reqs')!
    expect(req.met).toBe(true)
    // ただし品質リスクは残る
    expect(s.slots.find((sl) => sl.slotId === 'requirements')!.qualityRisk).toBe(true)
  })

  it('Lv2 要求の要件は Lv1 納品では達成にならない', () => {
    let s = toStandup(newGame(50))
    s = addBoardTask(s, makeBoardTask('t-sitemap-light', { cubes: 2, actualEffort: 2 }))
    s = withSlot(s, 'requirements', { level: 1 }) // 前提を満たす
    s = deliverAt(s, 't-sitemap-light')
    const req = s.requirements.find((r) => r.requirementId === 'rq-p1-map')!
    expect(req.met).toBe(false) // rq-p1-map は Lv2 要求
  })
})
