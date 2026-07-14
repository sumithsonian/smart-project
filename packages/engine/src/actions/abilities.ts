/**
 * 個人能力(メンバーカード。フェーズ1回・行動枠を使わない)(rules-v4-core.md §3)
 * multitask はパッシブのため USE_ABILITY の対象外。
 */
import type { GameAction } from '../types/actions'
import type { GameState } from '../types/state'
import type { RuleViolation } from '../types/violation'
import { violation } from '../types/violation'
import {
  addLog,
  checkAcceptance,
  getBoardTask,
  getMember,
  getPlayer,
  getSlotDef,
  getSlotState,
  updateBoardTask,
  updatePlayer,
  updateSlot,
} from '../helpers'
import { taskLabel } from './week'

export function handleUseAbility(
  state: GameState,
  action: Extract<GameAction, { type: 'USE_ABILITY' }>,
): GameState | RuleViolation {
  const player = getPlayer(state, action.playerId)
  if (!player) return violation('PLAYER_NOT_FOUND', `プレイヤーが見つかりません: ${action.playerId}`)
  if (state.pendingEvent !== null) {
    return violation('PENDING_EVENT', '先にイベントを解決してください。')
  }
  if (player.abilityUsedPhase === state.phase) {
    return violation('LIMIT_REACHED', '個人能力はフェーズに1回までです。')
  }
  const member = getMember(state.content, player.memberId)!

  switch (member.ability) {
    case 'multitask':
      return violation('INVALID_TARGET', 'マルチタスクはパッシブ能力です(残業疲労が常に免除)。')

    case 'expedite': {
      // 段取り:朝会で宣言。今週自分の積むキューブ+1
      if (state.step !== 'standup') {
        return violation('INVALID_STEP', '「段取り」は朝会中に宣言します。')
      }
      let next = updatePlayer(state, player.id, (p) => ({ ...p, abilityUsedPhase: state.phase }))
      next = { ...next, expeditedPlayerIds: [...next.expeditedPlayerIds, player.id] }
      return addLog(next, `⚡ ${player.name} の「段取り」:今週の積むキューブ+1`)
    }

    case 'polish': {
      // 磨き込み:週末に、納品済みスロット1つを Lv1→Lv2
      if (state.step !== 'weekend') {
        return violation('INVALID_STEP', '「磨き込み」は週末に使います。')
      }
      if (!action.slotId) return violation('INVALID_TARGET', '対象スロットを指定してください。')
      const slot = getSlotState(state, action.slotId)
      if (!slot || slot.level !== 1 || slot.reworkCubes > 0) {
        return violation('INVALID_TARGET', 'Lv1 で手戻りのないスロットだけ磨き込めます。')
      }
      let next = updatePlayer(state, player.id, (p) => ({ ...p, abilityUsedPhase: state.phase }))
      next = updateSlot(next, action.slotId, (s) => ({
        ...s,
        level: 2,
        contributorIds: s.contributorIds.includes(player.id)
          ? s.contributorIds
          : [...s.contributorIds, player.id],
      }))
      const name = getSlotDef(next.content, action.slotId)?.name ?? action.slotId
      next = addLog(next, `💎 ${player.name} の「磨き込み」:【${name}】が Lv2 に`)
      return checkAcceptance(next)
    }

    case 'automate': {
      // 自動化:未納品タスク1つの必要工数-1
      if (state.step !== 'standup' && state.step !== 'weekend') {
        return violation('INVALID_STEP', '「自動化」は朝会または週末に使います。')
      }
      if (!action.cardId) return violation('INVALID_TARGET', '対象タスクを指定してください。')
      const task = getBoardTask(state, action.cardId)
      if (!task) return violation('NOT_FOUND', `盤上にないタスクです: ${action.cardId}`)
      let next = updatePlayer(state, player.id, (p) => ({ ...p, abilityUsedPhase: state.phase }))
      next = updateBoardTask(next, action.cardId, (t) => ({
        ...t,
        effortReduction: t.effortReduction + 1,
      }))
      return addLog(next, `🤖 ${player.name} の「自動化」:「${taskLabel(next, task)}」の必要工数-1`)
    }
  }
}
