/**
 * スマートプロジェクト ルールエンジン(v4)
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
export { requiredCubes, checkAcceptance } from './helpers'
export { taskLabel } from './actions/week'

export const ENGINE_VERSION = '0.4.0'
