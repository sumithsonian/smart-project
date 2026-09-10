/**
 * スマートプロジェクト ルールエンジン(v5)
 * UI・DB・ネットワークから独立した純TypeScriptパッケージ。
 */
export * from './types'
export * from './content'
export { applyAction } from './applyAction'
export { replay } from './replay'
export { redactFor } from './redact'
export type { PlayerView, DeckView } from './redact'
export { createInitialState } from './initialState'
export { nextRandom, nextInt, shuffle } from './rng'
export { buildDeck, drawCard, discard } from './deck'
export {
  requiredCubes,
  estimatedCubes,
  cubesForTask,
  cubesForSlot,
  capacityPenalty,
  taskSkill,
  isTaskBlocked,
  unmetPrerequisites,
  riskyPrerequisiteCount,
  riskyPrerequisites,
  isSlotUsable,
  hasReworkCard,
  isRequirementFulfilled,
  refreshRequirements,
  weekLoad,
  getRequirementCard,
  getRequirement,
} from './helpers'
export type { WeekLoad } from './helpers'
export { taskLabel, skillName } from './actions/week'
export { tierLabel, weekLabel, riskLabel } from './actions/scope'
export { interruptLabel } from './actions/events'

export const ENGINE_VERSION = '0.5.1'
