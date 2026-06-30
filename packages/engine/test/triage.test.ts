/**
 * 配属トリアージ(v2.2 / rules-v2-proposal.md §2)のテスト
 * - やっつけ解決(mismatchEnabled):スキル未達でも代償付きで解決
 * - 過剰スペック割引(overqualifiedDiscount)
 * - 外注(outsource):予算+CS で専門席を充足し、やっつけ代償を回避
 */
import { describe, expect, it } from 'vitest'
import type { GameAction, GameState } from '../src/types'
import { apply, newGame, PLAYERS } from './util'
import { applyAction } from '../src/applyAction'

const PM = 'a' // pm(direction Lv2)
const ENG = 'd' // engineer(direction Lv0 → p1-hearing の direction Lv1 を満たさない)

/** p1-hearing(direction Lv1 / 必要トークン2 / 成果物[1] / コスト1)を指定プレイヤーで充足して先頭解決させる */
function placeAndOrder(state: GameState, placer: string): GameState {
  let s = apply(
    state,
    { type: 'PLACE_TOKEN', playerId: placer, target: { kind: 'task', taskTileId: 'p1-hearing' } },
    { type: 'PLACE_TOKEN', playerId: placer, target: { kind: 'task', taskTileId: 'p1-hearing' } },
  )
  for (const p of PLAYERS) s = apply(s, { type: 'DECLARE_READY', playerId: p.id })
  // 未解決タスク全部を含む依存順(p1-hearing を先頭に)
  const order = [
    'p1-hearing',
    'p1-research',
    'p1-sitemap',
    'p1-requirements',
    'p1-estimate',
  ]
  return apply(s, { type: 'DECLARE_TASK_ORDER', playerId: PM, order })
}

const TRIAGE = {
  mismatchEnabled: true,
  understaffFatigue: 1,
  understaffDowngrade: true,
  understaffCsPenalty: 1,
  overqualifiedDiscount: 1,
} as const

describe('配属トリアージ:やっつけ解決', () => {
  it('mismatchEnabled=false ではスキル未達タスクは解決失敗のまま', () => {
    let s = newGame(42, { config: { mismatchEnabled: false } })
    s = placeAndOrder(s, ENG)
    s = apply(s, { type: 'RESOLVE_NEXT_TASK' })
    const inst = s.taskArea.find((t) => t.tileId === 'p1-hearing')!
    expect(inst.resolved).toBe(false)
    expect(s.resolutionLog.at(-1)?.failReason).toBe('SKILL_NOT_MET')
  })

  it('mismatchEnabled=true ではやっつけ解決:成果物ダウン+追加疲労+CS債務', () => {
    // クライアントは cl-komakai(Q重み3)。understaffCsPenalty 1 × 3 = CS -3
    let s = newGame(42, { config: TRIAGE })
    const csBefore = s.cs
    s = placeAndOrder(s, ENG)
    s = apply(s, { type: 'RESOLVE_NEXT_TASK' })

    const inst = s.taskArea.find((t) => t.tileId === 'p1-hearing')!
    expect(inst.resolved).toBe(true)
    // 成果物[1] は1段ダウンで消失 → このタスク由来の成果物は増えない
    expect(s.deliverables.filter((d) => d.sourceTileId === 'p1-hearing')).toHaveLength(0)
    // 参加者(engineer)の疲労 = タイル疲労1 + understaffFatigue 1 = 2
    expect(s.players.find((p) => p.id === ENG)!.fatigue).toBe(2)
    // 品質債務 CS -3(Q重み3)
    expect(s.cs).toBe(csBefore - 3)
  })

  it('understaffDowngrade=false なら成果物は維持される', () => {
    let s = newGame(42, { config: { ...TRIAGE, understaffDowngrade: false } })
    s = placeAndOrder(s, ENG)
    s = apply(s, { type: 'RESOLVE_NEXT_TASK' })
    expect(s.deliverables.filter((d) => d.sourceTileId === 'p1-hearing')).toHaveLength(1)
  })
})

describe('配属トリアージ:過剰スペック割引', () => {
  it('必要Lvを超える参加者がいれば実行コストが割引される', () => {
    // PM(direction Lv2)が p1-hearing(必要 direction Lv1)に参加 → 2>1 で割引
    let s = newGame(42, { config: TRIAGE })
    const budgetBefore = s.budget
    s = placeAndOrder(s, PM)
    s = apply(s, { type: 'RESOLVE_NEXT_TASK' })
    // コスト1 - 割引1 = 0 → 予算は変わらない
    expect(s.budget).toBe(budgetBefore)
    expect(s.taskArea.find((t) => t.tileId === 'p1-hearing')!.resolved).toBe(true)
  })

  it('ちょうど必要Lvの参加者なら割引なし(コストどおり)', () => {
    // director 'b'(direction Lv1)= ちょうど。コスト1ぶん予算が減る
    let s = newGame(42, { config: TRIAGE })
    const budgetBefore = s.budget
    s = placeAndOrder(s, 'b')
    s = apply(s, { type: 'RESOLVE_NEXT_TASK' })
    expect(s.budget).toBe(budgetBefore - 1)
  })
})

describe('配属トリアージ:外注', () => {
  it('外注で予算+CS を払い、やっつけ代償なしで解決できる', () => {
    // クライアント cl-komakai(C重み1)。outsourceCsCost 1 × 1 = CS -1、予算 -4
    let s = newGame(42, { config: { ...TRIAGE, outsourceEnabled: true } })
    const csBefore = s.cs
    const budgetBefore = s.budget
    s = apply(s, { type: 'OUTSOURCE_TASK', playerId: PM, taskTileId: 'p1-hearing' })
    expect(s.budget).toBe(budgetBefore - 4)
    expect(s.cs).toBe(csBefore - 1)
    expect(s.taskArea.find((t) => t.tileId === 'p1-hearing')!.outsourced).toBe(true)

    // 無資格(engineer)でもフル品質で解決(成果物維持・追加疲労なし・債務なし)
    const csAfterOutsource = s.cs
    s = placeAndOrder(s, ENG)
    s = apply(s, { type: 'RESOLVE_NEXT_TASK' })
    const inst = s.taskArea.find((t) => t.tileId === 'p1-hearing')!
    expect(inst.resolved).toBe(true)
    expect(s.deliverables.filter((d) => d.sourceTileId === 'p1-hearing')).toHaveLength(1)
    expect(s.players.find((p) => p.id === ENG)!.fatigue).toBe(1) // タイル疲労のみ
    expect(s.cs).toBe(csAfterOutsource) // やっつけ債務は発生しない
  })

  it('フェーズ外注上限を超えると違反になる', () => {
    let s = newGame(42, { config: { ...TRIAGE, outsourceEnabled: true, outsourcePerPhase: 1 } })
    s = apply(s, { type: 'OUTSOURCE_TASK', playerId: PM, taskTileId: 'p1-hearing' })
    const second = applyAction(s, {
      type: 'OUTSOURCE_TASK',
      playerId: PM,
      taskTileId: 'p1-requirements',
    } satisfies GameAction)
    expect('code' in second && second.code).toBe('OUTSOURCE_LIMIT')
  })

  it('outsourceEnabled=false では外注できない', () => {
    const s = newGame(42, { config: { ...TRIAGE, outsourceEnabled: false } })
    const r = applyAction(s, { type: 'OUTSOURCE_TASK', playerId: PM, taskTileId: 'p1-hearing' })
    expect('code' in r && r.code).toBe('OUTSOURCE_DISABLED')
  })

  it('専門席のないタスク(スキル条件なし・秘匿要件なし)は外注できない', () => {
    // p1-research はスキル条件なし・秘匿要件なし
    const s = newGame(42, { config: { ...TRIAGE, outsourceEnabled: true } })
    const r = applyAction(s, { type: 'OUTSOURCE_TASK', playerId: PM, taskTileId: 'p1-research' })
    expect('code' in r && r.code).toBe('NO_SKILL_SEAT')
  })
})
