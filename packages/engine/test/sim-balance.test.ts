/**
 * v3.0 週次ワーカーコミットのバランス計測シミュレーション(プレイテスト用ボット)
 *
 * 目的:実際にプレイするボットを3戦略ぶん実装し、シード1〜30で自動対戦させて
 * 勝率・敗因・CS/予算の推移・専門席の詰まり具合などを定量測定する。
 * テストはクラッシュしないことのみを expect し、集計結果は console.table の出力から読み取る。
 *
 * 触ってよいファイルはこのファイルのみ(src/ と他のテストは変更しない。読むだけ)。
 */
import { describe, expect, it } from 'vitest'
import type {
  GameAction,
  GameConfig,
  GameState,
  PlayerState,
  Role,
  SkillKind,
  TaskTile,
} from '../src/types'
import { isRuleViolation } from '../src/types'
import { applyAction } from '../src/applyAction'
import { createInitialState } from '../src/initialState'
import { getTile, seatOccupants, supportCount } from '../src/helpers'
import { PLAYERS } from './util'

// このプロジェクトの tsconfig は "types": [] (node/dom 型なし)なので、
// 集計結果を確認するための console.log / console.table にだけ最小限の型を与える。
declare global {
  // eslint-disable-next-line no-var
  const console: { log: (...args: unknown[]) => void; table: (...args: unknown[]) => void }
}

type Strategy = 'A' | 'B' | 'C'

/** 総アクション数の打ち切り上限(無限ループ防止。到達したら重大バグとして扱う) */
const ACTION_LIMIT = 2000

const SKILLS: SkillKind[] = ['direction', 'design', 'engineering']

/** 育成重視(戦略C)で「主系統」とみなすスキル(ロールの初期値が最も高い系統) */
const ROLE_MAIN_SKILL: Record<Role, SkillKind> = {
  pm: 'direction',
  director: 'direction',
  designer: 'design',
  engineer: 'engineering',
}

/** そのプレイヤーの「非主系統」のうち最もレベルが低いスキル(育成優先度) */
function secondarySkill(player: PlayerState): SkillKind {
  const main = ROLE_MAIN_SKILL[player.role]
  const candidates = SKILLS.filter((s) => s !== main)
  return candidates.reduce((best, s) => (player.skills[s] < player.skills[best] ? s : best))
}

/** 配列を index から始まる順に回転させる(学習担当のローテーション用) */
function rotationStartingAt<T>(list: T[], index: number): T[] {
  const n = list.length
  const start = ((index % n) + n) % n
  return [...list.slice(start), ...list.slice(0, start)]
}

/**
 * 依存関係を満たしている(親が解決済み or 存在しない)未解決タスク一覧。
 * taskArea は解決済みタスクを除いて次フェーズにも持ち越されるため、
 * 古いフェーズの積み残しタスクも含めて古い順(コンテンツ定義順)に並べる。
 */
function readyTasks(state: GameState): Array<{ tile: TaskTile }> {
  const contentOrder = new Map(state.content.tasks.map((t, i) => [t.id, i]))
  return state.taskArea
    .filter((instance) => !instance.resolved)
    .map((instance) => ({ tile: getTile(state.content, instance.tileId)! }))
    .filter(({ tile }) =>
      tile.dependsOn.every((dep) => {
        const depInstance = state.taskArea.find((t) => t.tileId === dep)
        return depInstance === undefined || depInstance.resolved
      }),
    )
    .sort((a, b) => (contentOrder.get(a.tile.id) ?? 0) - (contentOrder.get(b.tile.id) ?? 0))
}

interface PhaseRecord {
  phase: number
  unresolvedCount: number
  deadlineMet: boolean
  qualityMet: boolean
  csDelta: number
}

interface GameMetrics {
  seed: number
  strategy: Strategy
  clientId: string
  outcome: 'win' | 'lose'
  loseKind: 'none' | 'instant_cs' | 'final_judgement'
  finalCs: number
  minCs: number
  finalBudget: number
  minBudget: number
  phases: PhaseRecord[]
  limitEventCount: number
  overtimeCount: number
  yatsukeCount: number
  skillUpCount: number
  extraBillingCount: number
  outsourceCount: number
  finalUnresolvedTileIds: string[]
  actionCount: number
  truncated: boolean
}

/**
 * 1ゲームをボットにプレイさせる。
 * strategy: 'A'=堅実 / 'B'=全力(やっつけ+残業。mismatchEnabled) / 'C'=育成重視(第1〜2フェーズ学習優先)
 */
function runGame(
  seed: number,
  strategy: Strategy,
  configOverrides: Partial<GameConfig> = {},
): GameMetrics {
  let state: GameState = createInitialState()
  let actionCount = 0
  let truncated = false
  let minCs = Infinity
  let minBudget = Infinity
  let limitEventCount = 0
  let overtimeCount = 0
  let yatsukeCount = 0
  let extraBillingCount = 0
  const phases: PhaseRecord[] = []

  /** アクションを適用する。違反はボットのバグとして例外化。打ち切り上限到達時は false を返す */
  const act = (action: GameAction): boolean => {
    // ゲームがすでに終了している(CS即死など)場合は、以降のボットの手番操作を静かに諦める。
    // これは GAME_FINISHED 違反であり、ボットのバグではなく正常な終局処理。
    if (state.result !== null) return false
    if (actionCount >= ACTION_LIMIT) {
      truncated = true
      return false
    }
    const next = applyAction(state, action)
    actionCount++
    if (isRuleViolation(next)) {
      throw new Error(
        `[seed=${seed} strategy=${strategy} week=${state.week} phase=${state.phase}] ` +
          `ルール違反: ${next.code}: ${next.message}(action=${JSON.stringify(action)})`,
      )
    }
    state = next
    minCs = Math.min(minCs, state.cs)
    minBudget = Math.min(minBudget, state.budget)
    return true
  }

  const config: Partial<GameConfig> = {
    workerCommitEnabled: true,
    mismatchEnabled: strategy === 'B',
    ...configOverrides,
  }

  // クライアント/プロジェクトカードは指定せず、シードの乱数でランダムに引かせる
  // (「デフォルト」= SETUP_GAME の省略時仕様に従う。プロジェクトシートは現状 ps-standard の1種類のみ)
  act({
    type: 'SETUP_GAME',
    seed,
    players: PLAYERS,
    config,
  })

  // ── 個人目標選択(デフォルト設定は personalGoalChoices=2 なので必ず通る) ──
  while (!truncated && state.step === 'goal_selection') {
    const pending = state.players.find((p) => p.personalGoalId === '')
    if (!pending) break
    act({ type: 'SELECT_PERSONAL_GOAL', playerId: pending.id, choiceIndex: 0 })
  }

  /** 解決待ち(大炎上ターゲット選択 / イベント / 秘匿要件)をすべて処理する */
  const drain = (): void => {
    let guard = 0
    while (!truncated && state.result === null && guard++ < 200) {
      if (state.pendingEpidemicCount > 0) {
        const pm = state.players.find((p) => p.role === 'pm')!
        const target = state.taskArea.find((t) => !t.resolved)
        if (!target) break
        act({ type: 'SELECT_EPIDEMIC_TARGET', playerId: pm.id, taskTileId: target.tileId })
        continue
      }
      if (state.pendingEvent !== null) {
        if (state.pendingEvent.kind === 'limit') limitEventCount++
        act({ type: 'RESOLVE_EVENT' })
        continue
      }
      if (state.pendingRequirementChoice !== null) {
        act({ type: 'SELECT_REQUIREMENT_CARD', choiceIndex: 0 })
        continue
      }
      break
    }
  }

  drain()

  /** 朝会(週の配属)を1週ぶん行い、全員 Ready を宣言する */
  const planWeek = (): void => {
    // 0. 追加請求(PM のフリーアクション)。予算が心もとない時だけ使う。フェーズ上限あり
    if (state.budget < 5 && state.extraBillingUsedThisPhase < state.config.extraBillingPerPhase) {
      const pm = state.players.find((p) => p.role === 'pm')!
      if (act({ type: 'EXTRA_BILLING', playerId: pm.id })) extraBillingCount++
    }

    const pool = new Set(state.players.map((p) => p.id))
    const playerOf = (id: string): PlayerState => state.players.find((p) => p.id === id)!

    // 1. 疲労Lv2以上は最優先で休憩(堅実:無理せず自分の疲労を見て休む)
    for (const p of state.players) {
      if (p.fatigue >= 2) {
        act({ type: 'ASSIGN_WORKER', playerId: p.id, target: { kind: 'rest' } })
        pool.delete(p.id)
      }
    }

    // 2. 戦略C:第1〜2フェーズは毎週1人を学習に回す(休憩中の人は対象外)
    if (strategy === 'C' && state.phase <= 2) {
      const globalWeek = (state.phase - 1) * state.config.roundsPerPhase + (state.week - 1)
      const rotation = rotationStartingAt(state.players, globalWeek)
      const candidate = rotation.find((p) => pool.has(p.id) && p.fatigue < 2)
      if (candidate) {
        const skill = secondarySkill(candidate)
        if (candidate.skills[skill] < state.config.skillMax) {
          act({ type: 'ASSIGN_WORKER', playerId: candidate.id, target: { kind: 'learning', skill } })
          pool.delete(candidate.id)
        }
      }
    }

    // 3〜5. タスクへの配属:「今週中に完成させられる分だけ」まとめて配属する(all-or-nothing)。
    // 専門席が1つでも埋まらなければそのタスクには誰も割り当てない(中途半端な人手席投入は
    // 労力の無駄になるため。堅実な現場なら「完成させられる仕事」から手をつける、という判断)。
    // 専門席:資格者(スキル一致・過剰含む)を優先。埋まらない専門席は放置(戦略Bのみ誰でもやっつけで着席)。
    // 🔥がある場合は応援ぶんの人数も込みで「完成に必要な人数」として扱う。
    for (const { tile } of readyTasks(state)) {
      const instance = state.taskArea.find((t) => t.tileId === tile.id)!
      const fireNeeded = state.config.fireEnabled
        ? Math.max(0, instance.fire - supportCount(state, tile.id))
        : 0

      const available = [...pool]
      const seatPlan: Array<{ seatIndex: number; playerId: string }> = []
      let feasible = true

      // 専門席から先に確保(足りなければこのタスクは今週あきらめる)
      tile.seats.forEach((seat, seatIndex) => {
        if (!feasible || seat.skill === null) return
        const skill = seat.skill
        const idx = available.findIndex((id) => playerOf(id).skills[skill] >= seat.level)
        if (idx !== -1) {
          seatPlan.push({ seatIndex, playerId: available[idx]! })
          available.splice(idx, 1)
          return
        }
        if (strategy === 'B' && available.length > 0) {
          seatPlan.push({ seatIndex, playerId: available[0]! }) // やっつけ:誰でも着席
          available.splice(0, 1)
          return
        }
        feasible = false
      })
      if (!feasible) continue

      // 人手席(誰でも可)
      tile.seats.forEach((seat, seatIndex) => {
        if (!feasible || seat.skill !== null) return
        if (available.length === 0) {
          feasible = false
          return
        }
        seatPlan.push({ seatIndex, playerId: available[0]! })
        available.splice(0, 1)
      })
      if (!feasible) continue

      // 🔥ぶんの応援も込みで人数が足りるか
      if (available.length < fireNeeded) continue

      const supporters = available.splice(0, fireNeeded)

      for (const { seatIndex, playerId } of seatPlan) {
        act({ type: 'ASSIGN_WORKER', playerId, target: { kind: 'seat', taskTileId: tile.id, seatIndex } })
        pool.delete(playerId)
      }
      for (const playerId of supporters) {
        act({ type: 'ASSIGN_WORKER', playerId, target: { kind: 'support', taskTileId: tile.id } })
        pool.delete(playerId)
      }
    }

    // 6. 残った手空き(疲労Lv2以上は手順1ですでに休憩済み):不足スキルの学習(なければ休憩)
    for (const id of [...pool]) {
      const player = playerOf(id)
      const skill = [...SKILLS]
        .sort((a, b) => player.skills[a] - player.skills[b])
        .find((s) => player.skills[s] < state.config.skillMax)
      if (skill) {
        act({ type: 'ASSIGN_WORKER', playerId: id, target: { kind: 'learning', skill } })
      } else if (player.fatigue > 0) {
        act({ type: 'ASSIGN_WORKER', playerId: id, target: { kind: 'rest' } })
      }
      pool.delete(id)
    }

    // 7. 戦略B:可能な限り残業(主担当を持つプレイヤーが、まだ空いている席に追加で座る)
    if (strategy === 'B') {
      let progress = true
      while (progress) {
        progress = false
        const openSeats = readyTasks(state).flatMap(({ tile }) => {
          const occupants = seatOccupants(state, tile.id)
          return tile.seats
            .map((seat, seatIndex) => ({ tile, seat, seatIndex }))
            .filter(({ seatIndex }) => !occupants.has(seatIndex))
        })
        if (openSeats.length === 0) break
        for (const p of state.players) {
          const hasPrimary = state.assignments.some((a) => a.playerId === p.id && !a.overtime)
          const hasOvertime = state.assignments.some((a) => a.playerId === p.id && a.overtime)
          if (!hasPrimary || hasOvertime) continue
          if (p.fatigue >= state.config.noOvertimeAtFatigueLv) continue
          if (p.overtimeBanPhase === state.phase) continue
          const preferred = openSeats.find(
            ({ seat }) => seat.skill !== null && p.skills[seat.skill] >= seat.level,
          )
          const chosen = preferred ?? openSeats[0]
          if (!chosen) continue
          const ok = act({
            type: 'ASSIGN_WORKER',
            playerId: p.id,
            target: { kind: 'seat', taskTileId: chosen.tile.id, seatIndex: chosen.seatIndex },
            overtime: true,
          })
          if (ok) {
            overtimeCount++
            progress = true
            openSeats.splice(openSeats.indexOf(chosen), 1)
          }
        }
      }
    }

    // 8. 全員 Ready(最後の1人が宣言すると週末処理が自動で走る)
    for (const p of state.players) act({ type: 'DECLARE_READY', playerId: p.id })
  }

  let guard = 0
  while (!truncated && state.result === null && guard++ < 5000) {
    drain()
    if (state.result !== null) break
    if (state.step === 'planning') {
      planWeek()
    } else if (state.step === 'execution') {
      const beforeLen = state.resolutionLog.length
      act({ type: 'RESOLVE_NEXT_TASK' })
      for (const entry of state.resolutionLog.slice(beforeLen)) {
        if (entry.message.includes('やっつけ')) yatsukeCount++
      }
    } else if (state.step === 'phase_end') {
      if (state.lastPhaseSummary) {
        const s = state.lastPhaseSummary
        phases.push({
          phase: s.phase,
          unresolvedCount: s.unresolvedCount,
          deadlineMet: s.deadlineMet,
          qualityMet: s.qualityMet,
          csDelta: s.csDelta,
        })
      }
      act({ type: 'ADVANCE_PHASE' })
    } else {
      throw new Error(`[seed=${seed} strategy=${strategy}] 想定外のステップ: ${state.step}`)
    }
    drain()
  }

  const skillUpCount = state.players.reduce((sum, p) => sum + p.skillUpCount, 0)
  const outcome: 'win' | 'lose' = state.result?.outcome ?? 'lose'
  let loseKind: GameMetrics['loseKind'] = 'none'
  if (outcome === 'lose') {
    loseKind = state.result?.reason.includes('0 未満になったため') ? 'instant_cs' : 'final_judgement'
  }

  return {
    seed,
    strategy,
    clientId: state.clientId,
    outcome,
    loseKind,
    finalCs: state.cs,
    minCs: minCs === Infinity ? state.cs : minCs,
    finalBudget: state.budget,
    minBudget: minBudget === Infinity ? state.budget : minBudget,
    phases,
    limitEventCount,
    overtimeCount,
    yatsukeCount,
    skillUpCount,
    extraBillingCount,
    outsourceCount: 0, // outsourceEnabled は既定 false。今回のボットは外注を使わない
    finalUnresolvedTileIds: state.taskArea.filter((t) => !t.resolved).map((t) => t.tileId),
    actionCount,
    truncated,
  }
}

function round(n: number, digits = 2): number {
  const f = 10 ** digits
  return Math.round(n * f) / f
}

function summarize(results: GameMetrics[]) {
  const n = results.length
  const wins = results.filter((r) => r.outcome === 'win').length
  const instantLose = results.filter((r) => r.loseKind === 'instant_cs').length
  const finalLose = results.filter((r) => r.loseKind === 'final_judgement').length
  const avg = (f: (r: GameMetrics) => number) => results.reduce((sum, r) => sum + f(r), 0) / n

  const phaseStats = new Map<
    number,
    { unresolved: number; deadlineFail: number; qualityFail: number; count: number }
  >()
  for (const r of results) {
    for (const p of r.phases) {
      const s = phaseStats.get(p.phase) ?? { unresolved: 0, deadlineFail: 0, qualityFail: 0, count: 0 }
      s.unresolved += p.unresolvedCount
      s.deadlineFail += p.deadlineMet ? 0 : 1
      s.qualityFail += p.qualityMet ? 0 : 1
      s.count += 1
      phaseStats.set(p.phase, s)
    }
  }

  return {
    n,
    winRate: wins / n,
    instantLose,
    finalLose,
    avgFinalCs: avg((r) => r.finalCs),
    avgMinCs: avg((r) => r.minCs),
    minCsOverall: Math.min(...results.map((r) => r.minCs)),
    avgMinBudget: avg((r) => r.minBudget),
    minBudgetOverall: Math.min(...results.map((r) => r.minBudget)),
    zeroBudgetGames: results.filter((r) => r.minBudget === 0).length,
    avgLimitEvents: avg((r) => r.limitEventCount),
    avgOvertime: avg((r) => r.overtimeCount),
    avgYatsuke: avg((r) => r.yatsukeCount),
    avgSkillUp: avg((r) => r.skillUpCount),
    avgExtraBilling: avg((r) => r.extraBillingCount),
    avgActions: avg((r) => r.actionCount),
    truncatedCount: results.filter((r) => r.truncated).length,
    phaseStats,
  }
}

function summaryRow(label: string, s: ReturnType<typeof summarize>) {
  return {
    戦略: label,
    件数: s.n,
    勝率: `${round(s.winRate * 100, 1)}%`,
    'CS即死': s.instantLose,
    最終判定敗北: s.finalLose,
    平均最終CS: round(s.avgFinalCs),
    平均最低CS: round(s.avgMinCs),
    全体最低CS: s.minCsOverall,
    平均最低予算: round(s.avgMinBudget),
    全体最低予算: s.minBudgetOverall,
    予算枯渇games: s.zeroBudgetGames,
    平均限界イベント: round(s.avgLimitEvents),
    平均残業回数: round(s.avgOvertime),
    平均やっつけ回数: round(s.avgYatsuke),
    平均Lvアップ数: round(s.avgSkillUp),
    平均追加請求回数: round(s.avgExtraBilling),
    平均アクション数: round(s.avgActions),
    打ち切り件数: s.truncatedCount,
  }
}

function phaseRows(s: ReturnType<typeof summarize>) {
  return [...s.phaseStats.entries()]
    .sort(([a], [b]) => a - b)
    .map(([phase, stat]) => ({
      フェーズ: phase,
      到達game数: stat.count,
      平均未解決数: round(stat.unresolved / stat.count),
      納期未達回数: stat.deadlineFail,
      品質未達回数: stat.qualityFail,
    }))
}

function clientRows(results: GameMetrics[]) {
  const byClient = new Map<string, GameMetrics[]>()
  for (const r of results) {
    const list = byClient.get(r.clientId) ?? []
    list.push(r)
    byClient.set(r.clientId, list)
  }
  return [...byClient.entries()].map(([clientId, rs]) => ({
    クライアント: clientId,
    件数: rs.length,
    勝率: `${round((rs.filter((r) => r.outcome === 'win').length / rs.length) * 100, 1)}%`,
    平均最終CS: round(rs.reduce((s, r) => s + r.finalCs, 0) / rs.length),
  }))
}

function avgUnresolvedOverall(s: ReturnType<typeof summarize>): number {
  let total = 0
  let count = 0
  for (const stat of s.phaseStats.values()) {
    total += stat.unresolved
    count += stat.count
  }
  return count === 0 ? 0 : round(total / count)
}

/** ゲーム終了時点で未解決のまま残ったタスクの内訳(どの席が慢性的に詰まるか) */
function unresolvedTileRows(results: GameMetrics[]) {
  const tally = new Map<string, number>()
  for (const r of results) {
    for (const tileId of r.finalUnresolvedTileIds) {
      tally.set(tileId, (tally.get(tileId) ?? 0) + 1)
    }
  }
  return [...tally.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([tileId, count]) => ({ タスク: tileId, 積み残り件数: count, 発生率: `${round((count / results.length) * 100, 1)}%` }))
}

const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1)

describe('v3.0 週次ワーカーコミット バランスシミュレーション(シード1〜30)', () => {
  it('戦略A(堅実。roundsPerPhase=3既定)を30シード実行してクラッシュしない', () => {
    const results = SEEDS.map((seed) => runGame(seed, 'A'))
    for (const r of results) {
      expect(r.truncated, `seed=${r.seed}: 総アクション数2000で打ち切り(重大バグの疑い)`).toBe(false)
    }
    expect(results).toHaveLength(30)
    expect(results.every((r) => r.outcome === 'win' || r.outcome === 'lose')).toBe(true)

    const summary = summarize(results)
    console.table([summaryRow('A(堅実・roundsPerPhase=3)', summary)])
    console.table(phaseRows(summary))
    console.table(clientRows(results))
    console.table(unresolvedTileRows(results))

    // ── 感度分析:戦略Aで roundsPerPhase を 2 と 3 で比較 ──
    const results2 = SEEDS.map((seed) => runGame(seed, 'A', { roundsPerPhase: 2 }))
    for (const r of results2) {
      expect(r.truncated, `[roundsPerPhase=2] seed=${r.seed}: 打ち切り`).toBe(false)
    }
    const summary2 = summarize(results2)
    console.table([
      { config: 'roundsPerPhase=3(既定)', 勝率: `${round(summary.winRate * 100, 1)}%`, 平均未解決数: avgUnresolvedOverall(summary) },
      { config: 'roundsPerPhase=2', 勝率: `${round(summary2.winRate * 100, 1)}%`, 平均未解決数: avgUnresolvedOverall(summary2) },
    ])
    console.table(phaseRows(summary2))
  })

  it('戦略B(全力。やっつけ+残業/mismatchEnabled)を30シード実行してクラッシュしない', () => {
    const results = SEEDS.map((seed) => runGame(seed, 'B'))
    for (const r of results) {
      expect(r.truncated, `seed=${r.seed}: 総アクション数2000で打ち切り(重大バグの疑い)`).toBe(false)
    }
    expect(results).toHaveLength(30)

    const summary = summarize(results)
    console.table([summaryRow('B(全力)', summary)])
    console.table(phaseRows(summary))
    console.table(clientRows(results))
    console.table(unresolvedTileRows(results))
  })

  it('戦略C(育成重視。第1〜2フェーズ学習優先)を30シード実行してクラッシュしない', () => {
    const results = SEEDS.map((seed) => runGame(seed, 'C'))
    for (const r of results) {
      expect(r.truncated, `seed=${r.seed}: 総アクション数2000で打ち切り(重大バグの疑い)`).toBe(false)
    }
    expect(results).toHaveLength(30)

    const summary = summarize(results)
    console.table([summaryRow('C(育成重視)', summary)])
    console.table(phaseRows(summary))
    console.table(clientRows(results))
    console.table(unresolvedTileRows(results))
  })
})
