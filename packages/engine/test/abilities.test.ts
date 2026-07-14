/**
 * 個人能力(メンバーカード。USE_ABILITY)(rules-v4-core.md §3)
 */
import { describe, expect, it } from 'vitest'
import { applyAction } from '../src/applyAction'
import { requiredCubes } from '../src/helpers'
import { isRuleViolation } from '../src/types'
import { addBoardTask, allReady, makeBoardTask, must, newGame, toStandup, withSlot } from './util'

describe('expedite(段取り)', () => {
  it('朝会で宣言すると今週の積むキューブ+1になる(朝会以外では使えない)', () => {
    let state = toStandup(newGame(100))
    state = addBoardTask(state, makeBoardTask('t-req-light'))

    // 週末での使用はNG
    const atWeekend = allReady(state)
    const wrongStep = applyAction(atWeekend, { type: 'USE_ABILITY', playerId: 'a' })
    expect(isRuleViolation(wrongStep) && wrongStep.code).toBe('INVALID_STEP')

    // 朝会で使用 → 'a'(direction 2)のキューブは+1
    let s = must(applyAction(state, { type: 'USE_ABILITY', playerId: 'a' }))
    expect(s.expeditedPlayerIds).toContain('a')
    s = must(
      applyAction(s, {
        type: 'ASSIGN_WORKER',
        playerId: 'a',
        target: { kind: 'task', cardId: 't-req-light' },
      }),
    )
    s = allReady(s)
    const task = s.board.find((b) => b.cardId === 't-req-light')!
    expect(task.cubes).toBe(3) // direction2 + expedite1
  })

  // バグ疑い(要仕様確認):RULES.md は「段取り:今週自分の積むキューブ+1」と1週間に一度の
  // フラットな+1として書かれているが、実装(weekend.ts の cubesFor)は
  // expeditedPlayerIds に含まれるかどうかだけを見て「配属レコードごと」に+1を足している。
  // そのため、段取りを宣言したプレイヤーが同じ週に残業も使う(主担当+残業で2枠埋める)と、
  // +1ではなく+2相当の恩恵になってしまう。
  // 再現:USE_ABILITY(expedite) → ASSIGN_WORKER(task) → ASSIGN_WORKER(task, overtime:true) → 全員Ready
  //   → 'a'(direction2)のcubesは (2+1)+(2+1)=6 になる(意図はおそらく (2+2)+1=5)。
  // ルール文の意図(週1回のフラット+1 か、座るたび+1か)を確認のうえ修正を検討してください。
  it('段取りは残業と併用しても+1のフラットボーナス(週1回。配属ごとに二重加算されない)', () => {
    let state = toStandup(newGame(105))
    state = addBoardTask(state, makeBoardTask('t-req-light'))
    state = must(applyAction(state, { type: 'USE_ABILITY', playerId: 'a' }))
    state = must(
      applyAction(state, {
        type: 'ASSIGN_WORKER',
        playerId: 'a',
        target: { kind: 'task', cardId: 't-req-light' },
      }),
    )
    state = must(
      applyAction(state, {
        type: 'ASSIGN_WORKER',
        playerId: 'a',
        target: { kind: 'task', cardId: 't-req-light' },
        overtime: true,
      }),
    )
    state = allReady(state)
    const task = state.board.find((b) => b.cardId === 't-req-light')!
    // 意図どおりなら (direction2 + direction2) + expedite1 = 5 になるはず
    expect(task.cubes).toBe(5)
  })
})

describe('polish(磨き込み)', () => {
  it('週末に納品済みLv1スロットをLv2にできる(対象不正はNG)', () => {
    let state = toStandup(newGame(101))
    state = withSlot(state, 'sitemap', { level: 1, reworkCubes: 0 })
    state = allReady(state) // 何もせず週末へ

    // 対象不正:Lv0のスロット
    const invalid = applyAction(state, { type: 'USE_ABILITY', playerId: 'c', slotId: 'wireframe' })
    expect(isRuleViolation(invalid) && invalid.code).toBe('INVALID_TARGET')

    // 'c'(polish持ち)が sitemap を Lv2 にする
    const s = must(applyAction(state, { type: 'USE_ABILITY', playerId: 'c', slotId: 'sitemap' }))
    expect(s.slots.find((sl) => sl.slotId === 'sitemap')!.level).toBe(2)
  })
})

describe('automate(自動化)', () => {
  it('未納品タスクの必要工数を-1する', () => {
    let state = toStandup(newGame(102))
    state = addBoardTask(state, makeBoardTask('t-cms-mid')) // effort3
    const s = must(applyAction(state, { type: 'USE_ABILITY', playerId: 'd', cardId: 't-cms-mid' }))
    const task = s.board.find((b) => b.cardId === 't-cms-mid')!
    expect(requiredCubes(s, task)).toBe(3 - 1)
  })
})

describe('multitask(マルチタスク)', () => {
  it('パッシブ能力のためUSE_ABILITYできない', () => {
    const state = toStandup(newGame(103))
    const r = applyAction(state, { type: 'USE_ABILITY', playerId: 'b' })
    expect(isRuleViolation(r) && r.code).toBe('INVALID_TARGET')
  })
})

describe('個人能力の使用回数', () => {
  it('フェーズに1回まで', () => {
    let state = toStandup(newGame(104))
    state = addBoardTask(state, makeBoardTask('t-cms-mid'))
    const s = must(applyAction(state, { type: 'USE_ABILITY', playerId: 'd', cardId: 't-cms-mid' }))
    const r = applyAction(s, { type: 'USE_ABILITY', playerId: 'd', cardId: 't-cms-mid' })
    expect(isRuleViolation(r) && r.code).toBe('LIMIT_REACHED')
  })
})
