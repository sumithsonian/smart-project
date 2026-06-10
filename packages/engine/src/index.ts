/**
 * スマートプロジェクト ルールエンジン
 * UI・DB・ネットワークから独立した純TypeScriptパッケージ。
 */
export * from './types'
export * from './content'
export { applyAction } from './applyAction'
export { replay } from './replay'
export { createInitialState } from './initialState'
export { nextRandom, nextInt, shuffle } from './rng'
export { buildDeck, drawCard, discard } from './deck'

export const ENGINE_VERSION = '0.1.0'
