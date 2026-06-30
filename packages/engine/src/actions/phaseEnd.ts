/**
 * フェーズ終了処理(RULES.md §2-4)と次フェーズへの進行・最終勝敗判定
 *
 * トークン経済の暫定実装(RULES.md に明記がない点):
 * - 「解決済みタスク上のトークンを回収」はストック(共通サプライ)への回収とし、
 *   プレイヤーの手元には戻らない。手元へは毎フェーズ開始時の補充(+tokensPerPhase)のみ
 * - 未使用の手持ちトークンは次フェーズに持ち越せる
 */
import type { GameState, PhaseEndSummary, PlayerState } from '../types/state'
import type { PersonalGoalCard } from '../types/content'
import type { RuleViolation } from '../types/violation'
import { violation } from '../types/violation'
import { applyWeight, changeCs, getClient, getSheet } from '../helpers'
import { publishPhaseTasks } from './setup'
import { beginPhaseStart } from './fire'
import { hasMilestone } from './milestones'

/**
 * フェーズ終了判定(実行ステップ完了時に自動で呼ばれる)
 * 1. 納期(D)判定 → 2. 品質(Q)判定 → 3. 疲労の自然回復 → 4. トークン回収/持ち越し
 */
export function processPhaseEnd(state: GameState): GameState {
  const sheet = getSheet(state)
  const client = getClient(state)
  const rule = sheet.phaseRules[state.phase - 1]!
  let csDelta = 0
  let next = state

  // ── 1. 納期(D)判定:未解決タスク数が許容数を超えていれば CS 減少 ──
  const unresolvedCount = next.taskArea.filter((t) => !t.resolved).length
  const deadlineMet = unresolvedCount <= rule.deadlineAllowance
  if (!deadlineMet) {
    const penalty = applyWeight(rule.csPenaltyDeadline, client.weights.d, next.config.qcdWeightMode)
    csDelta -= penalty
    next = changeCs(next, -penalty)
    if (next.result !== null) return next
  }

  // ── 2. 品質(Q)判定:このフェーズで獲得した Lv2 成果物数が基準未達なら CS 減少 ──
  const lv2Count = next.deliverables.filter(
    (d) => d.level === 2 && d.acquiredPhase === next.phase,
  ).length
  const qualityMet = lv2Count >= rule.qualityThreshold
  if (!qualityMet) {
    const penalty = applyWeight(rule.csPenaltyQuality, client.weights.q, next.config.qcdWeightMode)
    csDelta -= penalty
    next = changeCs(next, -penalty)
    if (next.result !== null) return next
  }

  // ── 3. 疲労の自然回復:全員 -phaseEndRecovery ──
  next = {
    ...next,
    players: next.players.map((p) => ({
      ...p,
      fatigue: Math.max(0, p.fatigue - next.config.phaseEndRecovery),
    })),
  }

  // ── 4. トークン回収:解決済みタスクはエリアから除去(トークンはストックへ)。
  //       未解決タスクは carryOverTokens に従いトークンを持ち越す ──
  next = {
    ...next,
    taskArea: next.taskArea
      .filter((t) => !t.resolved)
      .map((t) => (next.config.carryOverTokens ? t : { ...t, tokens: {} })),
  }

  const summary: PhaseEndSummary = {
    phase: next.phase,
    unresolvedCount,
    deadlineMet,
    lv2Count,
    qualityMet,
    csDelta,
  }
  return { ...next, step: 'phase_end', lastPhaseSummary: summary }
}

/** 個人目標の達成判定 */
export function evaluatePersonalGoal(state: GameState, player: PlayerState): boolean {
  const goal: PersonalGoalCard | undefined = state.content.personalGoals.find(
    (g) => g.id === player.personalGoalId,
  )
  if (!goal) return false
  const condition = goal.condition
  switch (condition.type) {
    case 'LV2_DELIVERABLES_AT_LEAST':
      return (
        state.deliverables.filter(
          (d) => d.level === 2 && d.participants.includes(player.id),
        ).length >= condition.count
      )
    case 'SKILL_GROWTH_AT_LEAST': {
      const total = player.skills.direction + player.skills.design + player.skills.engineering
      return total - player.initialSkillTotal >= condition.amount
    }
    case 'FATIGUE_AT_MOST':
      return player.fatigue <= condition.level
    case 'BUDGET_RATIO_AT_LEAST':
      return state.budget >= state.initialBudget * condition.ratio
    case 'EP_AT_LEAST':
      return player.ep >= condition.amount
    case 'EXTINGUISH_AT_LEAST':
      return player.extinguishCount >= condition.count
    case 'ALL_SKILLS_AT_LEAST':
      return (
        player.skills.direction >= condition.level &&
        player.skills.design >= condition.level &&
        player.skills.engineering >= condition.level
      )
  }
}

/** 個人勝利:個人目標達成 または マイルストーン獲得(RULES.md §1 / §11) */
export function evaluatePersonalWin(state: GameState, player: PlayerState): boolean {
  if (evaluatePersonalGoal(state, player)) return true
  return state.config.milestonesEnabled && hasMilestone(state, player.id)
}

/** ADVANCE_PHASE — 次フェーズへ進む。最終フェーズなら勝敗判定(RULES.md §1) */
export function handleAdvancePhase(state: GameState): GameState | RuleViolation {
  if (state.step !== 'phase_end') {
    return violation('PHASE_NOT_ENDED', 'フェーズ終了処理が完了していません。')
  }

  // ── 最終フェーズ終了 → 勝敗判定 ──
  if (state.phase >= state.config.phases) {
    const won = state.cs >= 0
    return {
      ...state,
      step: 'finished',
      result: {
        outcome: won ? 'win' : 'lose',
        reason: won
          ? `最終フェーズ終了時に CS ${state.cs} ≥ 0 のため、チームは勝利しました。`
          : `最終フェーズ終了時に CS ${state.cs} < 0 のため、チームは敗北しました。`,
        // チーム敗北時は個人目標を評価しない(RULES.md §1)
        personalResults: Object.fromEntries(
          state.players.map((p) => [p.id, won ? evaluatePersonalWin(state, p) : false]),
        ),
      },
    }
  }

  // ── 次フェーズ開始(RULES.md §2-1):タスク公開 → 炎上 → イベント → トークン補充 ──
  let next: GameState = {
    ...state,
    phase: state.phase + 1,
    step: 'planning',
    readyPlayerIds: [],
    resolutionQueue: null,
    resolutionLog: [],
    nextTaskCostModifier: 0,
    outsourceCountThisPhase: 0,
    // フェーズ単位のカウンタ・記録をリセット
    players: state.players.map((p) => ({ ...p, tokensPlacedThisPhase: 0 })),
    taskArea: state.taskArea.map((t) => ({ ...t, extinguisherIds: [] })),
  }
  next = publishPhaseTasks(next, next.phase)
  return beginPhaseStart(next, true)
}
