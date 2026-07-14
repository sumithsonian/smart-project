/**
 * 週末処理(rules-v4-core.md §1-2-3・§0)
 * 配属の効果を一括適用(残業疲労→休憩→学習→消火→キューブ→着席疲労)し、納品判定へ。
 */
import type { GameAction } from '../types/actions'
import type { GameState } from '../types/state'
import type { RuleViolation } from '../types/violation'
import { violation } from '../types/violation'
import {
  addFatigue,
  addLog,
  changeBudget,
  checkAcceptance,
  getBoardTask,
  getMember,
  getPlayer,
  getSlotDef,
  getSlotState,
  getTaskCard,
  requiredCubes,
  updateBoardTask,
  updateSlot,
} from '../helpers'
import { maybeStartLimitEvent } from './events'
import { startWeek, taskLabel } from './week'
import { processPhaseEnd } from './phaseEnd'

/** プレイヤーがこの配属で積むキューブ数(差し込みは最高スキル=総合対応力) */
function cubesFor(state: GameState, playerId: string, targetSkillOf: () => string | null): number {
  const player = getPlayer(state, playerId)!
  const skillKey = targetSkillOf()
  const base =
    skillKey === null
      ? Math.max(player.skills.direction, player.skills.design, player.skills.engineering)
      : player.skills[skillKey as keyof typeof player.skills]
  const expedite = state.expeditedPlayerIds.includes(playerId) ? 1 : 0
  return base + expedite
}

/**
 * 週末処理の本体(全員 Ready 時に呼ばれる)。
 * 終了後は step='weekend'(納品判定は DELIVER_TASK、締めは END_WEEKEND)。
 */
export function processWeekend(state: GameState): GameState {
  let next = state

  // ── 1. 残業疲労(「マルチタスク」持ちは免除)──
  for (const a of next.assignments) {
    if (!a.overtime) continue
    const member = getMember(next.content, getPlayer(next, a.playerId)!.memberId)
    if (member?.ability === 'multitask') continue
    next = addFatigue(next, a.playerId, next.config.overtimeFatigue)
  }
  // ── 2. 休憩 ──
  for (const a of next.assignments) {
    if (a.target.kind === 'rest') {
      next = addFatigue(next, a.playerId, -next.config.restRecovery)
    }
  }
  // ── 3. 学習(来週反映の予約)──
  for (const a of next.assignments) {
    if (a.target.kind === 'learn') {
      const skill = a.target.skill
      next = {
        ...next,
        players: next.players.map((p) =>
          p.id === a.playerId ? { ...p, pendingLearn: skill } : p,
        ),
      }
    }
  }
  // ── 4. 消火(納品判定より先。消してから納品できる)──
  for (const a of next.assignments) {
    if (a.target.kind === 'extinguish') {
      const cardId = a.target.cardId
      const task = getBoardTask(next, cardId)
      if (task && task.fire > 0) {
        next = updateBoardTask(next, cardId, (t) => ({ ...t, fire: t.fire - 1 }))
        next = addLog(next, `🧯 ${getPlayer(next, a.playerId)!.name} が「${taskLabel(next, task)}」を消火`)
      }
    }
  }
  // ── 5. キューブを積む(タスク/スロット)──
  for (const a of next.assignments) {
    if (a.target.kind === 'task') {
      const cardId = a.target.cardId
      const task = getBoardTask(next, cardId)
      if (!task) continue
      const card = getTaskCard(next.content, cardId)
      const cubes = cubesFor(next, a.playerId, () => (task.interrupt ? null : card!.skill))
      next = updateBoardTask(next, cardId, (t) => ({
        ...t,
        cubes: t.cubes + cubes,
        contributorIds: t.contributorIds.includes(a.playerId)
          ? t.contributorIds
          : [...t.contributorIds, a.playerId],
      }))
    } else if (a.target.kind === 'slot') {
      const slotId = a.target.slotId
      const def = getSlotDef(next.content, slotId)!
      const cubes = cubesFor(next, a.playerId, () => def.skill)
      const slot = getSlotState(next, slotId)!
      // 手戻りキューブの解消が先。余りは改修(Lv1のみ)に積む
      const toRework = Math.min(slot.reworkCubes, cubes)
      const toUpgrade = slot.level === 1 ? cubes - toRework : 0
      next = updateSlot(next, slotId, (s) => ({
        ...s,
        reworkCubes: s.reworkCubes - toRework,
        upgradeCubes: s.upgradeCubes + toUpgrade,
        contributorIds: s.contributorIds.includes(a.playerId)
          ? s.contributorIds
          : [...s.contributorIds, a.playerId],
      }))
      const after = getSlotState(next, slotId)!
      if (toRework > 0 && after.reworkCubes === 0) {
        next = addLog(next, `🔧 「${def.name}」の手戻りを解消`)
      }
      // 改修完了:upgradeCost 到達で Lv2
      if (after.level === 1 && after.upgradeCubes >= next.config.upgradeCost) {
        next = updateSlot(next, slotId, (s) => ({ ...s, level: 2, upgradeCubes: 0 }))
        next = addLog(next, `✨ 「${def.name}」を Lv2 に改修(安物買いの銭失いを返済)`)
      }
    }
  }
  // ── 6. 着席疲労(タスク=カードの疲労値(差し込みは1)、スロット=1)──
  for (const a of next.assignments) {
    if (a.target.kind === 'task') {
      const task = getBoardTask(next, a.target.cardId)
      const card = task ? getTaskCard(next.content, a.target.cardId) : undefined
      next = addFatigue(next, a.playerId, task?.interrupt ? 1 : (card?.fatigue ?? 1))
    } else if (a.target.kind === 'slot') {
      next = addFatigue(next, a.playerId, 1)
    }
  }

  // 手戻り解消・改修で検収条件が満ちた可能性
  next = checkAcceptance(next)
  next = { ...next, step: 'weekend', expeditedPlayerIds: [] }
  // 疲労上限到達者の限界イベント(解決後も weekend ステップが続く)
  return maybeStartLimitEvent(next)
}

/** DELIVER_TASK — 必要工数に達したタスクを納品する(週末) */
export function handleDeliverTask(
  state: GameState,
  action: Extract<GameAction, { type: 'DELIVER_TASK' }>,
): GameState | RuleViolation {
  if (state.step !== 'weekend') {
    return violation('INVALID_STEP', '納品は週末に行います。')
  }
  if (state.pendingEvent !== null) {
    return violation('PENDING_EVENT', '先にイベントを解決してください。')
  }
  const task = getBoardTask(state, action.cardId)
  if (!task) return violation('NOT_FOUND', `盤上にないタスクです: ${action.cardId}`)
  const needed = requiredCubes(state, task)
  if (task.cubes < needed) {
    return violation('CANNOT_DELIVER', `工数が足りません(${task.cubes}/${needed})。`)
  }

  // ── 差し込みの完了 ──
  if (task.interrupt) {
    let next: GameState = { ...state, board: state.board.filter((t) => t.cardId !== task.cardId) }
    if (task.interrupt === 'bug') {
      next = addLog(next, '🐛 バグ対応を完了(CS の出血が止まった)')
    } else {
      next = changeBudget(next, task.rewardBudget ?? 0)
      next = addLog(next, `💬 相談ごとに対応(予算+${task.rewardBudget ?? 0})`)
    }
    return next
  }

  // ── 通常タスクの納品 ──
  const card = getTaskCard(state.content, task.cardId)!
  if (state.budget < card.cost) {
    return violation('CANNOT_DELIVER', `実行コスト(${card.cost})に予算が足りません。追加請求を検討してください。`)
  }
  const level =
    card.maxLevel === 2 && task.cubes >= needed + state.config.qualityOvershoot ? 2 : 1
  let next = changeBudget(state, -card.cost)
  next = { ...next, board: next.board.filter((t) => t.cardId !== task.cardId) }
  next = updateSlot(next, card.slot, (s) => ({
    ...s,
    level: level as 1 | 2,
    upgradeCubes: 0,
    contributorIds: [...new Set([...s.contributorIds, ...task.contributorIds])],
  }))
  const slotName = getSlotDef(next.content, card.slot)?.name ?? card.slot
  next = addLog(next, `📦 「${card.name}」を納品!【${slotName}】が Lv${level} に(コスト${card.cost})`)
  return checkAcceptance(next)
}

/** END_WEEKEND — 週末を締めて次週(またはフェーズ終了)へ(PM) */
export function handleEndWeekend(
  state: GameState,
  action: Extract<GameAction, { type: 'END_WEEKEND' }>,
): GameState | RuleViolation {
  if (state.step !== 'weekend') {
    return violation('INVALID_STEP', '週末ではありません。')
  }
  if (state.pendingEvent !== null || state.pendingLimitPlayerIds.length > 0) {
    return violation('PENDING_EVENT', '先にイベントを解決してください。')
  }
  const player = getPlayer(state, action.playerId)
  if (!player) return violation('PLAYER_NOT_FOUND', `プレイヤーが見つかりません: ${action.playerId}`)
  if (state.pmPlayerId !== action.playerId) {
    return violation('NOT_PM', '週末を締めるのは PM 帽子の役目です。')
  }
  if (state.week < state.config.roundsPerPhase) {
    return startWeek(state, state.week + 1)
  }
  return processPhaseEnd(state)
}
