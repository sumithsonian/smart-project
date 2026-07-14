/**
 * フェーズ終了(約束の清算)と最終検収(rules-v4-core.md §1-3)
 */
import type { GameState } from '../types/state'
import type { RuleViolation } from '../types/violation'
import { violation } from '../types/violation'
import { addLog, changeCs, getAcceptance, getSlotState } from '../helpers'
import { openScopeMeeting } from './scope'

/**
 * フェーズ終了処理(最終週の END_WEEKEND から呼ばれる):
 * 約束の清算 → バグ放置の出血 → 疲労回復 → step 'phase_end'
 */
export function processPhaseEnd(state: GameState): GameState {
  let next = addLog(state, `── フェーズ${state.phase} 終了の清算 ──`)

  // ── 1. 約束の清算(猶予中はスキップ)──
  for (const commitment of next.commitments) {
    if (next.result !== null) return next
    if (commitment.graceUntilPhase >= next.phase) {
      const card = getAcceptance(next.content, commitment.acceptanceId)
      next = addLog(next, `⏳ 「${card?.name}」は交渉により猶予中(今回の清算なし)`)
      continue
    }
    const card = getAcceptance(next.content, commitment.acceptanceId)
    next = changeCs(next, -next.config.commitPenaltyCs)
    next = addLog(
      next,
      `💢 約束した「${card?.name}」が未達(CS-${next.config.commitPenaltyCs})`,
    )
  }
  if (next.result !== null) return next

  // ── 2. バグ放置の出血 ──
  const openBugs = next.board.filter((t) => t.interrupt === 'bug')
  for (const _bug of openBugs) {
    next = changeCs(next, -1)
    next = addLog(next, '🐛 バグを放置したままフェーズが終わった(CS-1)')
    if (next.result !== null) return next
  }

  // ── 3. 疲労の自然回復 ──
  next = {
    ...next,
    players: next.players.map((p) => ({
      ...p,
      fatigue: Math.max(0, p.fatigue - next.config.phaseEndRecovery),
    })),
  }

  return { ...next, step: 'phase_end' }
}

/** ADVANCE_PHASE — 次フェーズへ。最終フェーズなら最終検収と勝敗判定 */
export function handleAdvancePhase(state: GameState): GameState | RuleViolation {
  if (state.step !== 'phase_end') {
    return violation('INVALID_STEP', 'フェーズ終了処理中ではありません。')
  }

  // ── 最終検収(rules-v4-core.md §1-3-5)──
  if (state.phase >= state.config.phases) {
    let next = addLog(state, '── 最終検収 ──')
    for (const id of next.openAcceptanceIds) {
      if (next.metAcceptanceIds.includes(id)) continue
      const card = getAcceptance(next.content, id)
      if (!card) continue
      const slot = getSlotState(next, card.slot)
      const compromised =
        slot !== undefined && slot.level >= 1 && slot.reworkCubes === 0 && slot.level < card.level
      const penalty = compromised ? next.config.finalCompromiseCs : next.config.finalMissCs
      next = changeCs(next, -penalty)
      next = addLog(
        next,
        compromised
          ? `📉 「${card.name}」:Lv${card.level} 要求を Lv${slot!.level} で納めた(CS-${penalty})`
          : `❌ 「${card.name}」:未達成(CS-${penalty})`,
      )
      if (next.result !== null) return next
    }
    const won = next.cs >= 0
    return {
      ...next,
      step: 'finished',
      result: {
        outcome: won ? 'win' : 'lose',
        reason: won
          ? `最終検収を終えて CS ${next.cs} ≥ 0。プロジェクトは成功しました!`
          : `最終検収の結果 CS ${next.cs} < 0。プロジェクトは失敗しました…`,
      },
    }
  }

  // ── 次フェーズのスコープ会議へ ──
  const next: GameState = {
    ...state,
    phase: state.phase + 1,
    extraBillingUsedThisPhase: 0,
    assignments: [],
    readyPlayerIds: [],
  }
  return openScopeMeeting(next)
}
