/**
 * バランスシミュレーションの実行 CLI(RULES.md §13)
 *
 *   pnpm --filter @smart-project/engine sim                       # 既定設定 × 全戦略
 *   pnpm --filter @smart-project/engine sim -- --games 500        # 1戦略あたりのゲーム数
 *   pnpm --filter @smart-project/engine sim -- --sweep mustMissCs=1,2,3
 *   pnpm --filter @smart-project/engine sim -- --json out.json    # 生データを書き出す
 *
 * すべてシード付き乱数で回るので、同じ --seed なら結果は完全に再現する。
 */
import { writeFileSync } from 'node:fs'
import type { GameConfig } from '../src/types'
import { playGame } from './bot'
import { STRATEGIES, strategyByName } from './strategies'
import type { DemandMode, DependencyMode, InflowMode, WorkerLimitMode } from './decks'
import type { Aggregate, GameMetrics, Strategy } from './types'

interface Options {
  games: number
  baseSeed: number
  strategies: Strategy[]
  sweep: { key: keyof GameConfig; values: number[] } | null
  jsonPath: string | null
  inflows: InflowMode[]
  demands: DemandMode[]
  deps: DependencyMode[]
  limits: WorkerLimitMode[]
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    games: 300,
    baseSeed: 20260906,
    strategies: STRATEGIES,
    sweep: null,
    jsonPath: null,
    inflows: ['experience'],
    demands: ['base'],
    deps: ['serial'],
    limits: ['none'],
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    const next = () => argv[++i] ?? ''
    if (arg === '--games') options.games = Number(next())
    else if (arg === '--seed') options.baseSeed = Number(next())
    else if (arg === '--json') options.jsonPath = next()
    else if (arg === '--inflow') {
      options.inflows = next().split(',').filter(Boolean) as InflowMode[]
    } else if (arg === '--demand') {
      options.demands = next().split(',').filter(Boolean) as DemandMode[]
    } else if (arg === '--deps') {
      options.deps = next().split(',').filter(Boolean) as DependencyMode[]
    } else if (arg === '--limit') {
      options.limits = next().split(',').filter(Boolean) as WorkerLimitMode[]
    }
    else if (arg === '--strategy') {
      const names = next().split(',')
      const picked = names.map(strategyByName).filter((s): s is Strategy => !!s)
      if (picked.length > 0) options.strategies = picked
    } else if (arg === '--sweep') {
      const [key, list] = next().split('=')
      if (key && list) {
        options.sweep = {
          key: key as keyof GameConfig,
          values: list.split(',').map(Number).filter(Number.isFinite),
        }
      }
    }
  }
  return options
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length
}

function aggregate(games: GameMetrics[]): Aggregate {
  const n = games.length
  const sum = (pick: (g: GameMetrics) => number) => games.reduce((a, g) => a + pick(g), 0)
  const mustTotal = sum((g) => g.mustTotal)
  const betterTotal = sum((g) => g.betterTotal)
  const interrupts = sum((g) => g.interruptsSpawned)
  const declines = sum((g) => g.declines)
  const actions = sum((g) => g.totalActions)
  const deliveries = sum((g) => g.lv1Deliveries) + sum((g) => g.lv2Deliveries)
  const weeks = sum((g) => g.weeksPlayed)
  const tracked = sum((g) => g.trackedDeliveries)

  return {
    strategy: games[0]?.strategy ?? '',
    games: n,
    winRate: games.filter((g) => g.outcome === 'win').length / n,
    meanFinalCs: mean(games.map((g) => g.finalCs)),
    deathSpiralRate: games.filter((g) => !g.survived).length / n,
    mustMetRate: mustTotal === 0 ? 0 : sum((g) => g.mustMet) / mustTotal,
    betterMetRate: betterTotal === 0 ? 0 : sum((g) => g.betterMet) / betterTotal,
    meanTrustBonuses: mean(games.map((g) => g.trustBonuses)),
    declineRate: interrupts === 0 ? 0 : declines / interrupts,
    overflowPerGame: mean(games.map((g) => g.overflows)),
    interruptsPerGame: mean(games.map((g) => g.interruptsSpawned)),
    idleActionRate: actions === 0 ? 0 : sum((g) => g.idleActions) / actions,
    blockedPerGame: mean(games.map((g) => g.blockedAttempts)),
    blockedPlannedPerGame: mean(games.map((g) => g.blockedPlanned)),
    idleWeekRate: mean(games.map((g) => (g.weeksPlayed === 0 ? 0 : g.idleWeeks / g.weeksPlayed))),
    noWorkWeekRate: mean(
      games.map((g) => (g.weeksPlayed === 0 ? 0 : g.noWorkWeeks / g.weeksPlayed)),
    ),
    meanEffortOverrun: mean(games.map((g) => g.effortOverrun)),
    lv1Share: deliveries === 0 ? 0 : sum((g) => g.lv1Deliveries) / deliveries,
    carryOversPerGame: mean(games.map((g) => g.carryOvers)),
    meanQualityRiskLeft: mean(games.map((g) => g.qualityRiskLeft)),

    // ── 定期観測 ──
    onTimeRate: tracked === 0 ? 0 : sum((g) => g.onTimeDeliveries) / tracked,
    replansPerGame: mean(games.map((g) => g.replans)),
    overloadedWeekRate: weeks === 0 ? 0 : sum((g) => g.overloadedWeeks) / weeks,
    demandSupplyRatio: weeks === 0 ? 0 : sum((g) => g.demandSupplySum) / weeks,
    contentionWeekRate: weeks === 0 ? 0 : sum((g) => g.contentionWeeks) / weeks,
    specialistContentionRate:
      weeks === 0 ? 0 : sum((g) => g.specialistContentionWeeks) / weeks,
    forgonePerWeek: weeks === 0 ? 0 : sum((g) => g.forgoneWork) / weeks,
  }
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`
const num = (v: number, digits = 2) => v.toFixed(digits)

function printTable(rows: Aggregate[]): void {
  const header = [
    '戦略',
    '勝率',
    '最終CS',
    '途中敗北',
    'Must達成',
    'Better達成',
    '信頼B',
    '割込/G',
    '謝絶率',
    'あふれ/G',
    '手空き率',
    'ブロック/G',
    '空転週率',
    '無仕事週率',
    '上振れ',
    'Lv1比率',
    '残リスク',
  ]
  const body = rows.map((r) => [
    r.strategy,
    pct(r.winRate),
    num(r.meanFinalCs, 1),
    pct(r.deathSpiralRate),
    pct(r.mustMetRate),
    pct(r.betterMetRate),
    num(r.meanTrustBonuses, 2),
    num(r.interruptsPerGame, 1),
    pct(r.declineRate),
    num(r.overflowPerGame, 2),
    pct(r.idleActionRate),
    num(r.blockedPlannedPerGame, 1),
    pct(r.idleWeekRate),
    pct(r.noWorkWeekRate),
    num(r.meanEffortOverrun, 1),
    pct(r.lv1Share),
    num(r.meanQualityRiskLeft, 1),
  ])
  const widths = header.map((h, i) =>
    Math.max(displayWidth(h), ...body.map((row) => displayWidth(row[i]!))),
  )
  const line = (cells: string[]) =>
    cells.map((c, i) => pad(c, widths[i]!)).join('  ')
  console.log(line(header))
  console.log(widths.map((w) => '─'.repeat(w)).join('  '))
  for (const row of body) console.log(line(row))
}

/** 全角を2文字ぶんとして数える */
function displayWidth(text: string): number {
  let width = 0
  for (const char of text) width += /[^\x20-\x7E]/.test(char) ? 2 : 1
  return width
}
function pad(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - displayWidth(text)))
}

function runCell(
  strategy: Strategy,
  options: Options,
  config: Partial<GameConfig> | undefined,
  inflow: InflowMode,
  demand: DemandMode,
  deps: DependencyMode,
  limit: WorkerLimitMode,
): GameMetrics[] {
  const games: GameMetrics[] = []
  for (let i = 0; i < options.games; i++) {
    games.push(
      playGame(strategy, options.baseSeed + i * 7919, config, inflow, demand, deps, limit),
    )
  }
  return games
}

const LIMIT_LABELS: Record<WorkerLimitMode, string> = {
  none: '同時人数:上限なし',
  brooks: '同時人数:上限あり',
}

const DEPS_LABELS: Record<DependencyMode, string> = {
  serial: '依存:直列(既定)',
  wide: '依存:並列寄り',
  none: '依存:なし(天井の測定)',
}

const DEMAND_LABELS: Record<DemandMode, string> = {
  base: '需要:既定(2枚/フェーズ)',
  high: '需要:高(3枚/フェーズ)',
}

const INFLOW_LABELS: Record<InflowMode, string> = {
  experience: '追体験(既定デッキ)',
  triage: 'トリアージ(割り込み増)',
  pressure: '高難度(割り込み厚)',
}

function main(): void {
  const options = parseArgs(process.argv.slice(2))
  const started = Date.now()
  const all: GameMetrics[] = []

  console.log('スマートプロジェクト v5 バランスシミュレーション')
  console.log(
    `1戦略あたり ${options.games} ゲーム / 基準シード ${options.baseSeed} / 戦略 ${options.strategies.length}件`,
  )

  const cells: Array<{
    label: string
    config?: Partial<GameConfig>
    inflow: InflowMode
    demand: DemandMode
    deps: DependencyMode
    limit: WorkerLimitMode
  }> = []
  const sweepValues = options.sweep ? options.sweep.values : [null]
  for (const limit of options.limits) {
   for (const deps of options.deps) {
    for (const demand of options.demands) {
      for (const inflow of options.inflows) {
        for (const value of sweepValues) {
          const config =
            value === null || !options.sweep
              ? undefined
              : ({ [options.sweep.key]: value } as Partial<GameConfig>)
          const parts = [
            LIMIT_LABELS[limit],
            DEPS_LABELS[deps],
            DEMAND_LABELS[demand],
            INFLOW_LABELS[inflow],
          ]
          if (config && options.sweep) parts.push(`${String(options.sweep.key)} = ${value}`)
          cells.push({ label: parts.join(' / '), config, inflow, demand, deps, limit })
        }
      }
    }
   }
  }

  for (const cell of cells) {
    console.log(`\n══ ${cell.label} ══`)
    const rows: Aggregate[] = []
    for (const strategy of options.strategies) {
      const games = runCell(strategy, options, cell.config, cell.inflow, cell.demand, cell.deps, cell.limit)
      all.push(...games)
      rows.push(aggregate(games))
    }
    printTable(rows)
    printIndicators(rows)
    printVerdict(rows)
  }

  if (options.jsonPath) {
    writeFileSync(options.jsonPath, JSON.stringify(all, null, 2))
    console.log(`\n生データを書き出しました: ${options.jsonPath}`)
  }
  console.log(`\n所要 ${((Date.now() - started) / 1000).toFixed(1)}s`)
}

/**
 * 定期観測の指標(RULES.md §13-6)。
 *  ① 計画部分:計画ボードが「立てて・守って・引き直す」ものとして機能しているか
 *  ② 実施ジレンマ:配置に悩みが生じているか(全部はできない状態になっているか)
 */
function printIndicators(rows: Aggregate[]): void {
  console.log('\n── 定期観測 ① 計画の質 / ② 実施ジレンマ ──')
  const header = [
    '戦略',
    '①計画遵守',
    '①再計画/G',
    '①過負荷週',
    '①繰越/G',
    '②需要/供給',
    '②競合週',
    '②専門家競合',
    '②見送り/週',
  ]
  const body = rows.map((r) => [
    r.strategy,
    pct(r.onTimeRate),
    num(r.replansPerGame, 1),
    pct(r.overloadedWeekRate),
    num(r.carryOversPerGame, 1),
    num(r.demandSupplyRatio, 2),
    pct(r.contentionWeekRate),
    pct(r.specialistContentionRate),
    num(r.forgonePerWeek, 2),
  ])
  const widths = header.map((h, i) =>
    Math.max(displayWidth(h), ...body.map((row) => displayWidth(row[i]!))),
  )
  const line = (cells: string[]) => cells.map((c, i) => pad(c, widths[i]!)).join('  ')
  console.log(line(header))
  console.log(widths.map((w) => '─'.repeat(w)).join('  '))
  for (const row of body) console.log(line(row))
}

/** RULES.md §13 の成功基準に対する自動判定 */
/** dropEverything は「極端戦略が支配的にならない」ことの対照群なので、他の基準からは外す */
const CONTROL_STRATEGIES = new Set(['dropEverything'])

function printVerdict(rows: Aggregate[]): void {
  const byName = new Map(rows.map((r) => [r.strategy, r]))
  const real = rows.filter((r) => !CONTROL_STRATEGIES.has(r.strategy))
  const winRates = real.map((r) => r.winRate)
  const best = Math.max(...winRates)
  const worst = Math.min(...winRates)
  const bestRow = real.find((r) => r.winRate === best)!
  const mixed = mean(winRates)

  const checks: Array<[string, boolean, string]> = []

  checks.push([
    '① 極端戦略が支配的にならない',
    (byName.get('dropEverything')?.winRate ?? 0) < 0.25,
    `全部見送り ${pct(byName.get('dropEverything')?.winRate ?? 0)}`,
  ])
  checks.push([
    '② 成り行きが最強でない(#8 の能動的 CS 経路が効いている)',
    (byName.get('driftAlong')?.winRate ?? 0) < best - 0.02,
    `成り行き ${pct(byName.get('driftAlong')?.winRate ?? 0)} / 最高 ${bestRow.strategy} ${pct(best)}`,
  ])
  checks.push([
    '③ 謝絶が有意に使われる(差し込みの1〜3割)',
    real.some((r) => r.declineRate >= 0.1 && r.declineRate <= 0.35),
    real.map((r) => `${r.strategy}:${pct(r.declineRate)}`).join(' '),
  ])
  checks.push([
    '④ デススパイラルで詰むゲームが多発しない(<20%)',
    real.every((r) => r.deathSpiralRate < 0.2),
    `最大 ${pct(Math.max(...real.map((r) => r.deathSpiralRate)))}`,
  ])
  checks.push([
    '⑤ 依存ブロックで週が丸ごと空転しない(仕事がない週 <10%)',
    real.every((r) => r.noWorkWeekRate < 0.1),
    `最大 ${pct(Math.max(...real.map((r) => r.noWorkWeekRate)))} / ブロック済み予定 ${num(
      Math.max(...real.map((r) => r.blockedPlannedPerGame)),
      1,
    )}件/G`,
  ])
  checks.push([
    '⑥ 勝率が振り切れていない(混合 20〜70%)',
    mixed >= 0.2 && mixed <= 0.7,
    `混合勝率 ${pct(mixed)}(最高 ${pct(best)} / 最低 ${pct(worst)})`,
  ])

  checks.push([
    '⑦ 計画ボードが機能している(再計画が起き、遵守率が 30〜70%)',
    real.some((r) => r.replansPerGame >= 3 && r.onTimeRate >= 0.3 && r.onTimeRate <= 0.7),
    `再計画 ${num(mean(real.map((r) => r.replansPerGame)), 1)}回/G / 遵守率 ${pct(
      mean(real.map((r) => r.onTimeRate)),
    )} / 過負荷週 ${pct(mean(real.map((r) => r.overloadedWeekRate)))}`,
  ])
  checks.push([
    '⑧ 実施にジレンマがある(需要/供給 ≥ 0.9 または 競合週 ≥ 30%)',
    real.some((r) => r.demandSupplyRatio >= 0.9 || r.contentionWeekRate >= 0.3),
    `需要/供給 ${num(mean(real.map((r) => r.demandSupplyRatio)), 2)} / 競合週 ${pct(
      mean(real.map((r) => r.contentionWeekRate)),
    )} / 専門家競合 ${pct(mean(real.map((r) => r.specialistContentionRate)))}`,
  ])

  console.log('\n── 成功基準の判定 ──')
  for (const [label, ok, detail] of checks) {
    console.log(`${ok ? '✅' : '❌'} ${label} — ${detail}`)
  }
}

main()
