/**
 * フェーズ終了(要件の清算)と最終検収(RULES.md §8-6・§4)
 */
import type { GameState } from '../types/state'
import type { RuleViolation } from '../types/violation'
import { violation } from '../types/violation'
import {
  addLog,
  changeCs,
  getRequirementCard,
  getSlotState,
  hasReworkCard,
  isRequirementFulfilled,
  updateRequirement,
} from '../helpers'
import { openScopeMeeting } from './scope'

/**
 * フェーズ終了処理(最終週の END_WEEKEND から呼ばれる):
 * 要件の清算 → 信頼ボーナス → 相談ごとの期限切れ → バグ出血 → 疲労回復 → 一時効果クリア
 */
export function processPhaseEnd(state: GameState): GameState {
  let next = addLog(state, `── フェーズ${state.phase} 終了の清算 ──`)

  // ── 1. 要件の清算(期限がこのフェーズのものだけ・1回だけ。RULES.md §3-4)──
  const due = next.requirements.filter(
    (r) => !r.settled && r.tier !== 'dropped' && r.deadlinePhase <= next.phase,
  )
  const dueMusts = due.filter((r) => r.tier === 'must')
  let allMustMet = dueMusts.length > 0

  for (const req of due) {
    if (next.result !== null) return next
    const card = getRequirementCard(next.content, req.requirementId)
    const met = isRequirementFulfilled(next, req)

    if (req.tier === 'must') {
      if (met) {
        next = settle(next, req.requirementId, 'met')
        next = addLog(next, `🤝 Must「${card?.name}」を期限どおり達成(期待どおりの仕事)`)
      } else {
        allMustMet = false
        next = settle(next, req.requirementId, 'failed')
        next = changeCs(next, -next.config.mustMissCs)
        next = addLog(next, `💢 Must「${card?.name}」が期限までに未達(CS-${next.config.mustMissCs})`)
      }
      continue
    }

    // Better
    if (met && !next.csAwardedRequirementIds.includes(req.requirementId)) {
      next = settle(next, req.requirementId, 'met')
      next = changeCs(next, next.config.betterMeetCs)
      next = {
        ...next,
        csAwardedRequirementIds: [...next.csAwardedRequirementIds, req.requirementId],
      }
      next = addLog(next, `💚 Better「${card?.name}」を達成(CS+${next.config.betterMeetCs})`)
    } else if (met) {
      next = settle(next, req.requirementId, 'met')
    } else {
      next = settle(next, req.requirementId, 'expired')
      next = addLog(next, `〰 Better「${card?.name}」は見送りに終わりました(罰はありません)`)
    }
  }
  if (next.result !== null) return next

  // ── 2. 信頼ボーナス(期限フェーズの Must を全達成。RULES.md §4-2)──
  if (allMustMet) {
    next = changeCs(next, next.config.allMustBonusCs)
    next = addLog(
      next,
      `🏆 信頼ボーナス:このフェーズの Must をすべて守りました(CS+${next.config.allMustBonusCs})`,
    )
    if (next.result !== null) return next
  }

  // ── 3. 相談ごとの期限切れ(自然消滅・罰なし)──
  const openConsults = next.board.filter((t) => t.interrupt === 'consult')
  if (openConsults.length > 0) {
    for (const consult of openConsults) {
      next = addLog(next, `💨 相談ごと(人日${consult.interruptEffort})は期限切れ(自然消滅)`)
    }
    next = { ...next, board: next.board.filter((t) => t.interrupt !== 'consult') }
  }

  // ── 4. バグ放置の出血 ──
  const openBugs = next.board.filter((t) => t.interrupt === 'bug')
  for (const _bug of openBugs) {
    next = changeCs(next, -1)
    next = addLog(next, '🐛 バグを放置したままフェーズが終わった(CS-1)')
    if (next.result !== null) return next
  }

  // ── 5. 疲労の自然回復 ──
  next = {
    ...next,
    players: next.players.map((p) => ({
      ...p,
      fatigue: Math.max(0, p.fatigue - next.config.phaseEndRecovery),
      // ── 6. 一時効果(キャパシティ減)のクリア ──
      capacityDownUntilWeek: 0,
    })),
  }
  // ── 6. 一時ブロック(確認待ち)のクリア ──
  next = {
    ...next,
    board: next.board.map((t) => ({ ...t, blockedUntilWeek: 0 })),
  }

  return { ...next, step: 'phase_end' }
}

function settle(
  state: GameState,
  requirementId: string,
  outcome: 'met' | 'failed' | 'expired',
): GameState {
  return updateRequirement(state, requirementId, (r) => ({
    ...r,
    settled: true,
    settledOutcome: outcome,
    met: outcome === 'met',
  }))
}

/** ADVANCE_PHASE — 次フェーズへ。最終フェーズなら最終検収と勝敗判定 */
export function handleAdvancePhase(state: GameState): GameState | RuleViolation {
  if (state.step !== 'phase_end') {
    return violation('INVALID_STEP', 'フェーズ終了処理中ではありません。')
  }

  // ── 最終検収(RULES.md §4-4)──
  if (state.phase >= state.config.phases) {
    let next = addLog(state, '── 最終検収 ──')
    // 見送り・未達確定・失効も含めて、公開されたすべての要件を評価する
    for (const req of next.requirements) {
      const card = getRequirementCard(next.content, req.requirementId)
      if (!card) continue
      const slot = getSlotState(next, card.slot)
      const blockedByRework = hasReworkCard(next, card.slot)
      const level = slot?.level ?? 0

      if (level >= card.level && !blockedByRework) {
        next = addLog(next, `✅ 「${card.name}」:Lv${level} で充足`)
        continue
      }
      const compromised = level >= 1 && !blockedByRework && level < card.level
      const penalty = compromised ? next.config.finalCompromiseCs : next.config.finalMissCs
      next = changeCs(next, -penalty)
      next = addLog(
        next,
        compromised
          ? `📉 「${card.name}」:Lv${card.level} 要求を Lv${level} で納めた(CS-${penalty})`
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
    scopeChangeUsedThisPhase: 0,
    redrawUsedThisPhase: 0,
    assignments: [],
    readyPlayerIds: [],
  }
  return openScopeMeeting(next)
}
