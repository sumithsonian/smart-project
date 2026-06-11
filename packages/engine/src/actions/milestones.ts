/**
 * マイルストーン(RULES.md §11。v2.1)
 * 公開・早取り。条件を最初に満たした1人だけが獲得する。
 * applyAction の末尾で毎回チェックされる(同時達成はプレイヤー順で先の者)。
 */
import type { MilestoneCondition } from '../types/content'
import type { GameState, PlayerState } from '../types/state'

/** プレイヤーがマイルストーン条件を満たしているか */
export function meetsMilestone(
  state: GameState,
  player: PlayerState,
  condition: MilestoneCondition,
): boolean {
  switch (condition.type) {
    case 'EXTINGUISH_AT_LEAST':
      return player.extinguishCount >= condition.count
    case 'LV2_PARTICIPATED_AT_LEAST':
      return (
        state.deliverables.filter((d) => d.level === 2 && d.participants.includes(player.id))
          .length >= condition.count
      )
    case 'SKILL_UP_AT_LEAST':
      return player.skillUpCount >= condition.count
    case 'EP_AT_LEAST':
      return player.ep >= condition.amount
    case 'PHASE_PLACEMENTS_AT_LEAST':
      return player.tokensPlacedThisPhase >= condition.count
  }
}

/** 未獲得のマイルストーンを判定し、達成者がいれば刻む */
export function checkMilestones(state: GameState): GameState {
  if (!state.config.milestonesEnabled || state.milestones.length === 0) return state
  let changed = false
  const milestones = state.milestones.map((m) => {
    if (m.achievedBy !== null) return m
    const card = state.content.milestones.find((c) => c.id === m.cardId)
    if (!card) return m
    const achiever = state.players.find((p) => meetsMilestone(state, p, card.condition))
    if (!achiever) return m
    changed = true
    return { ...m, achievedBy: achiever.id }
  })
  return changed ? { ...state, milestones } : state
}

/** プレイヤーがいずれかのマイルストーンを獲得済みか(個人勝利判定用) */
export function hasMilestone(state: GameState, playerId: string): boolean {
  return state.milestones.some((m) => m.achievedBy === playerId)
}
