/**
 * ボット戦略一覧(RULES.md §13 のバランス検証用)
 *
 * v4.1 のシミュレーションで「成り行き」が全流入レートで最強だったため、
 * v5 では Better / 信頼ボーナスという能動的な CS 経路を入れた。
 * その効果を測るために、成り行き型と能動型を並べて比較する。
 */
import type { Strategy } from './types'

export const STRATEGIES: Strategy[] = [
  {
    name: 'balanced',
    description: '標準:要件どおりの品質、割り込みはあふれ手前で捌く、学習はほどほど',
    betters: 'opportunistic',
    interrupts: 'nearOverflow',
    decline: 'nearOverflow',
    quality: 'requirement',
    learnPerPhase: 1,
    useOvertime: true,
    renegotiateMusts: true,
  },
  {
    name: 'mustOnly',
    description: 'Must 一点張り:Better は即見送りにして必達だけを守る',
    betters: 'drop',
    interrupts: 'nearOverflow',
    decline: 'nearOverflow',
    quality: 'requirement',
    learnPerPhase: 1,
    useOvertime: true,
    renegotiateMusts: true,
  },
  {
    name: 'betterChaser',
    description: 'CS 稼ぎ:Better も積極的に取りにいく(#8 の新経路をフル活用)',
    betters: 'chase',
    interrupts: 'nearOverflow',
    decline: 'nearOverflow',
    quality: 'polish',
    learnPerPhase: 1,
    useOvertime: true,
    renegotiateMusts: false,
  },
  {
    name: 'growthFirst',
    description: '育成先行:序盤に学習へ枠を割いて後半の速度を買う(v4.1 の最強戦略)',
    betters: 'opportunistic',
    interrupts: 'nearOverflow',
    decline: 'nearOverflow',
    quality: 'requirement',
    learnPerPhase: 4,
    useOvertime: true,
    renegotiateMusts: true,
  },
  {
    name: 'triage',
    description: '割り込み最優先:出たものから片付ける',
    betters: 'opportunistic',
    interrupts: 'always',
    decline: 'never',
    quality: 'fast',
    learnPerPhase: 0,
    useOvertime: true,
    renegotiateMusts: true,
  },
  {
    name: 'driftAlong',
    description: '成り行き:計画タスクだけを見て、割り込みはあふれ直前にしか触らない(v4.1 最強)',
    betters: 'opportunistic',
    interrupts: 'nearOverflow',
    decline: 'never',
    quality: 'fast',
    learnPerPhase: 0,
    useOvertime: false,
    renegotiateMusts: false,
  },
  {
    name: 'declineHeavy',
    description: '断る勇気:手に負えない割り込みは早めに謝絶する',
    betters: 'opportunistic',
    interrupts: 'nearOverflow',
    decline: 'eager',
    quality: 'requirement',
    learnPerPhase: 1,
    useOvertime: true,
    renegotiateMusts: true,
  },
  {
    name: 'dropEverything',
    description: '極端:Must も含めて可能な限り見送る(極端戦略の非支配チェック用)',
    betters: 'drop',
    interrupts: 'never',
    decline: 'eager',
    quality: 'fast',
    learnPerPhase: 0,
    useOvertime: false,
    renegotiateMusts: true,
    dropMusts: true,
  },
]

/** 名前から戦略を引く */
export function strategyByName(name: string): Strategy | undefined {
  return STRATEGIES.find((s) => s.name === name)
}
