/**
 * 割り込みレーン:専門スキル・キャパシティ・謝絶(RULES.md §8-4。Issue #7)
 */
import { describe, expect, it } from 'vitest'
import { applyAction } from '../src/applyAction'
import { isRuleViolation } from '../src/types'
import { cubesForTask, taskSkill } from '../src/helpers'
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

describe('割り込みへの配属は専門スキルを要求する', () => {
  it('必要スキルが 0 のプレイヤーは座れない', () => {
    let s = toStandup(newGame(90))
    s = addBoardTask(
      s,
      makeBoardTask('interrupt-1', {
        interrupt: 'bug',
        interruptEffort: 2,
        interruptSkill: 'engineering',
        plannedWeek: null,
      }),
    )
    // 'c'(m-designer-polish)は engineering 0
    const r = applyAction(s, {
      type: 'ASSIGN_WORKER',
      playerId: 'c',
      target: { kind: 'task', cardId: 'interrupt-1' },
    })
    expect(isRuleViolation(r) && r.code).toBe('SKILL_ZERO')

    // 'd'(m-engineer-automate)は engineering 2
    const ok = must(
      applyAction(s, {
        type: 'ASSIGN_WORKER',
        playerId: 'd',
        target: { kind: 'task', cardId: 'interrupt-1' },
      }),
    )
    expect(ok.assignments).toHaveLength(1)
  })

  it('必要スキルの積む量はそのスキル値ぶん(系統不問なら最高スキル)', () => {
    let s = toStandup(newGame(91))
    s = withPlayer(s, 'd', { skills: { direction: 0, design: 1, engineering: 3 } })
    s = addBoardTask(
      s,
      makeBoardTask('int-eng', {
        interrupt: 'bug',
        interruptEffort: 2,
        interruptSkill: 'engineering',
        plannedWeek: null,
      }),
    )
    s = addBoardTask(
      s,
      makeBoardTask('int-any', {
        interrupt: 'consult',
        interruptEffort: 2,
        interruptSkill: null,
        rewardBudget: 2,
        plannedWeek: null,
      }),
    )
    const eng = s.board.find((t) => t.cardId === 'int-eng')!
    const any = s.board.find((t) => t.cardId === 'int-any')!
    expect(taskSkill(s, eng)).toBe('engineering')
    expect(taskSkill(s, any)).toBeNull()
    expect(cubesForTask(s, 'd', eng)).toBe(3)
    expect(cubesForTask(s, 'd', any)).toBe(3) // 最高スキル
  })

  it('専門家は計画タスクと割り込みのどちらかにしか置けない(取り合いが起きる)', () => {
    let s = toStandup(newGame(92))
    s = withSlot(s, 'design-comp', { level: 0 })
    s = addBoardTask(s, makeBoardTask('t-design-light', { plannedWeek: 1 }))
    s = withSlot(s, 'wireframe', { level: 1 }) // 前提を満たす
    s = addBoardTask(
      s,
      makeBoardTask('int-design', {
        interrupt: 'rework',
        interruptEffort: 2,
        targetSlotId: 'design-comp',
        plannedWeek: null,
      }),
    )
    // 'c' はデザイン2。片方に置いたらもう片方には主担当としては置けない
    s = apply(s, {
      type: 'ASSIGN_WORKER',
      playerId: 'c',
      target: { kind: 'task', cardId: 't-design-light' },
    })
    const conflict = applyAction(s, {
      type: 'ASSIGN_WORKER',
      playerId: 'c',
      target: { kind: 'task', cardId: 'int-design' },
    })
    expect(isRuleViolation(conflict) && conflict.code).toBe('ALREADY_ASSIGNED')
  })
})

describe('キャパシティとあふれ', () => {
  it('割り込みが満杯のときの新規差し込みはあふれて CS が減る', () => {
    let s = allReady(toStandup(newGame(93)))
    for (let i = 0; i < s.config.interruptCapacity; i++) {
      s = addBoardTask(
        s,
        makeBoardTask(`int-${i}`, {
          interrupt: 'bug',
          interruptEffort: 2,
          plannedWeek: null,
        }),
      )
    }
    const before = s.cs
    s = { ...s, pendingEvent: { kind: 'weekend', cardId: 'ev-consult', targetPlayerId: null } }
    s = must(applyAction(s, { type: 'RESOLVE_EVENT' }))
    expect(s.cs).toBe(before - s.config.overflowCs)
    expect(s.board.filter((t) => t.interrupt !== null)).toHaveLength(s.config.interruptCapacity)
    expect(s.log.some((l) => l.message.includes('あふれた'))).toBe(true)
  })
})

describe('謝絶(DECLINE_INTERRUPT)', () => {
  it('あふれ(-2)より安い CS で選んで断れる', () => {
    let s = toStandup(newGame(94))
    s = addBoardTask(
      s,
      makeBoardTask('int-1', { interrupt: 'bug', interruptEffort: 2, plannedWeek: null }),
    )
    const before = s.cs
    s = must(applyAction(s, { type: 'DECLINE_INTERRUPT', playerId: 'a', cardId: 'int-1' }))
    expect(s.cs).toBe(before - s.config.declineCs)
    expect(s.config.declineCs).toBeLessThan(s.config.overflowCs)
    expect(s.board.some((t) => t.cardId === 'int-1')).toBe(false)
  })

  it('手戻りを謝絶すると要件の判定が復帰する', () => {
    let s = toStandup(newGame(95))
    s = withSlot(s, 'requirements', { level: 1 })
    s = addBoardTask(
      s,
      makeBoardTask('int-rework', {
        interrupt: 'rework',
        interruptEffort: 2,
        targetSlotId: 'requirements',
        plannedWeek: null,
      }),
    )
    s = must(applyAction(s, { type: 'DECLINE_INTERRUPT', playerId: 'a', cardId: 'int-rework' }))
    expect(s.requirements.find((r) => r.requirementId === 'rq-p1-reqs')!.met).toBe(true)
  })

  it('計画タスクは謝絶できない(見送りで外す)', () => {
    let s = toStandup(newGame(96))
    s = addBoardTask(s, makeBoardTask('t-req-light', { plannedWeek: 1 }))
    const r = applyAction(s, {
      type: 'DECLINE_INTERRUPT',
      playerId: 'a',
      cardId: 't-req-light',
    })
    expect(isRuleViolation(r) && r.code).toBe('NOT_FOUND')
  })

  it('PM 以外は謝絶できない', () => {
    let s = toStandup(newGame(97))
    s = addBoardTask(
      s,
      makeBoardTask('int-1', { interrupt: 'bug', interruptEffort: 2, plannedWeek: null }),
    )
    const r = applyAction(s, { type: 'DECLINE_INTERRUPT', playerId: 'b', cardId: 'int-1' })
    expect(isRuleViolation(r) && r.code).toBe('NOT_PM')
  })
})

describe('放置コストが種別ごとに違う(トリアージ)', () => {
  it('相談ごとはフェーズ末に自然消滅し、バグは CS 出血する', () => {
    let s = toStandup(newGame(98))
    s = addBoardTask(
      s,
      makeBoardTask('int-bug', { interrupt: 'bug', interruptEffort: 2, plannedWeek: null }),
    )
    s = addBoardTask(
      s,
      makeBoardTask('int-consult', {
        interrupt: 'consult',
        interruptEffort: 2,
        rewardBudget: 2,
        plannedWeek: null,
      }),
    )
    // 最終週まで進める
    let guard = 0
    while (s.step !== 'phase_end' && s.result === null && guard++ < 10) {
      s = allReady(s)
      s = must(applyAction(s, { type: 'END_WEEKEND', playerId: 'a' }))
      let inner = 0
      while (s.pendingEvent !== null && inner++ < 10) {
        const card = s.content.events.find((e) => e.id === s.pendingEvent!.cardId)
        s = must(
          applyAction(s, { type: 'RESOLVE_EVENT', choiceId: card?.choices?.[0]?.id }),
        )
      }
      if (s.step === 'weekend') {
        s = must(applyAction(s, { type: 'END_WEEKEND', playerId: 'a' }))
      }
    }
    expect(s.step).toBe('phase_end')
    expect(s.board.some((t) => t.interrupt === 'consult')).toBe(false)
    expect(s.log.some((l) => l.message.includes('バグを放置'))).toBe(true)
  })
})
