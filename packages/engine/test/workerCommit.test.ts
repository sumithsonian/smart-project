/**
 * 週次ワーカーコミット(v3.0 / rules-v3-proposal.md §1・§2)のテスト
 * - フェーズ = roundsPerPhase 週。朝会(ASSIGN_WORKER)→ 全員 Ready で週末一括適用 → 席ベース自動解決
 * - 残業(主担当+1枠。週末に疲労)/ 休憩 / 学習 / 消火 / 応援(🔥ぶん)
 * - 旧トークン系アクションは WORKER_MODE 違反
 */
import { describe, expect, it } from 'vitest'
import type { GameConfig, GameState, RuleViolation, WorkerTarget } from '../src/types'
import { isRuleViolation } from '../src/types'
import { applyAction } from '../src/applyAction'
import { apply, drainPending, newGame, PLAYERS, withPlayer } from './util'

const PM = 'a' // pm(direction Lv2)
const DIR = 'b' // director(direction Lv1 / design Lv1)
const DES = 'c' // designer(design Lv2)
const ENG = 'd' // engineer(engineering Lv2。direction Lv0)

/**
 * ワーカーモードの基本設定。
 * - fireEnabled は基本オフ(炎上ドローの乱数に依存しない)。🔥テストのみオンにして state を直接書き換える
 * - csInstantLose はオフ(タスクを解決しないテストでフェーズ終了判定の CS 減により偶発敗北しないように)
 */
const WORKER_CONFIG: Partial<GameConfig> = {
  workerCommitEnabled: true,
  csInstantLose: false,
}

/** セットアップ + 週1朝会まで進めた状態(newGame が V1_CONFIG=火・EP・MS オフを併合する) */
function newWorkerGame(seed = 42, config: Partial<GameConfig> = {}): GameState {
  return drainPending(newGame(seed, { config: { ...WORKER_CONFIG, ...config } }))
}

/** 席ターゲットの短縮記法 */
function seat(taskTileId: string, seatIndex: number): WorkerTarget {
  return { kind: 'seat', taskTileId, seatIndex }
}

/** まだの全員が DECLARE_READY する(全員揃うと週末処理=効果一括適用が走る) */
function allReady(state: GameState): GameState {
  let s = state
  for (const p of PLAYERS) {
    if (!s.readyPlayerIds.includes(p.id)) {
      s = apply(s, { type: 'DECLARE_READY', playerId: p.id })
    }
  }
  return s
}

/**
 * 今週を最後まで消化する:全員 Ready → 解決キューを消化 → 次週の週初イベント解決まで
 * (最終週なら phase_end で止まる)
 */
function finishWeek(state: GameState): GameState {
  let s = state.step === 'planning' ? allReady(state) : state
  let guard = 0
  while (guard++ < 60) {
    if (s.result !== null) break
    if (s.pendingEvent !== null) {
      s = apply(s, { type: 'RESOLVE_EVENT' })
      continue
    }
    if (s.pendingRequirementChoice !== null) {
      s = apply(s, { type: 'SELECT_REQUIREMENT_CARD', choiceIndex: 0 })
      continue
    }
    if (s.step === 'execution') {
      s = apply(s, { type: 'RESOLVE_NEXT_TASK' })
      continue
    }
    break
  }
  return s
}

/** テスト用:タスクの🔥数を直接書き換える(炎上ドローの乱数に依存しないため) */
function withFire(state: GameState, tileId: string, fire: number): GameState {
  return {
    ...state,
    taskArea: state.taskArea.map((t) => (t.tileId === tileId ? { ...t, fire } : t)),
  }
}

/** 違反コードのアサーション */
function expectViolation(result: GameState | RuleViolation, code: string): void {
  if (!isRuleViolation(result)) {
    throw new Error(`違反(${code})を期待しましたが、アクションが成功しました。`)
  }
  expect(result.code).toBe(code)
}

describe('v3.0 セットアップ', () => {
  it('週1・行動トークン0・配属なしで開始する', () => {
    const s = newWorkerGame()
    expect(s.step).toBe('planning')
    expect(s.week).toBe(1)
    expect(s.assignments).toEqual([])
    for (const p of s.players) {
      expect(p.tokens).toBe(0) // ワーカーモードに行動トークンはない
    }
  })
})

describe('朝会:配属宣言(ASSIGN_WORKER)', () => {
  it('席に配属すると assignments に載る', () => {
    const s = apply(newWorkerGame(), {
      type: 'ASSIGN_WORKER',
      playerId: DIR,
      target: seat('p1-hearing', 0),
    })
    expect(s.assignments).toEqual([
      { playerId: DIR, target: { kind: 'seat', taskTileId: 'p1-hearing', seatIndex: 0 }, overtime: false },
    ])
  })

  it('同じ席への二重占有は SEAT_UNAVAILABLE', () => {
    const s = apply(newWorkerGame(), {
      type: 'ASSIGN_WORKER',
      playerId: DIR,
      target: seat('p1-hearing', 0),
    })
    expectViolation(
      applyAction(s, { type: 'ASSIGN_WORKER', playerId: DES, target: seat('p1-hearing', 0) }),
      'SEAT_UNAVAILABLE',
    )
  })

  it('存在しない席は SEAT_UNAVAILABLE', () => {
    expectViolation(
      applyAction(newWorkerGame(), {
        type: 'ASSIGN_WORKER',
        playerId: DIR,
        target: seat('p1-hearing', 1), // p1-hearing は1席のみ
      }),
      'SEAT_UNAVAILABLE',
    )
  })

  it('主担当の二重配属は ALREADY_ASSIGNED', () => {
    const s = apply(newWorkerGame(), {
      type: 'ASSIGN_WORKER',
      playerId: DIR,
      target: seat('p1-hearing', 0),
    })
    expectViolation(
      applyAction(s, { type: 'ASSIGN_WORKER', playerId: DIR, target: { kind: 'rest' } }),
      'ALREADY_ASSIGNED',
    )
  })
})

describe('朝会:組み替え(UNASSIGN_WORKER)', () => {
  it('取り消して別の配属先に置き直せる', () => {
    let s = apply(
      newWorkerGame(),
      { type: 'ASSIGN_WORKER', playerId: DIR, target: seat('p1-hearing', 0) },
      { type: 'UNASSIGN_WORKER', playerId: DIR },
    )
    expect(s.assignments).toEqual([])
    s = apply(s, { type: 'ASSIGN_WORKER', playerId: DIR, target: { kind: 'rest' } })
    expect(s.assignments[0]!.target).toEqual({ kind: 'rest' })
  })

  it('配属がないのに取り消すと NO_ASSIGNMENT', () => {
    expectViolation(applyAction(newWorkerGame(), { type: 'UNASSIGN_WORKER', playerId: DIR }), 'NO_ASSIGNMENT')
  })

  it('残業が残っている主担当は取り消せない(先に残業を消せば取り消せる)', () => {
    let s = apply(
      newWorkerGame(),
      { type: 'ASSIGN_WORKER', playerId: DIR, target: seat('p1-hearing', 0) },
      { type: 'ASSIGN_WORKER', playerId: DIR, target: seat('p1-requirements', 1), overtime: true },
    )
    expectViolation(applyAction(s, { type: 'UNASSIGN_WORKER', playerId: DIR }), 'OVERTIME_FORBIDDEN')
    // 残業 → 主担当の順なら取り消せる
    s = apply(
      s,
      { type: 'UNASSIGN_WORKER', playerId: DIR, overtime: true },
      { type: 'UNASSIGN_WORKER', playerId: DIR },
    )
    expect(s.assignments).toEqual([])
  })
})

describe('残業', () => {
  it('主担当なしで残業はできない', () => {
    expectViolation(
      applyAction(newWorkerGame(), {
        type: 'ASSIGN_WORKER',
        playerId: DIR,
        target: seat('p1-requirements', 1),
        overtime: true,
      }),
      'OVERTIME_FORBIDDEN',
    )
  })

  it('残業枠で休憩・学習はできない', () => {
    const s = apply(newWorkerGame(), {
      type: 'ASSIGN_WORKER',
      playerId: DIR,
      target: seat('p1-hearing', 0),
    })
    expectViolation(
      applyAction(s, { type: 'ASSIGN_WORKER', playerId: DIR, target: { kind: 'rest' }, overtime: true }),
      'OVERTIME_FORBIDDEN',
    )
  })

  it('週末に overtimeFatigue の疲労が乗る', () => {
    let s = apply(
      newWorkerGame(),
      { type: 'ASSIGN_WORKER', playerId: DIR, target: seat('p1-hearing', 0) },
      { type: 'ASSIGN_WORKER', playerId: DIR, target: seat('p1-requirements', 1), overtime: true },
    )
    s = allReady(s) // 週末:効果一括適用(解決キュー消化前に疲労は確定している)
    expect(s.players.find((p) => p.id === DIR)!.fatigue).toBe(s.config.overtimeFatigue)
  })

  it('疲労Lv2 のプレイヤーは残業できない(OVERTIME_FORBIDDEN)', () => {
    let s = withPlayer(newWorkerGame(), DIR, { fatigue: 2 })
    s = apply(s, { type: 'ASSIGN_WORKER', playerId: DIR, target: seat('p1-hearing', 0) })
    expectViolation(
      applyAction(s, {
        type: 'ASSIGN_WORKER',
        playerId: DIR,
        target: seat('p1-requirements', 1),
        overtime: true,
      }),
      'OVERTIME_FORBIDDEN',
    )
  })
})

describe('週末解決(席ベース)', () => {
  it('席が埋まったタスクは解決され、成果物・コスト・疲労が担当者に適用される', () => {
    // director(direction Lv1)が p1-hearing(direction Lv1 の1席 / cost1 / fatigue1 / 成果物[Lv1])に立つ
    let s = apply(newWorkerGame(), {
      type: 'ASSIGN_WORKER',
      playerId: DIR,
      target: seat('p1-hearing', 0),
    })
    const budgetBefore = s.budget
    s = allReady(s)
    s = apply(s, { type: 'RESOLVE_NEXT_TASK' }) // キュー先頭 = p1-hearing(コンテンツ定義順)

    expect(s.taskArea.find((t) => t.tileId === 'p1-hearing')!.resolved).toBe(true)
    const dels = s.deliverables.filter((d) => d.sourceTileId === 'p1-hearing')
    expect(dels).toHaveLength(1)
    expect(dels[0]!.level).toBe(1)
    expect(dels[0]!.participants).toEqual([DIR])
    expect(s.budget).toBe(budgetBefore - 1) // cost 1
    expect(s.players.find((p) => p.id === DIR)!.fatigue).toBe(1) // fatigue 1
    expect(s.resolutionLog.at(-1)).toMatchObject({ tileId: 'p1-hearing', resolved: true, failReason: null })
  })

  it('席が埋まっていないタスクは未解決のままログに SEAT_NOT_FILLED', () => {
    let s = allReady(newWorkerGame()) // 誰も配属せず週末へ
    s = apply(s, { type: 'RESOLVE_NEXT_TASK' })
    expect(s.taskArea.find((t) => t.tileId === 'p1-hearing')!.resolved).toBe(false)
    expect(s.resolutionLog.at(-1)).toMatchObject({
      tileId: 'p1-hearing',
      resolved: false,
      failReason: 'SEAT_NOT_FILLED',
    })
  })
})

describe('専門席のスキル判定', () => {
  it('mismatchEnabled=false:スキル未達の占有者がいると SKILL_NOT_MET で未解決', () => {
    // engineer(direction Lv0)が p1-hearing の direction Lv1 席に立つ
    let s = apply(newWorkerGame(), {
      type: 'ASSIGN_WORKER',
      playerId: ENG,
      target: seat('p1-hearing', 0),
    })
    s = allReady(s)
    s = apply(s, { type: 'RESOLVE_NEXT_TASK' })
    expect(s.taskArea.find((t) => t.tileId === 'p1-hearing')!.resolved).toBe(false)
    expect(s.resolutionLog.at(-1)?.failReason).toBe('SKILL_NOT_MET')
  })

  it('mismatchEnabled=true:やっつけ解決(成果物ダウン・追加疲労・品質債務)', () => {
    // クライアントは cl-komakai(Q重み3)。understaffCsPenalty 1 × 3 = CS -3
    let s = apply(newWorkerGame(42, { mismatchEnabled: true }), {
      type: 'ASSIGN_WORKER',
      playerId: ENG,
      target: seat('p1-hearing', 0),
    })
    s = allReady(s)
    const csBefore = s.cs
    s = apply(s, { type: 'RESOLVE_NEXT_TASK' })

    expect(s.taskArea.find((t) => t.tileId === 'p1-hearing')!.resolved).toBe(true)
    // 成果物[Lv1]は1段ダウンで消失
    expect(s.deliverables.filter((d) => d.sourceTileId === 'p1-hearing')).toHaveLength(0)
    // 疲労 = タイル1 + understaffFatigue 1
    expect(s.players.find((p) => p.id === ENG)!.fatigue).toBe(2)
    expect(s.cs).toBe(csBefore - 3)
  })
})

describe('休憩・学習', () => {
  it('rest 配属で週末に疲労が restRecovery ぶん回復する', () => {
    let s = withPlayer(newWorkerGame(), DIR, { fatigue: 2 })
    s = apply(s, { type: 'ASSIGN_WORKER', playerId: DIR, target: { kind: 'rest' } })
    s = allReady(s)
    expect(s.players.find((p) => p.id === DIR)!.fatigue).toBe(0) // 2 - restRecovery(2)
  })

  it('learning 配属で週末に learningProgress+1、フェーズ終了時に +1Lv', () => {
    // engineer は direction Lv0 → 学習1週(learnWeeksPerLevel=1)で Lv1 に
    let s = apply(newWorkerGame(), {
      type: 'ASSIGN_WORKER',
      playerId: ENG,
      target: { kind: 'learning', skill: 'direction' },
    })
    s = allReady(s)
    expect(s.players.find((p) => p.id === ENG)!.learningProgress.direction).toBe(1)

    // 週1の残りを消化 → 週2 → 週3 → フェーズ終了
    s = finishWeek(s)
    s = finishWeek(s)
    s = finishWeek(s)
    expect(s.step).toBe('phase_end')
    const eng = s.players.find((p) => p.id === ENG)!
    expect(eng.skills.direction).toBe(1) // 学習1週 × learnWeeksPerLevel(1) = +1Lv
    expect(eng.learningProgress.direction).toBe(0) // 消費済み
  })
})

describe('週の進行', () => {
  it('週1→2→3 と進み、3週の消化で phase_end に到達する', () => {
    let s = apply(newWorkerGame(), { type: 'ASSIGN_WORKER', playerId: DIR, target: { kind: 'rest' } })
    expect(s.week).toBe(1)

    s = finishWeek(s)
    expect(s.step).toBe('planning')
    expect(s.week).toBe(2)
    expect(s.assignments).toEqual([]) // 週送りで配属クリア
    expect(s.readyPlayerIds).toEqual([]) // Ready もリセット

    s = finishWeek(s)
    expect(s.week).toBe(3)
    expect(s.assignments).toEqual([])
    expect(s.readyPlayerIds).toEqual([])

    s = finishWeek(s)
    expect(s.step).toBe('phase_end')
  })

  it('ADVANCE_PHASE で次フェーズの週1に戻る', () => {
    let s = newWorkerGame()
    s = finishWeek(s)
    s = finishWeek(s)
    s = finishWeek(s)
    expect(s.step).toBe('phase_end')
    s = drainPending(apply(s, { type: 'ADVANCE_PHASE' }))
    expect(s.phase).toBe(2)
    expect(s.week).toBe(1)
    expect(s.step).toBe('planning')
    expect(s.assignments).toEqual([])
  })
})

describe('追加請求(PM のフリーアクション)', () => {
  it('PM 以外は NOT_PM', () => {
    expectViolation(applyAction(newWorkerGame(), { type: 'EXTRA_BILLING', playerId: DIR }), 'NOT_PM')
  })

  it('PM はトークンなしで実行でき、フェーズ2回目は EXTRA_BILLING_LIMIT', () => {
    let s = newWorkerGame()
    const budgetBefore = s.budget
    const csBefore = s.cs
    s = apply(s, { type: 'EXTRA_BILLING', playerId: PM })
    expect(s.budget).toBe(budgetBefore + s.config.extraBillingBudget)
    expect(s.cs).toBe(csBefore - 1) // extraBillingCsCost 1 × C重み1(cl-komakai)
    expect(s.extraBillingUsedThisPhase).toBe(1)
    expect(s.players.find((p) => p.id === PM)!.tokens).toBe(0) // トークンは使わない
    expectViolation(applyAction(s, { type: 'EXTRA_BILLING', playerId: PM }), 'EXTRA_BILLING_LIMIT')
  })
})

describe('旧トークン系アクションの禁止', () => {
  it('PLACE_TOKEN / RETRIEVE_TOKEN / REST / EXTINGUISH_FIRE / DECLARE_TASK_ORDER は WORKER_MODE 違反', () => {
    const s = newWorkerGame()
    expectViolation(
      applyAction(s, { type: 'PLACE_TOKEN', playerId: DIR, target: { kind: 'task', taskTileId: 'p1-hearing' } }),
      'WORKER_MODE',
    )
    expectViolation(
      applyAction(s, { type: 'RETRIEVE_TOKEN', playerId: DIR, target: { kind: 'task', taskTileId: 'p1-hearing' } }),
      'WORKER_MODE',
    )
    expectViolation(applyAction(s, { type: 'REST', playerId: DIR }), 'WORKER_MODE')
    expectViolation(
      applyAction(s, { type: 'EXTINGUISH_FIRE', playerId: DIR, taskTileId: 'p1-hearing' }),
      'WORKER_MODE',
    )
    expectViolation(applyAction(s, { type: 'DECLARE_TASK_ORDER', playerId: PM, order: [] }), 'WORKER_MODE')
  })
})

describe('🔥:応援(support)と消火(extinguish)', () => {
  // 炎上ドローの乱数に依存しないよう、🔥は state を直接書き換えてセットする
  it('席が埋まっていても support 不足なら NOT_ENOUGH_SUPPORT で未解決', () => {
    let s = withFire(newWorkerGame(42, { fireEnabled: true }), 'p1-hearing', 1)
    s = apply(s, { type: 'ASSIGN_WORKER', playerId: DIR, target: seat('p1-hearing', 0) })
    s = allReady(s)
    s = apply(s, { type: 'RESOLVE_NEXT_TASK' })
    expect(s.taskArea.find((t) => t.tileId === 'p1-hearing')!.resolved).toBe(false)
    expect(s.resolutionLog.at(-1)?.failReason).toBe('NOT_ENOUGH_SUPPORT')
  })

  it('🔥ぶんの応援を置けば解決され、応援者も参加者になる', () => {
    let s = withFire(newWorkerGame(42, { fireEnabled: true }), 'p1-hearing', 1)
    s = apply(
      s,
      { type: 'ASSIGN_WORKER', playerId: DIR, target: seat('p1-hearing', 0) },
      { type: 'ASSIGN_WORKER', playerId: DES, target: { kind: 'support', taskTileId: 'p1-hearing' } },
    )
    s = allReady(s)
    s = apply(s, { type: 'RESOLVE_NEXT_TASK' })
    expect(s.taskArea.find((t) => t.tileId === 'p1-hearing')!.resolved).toBe(true)
    const del = s.deliverables.find((d) => d.sourceTileId === 'p1-hearing')!
    expect(del.participants).toEqual(expect.arrayContaining([DIR, DES]))
  })

  it('🔥数を超える応援は NO_SUPPORT_DEMAND', () => {
    let s = withFire(newWorkerGame(42, { fireEnabled: true }), 'p1-hearing', 1)
    s = apply(s, { type: 'ASSIGN_WORKER', playerId: DES, target: { kind: 'support', taskTileId: 'p1-hearing' } })
    expectViolation(
      applyAction(s, { type: 'ASSIGN_WORKER', playerId: ENG, target: { kind: 'support', taskTileId: 'p1-hearing' } }),
      'NO_SUPPORT_DEMAND',
    )
  })

  it('extinguish 配属で週末に🔥が1減る', () => {
    let s = withFire(newWorkerGame(42, { fireEnabled: true }), 'p1-hearing', 1)
    s = apply(s, { type: 'ASSIGN_WORKER', playerId: DES, target: { kind: 'extinguish', taskTileId: 'p1-hearing' } })
    s = allReady(s) // 消火は週末(タスク解決より先)に適用される
    expect(s.taskArea.find((t) => t.tileId === 'p1-hearing')!.fire).toBe(0)
    expect(s.players.find((p) => p.id === DES)!.extinguishCount).toBe(1)
  })

  it('🔥のないタスクへの消火宣言は NO_FIRE', () => {
    const s = withFire(newWorkerGame(42, { fireEnabled: true }), 'p1-hearing', 0)
    expectViolation(
      applyAction(s, { type: 'ASSIGN_WORKER', playerId: DES, target: { kind: 'extinguish', taskTileId: 'p1-hearing' } }),
      'NO_FIRE',
    )
  })
})
