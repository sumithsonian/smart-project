/**
 * セットアップ前の空状態
 */
import type { GameState } from './types/state'
import { DEFAULT_CONFIG } from './types/config'

/** SETUP_GAME 適用前の初期状態を作る */
export function createInitialState(): GameState {
  return {
    config: DEFAULT_CONFIG,
    content: {
      slots: [],
      tasks: [],
      requirements: [],
      events: [],
      fires: [],
      limitEvents: [],
      members: [],
      projectSheets: [],
    },
    step: 'setup',
    phase: 0,
    week: 0,
    cs: 0,
    budget: 0,
    projectSheetId: '',
    pmPlayerId: '',
    players: [],
    taskPool: [],
    board: [],
    slots: [],
    requirements: [],
    csAwardedRequirementIds: [],
    csAwardedEventIds: [],
    decks: {
      tasks: { drawPile: [], discardPile: [] },
      events: { drawPile: [], discardPile: [] },
      fires: { drawPile: [], discardPile: [] },
      limitEvents: { drawPile: [], discardPile: [] },
    },
    rng: { seed: 0 },
    assignments: [],
    readyPlayerIds: [],
    remainingFireDraws: 0,
    pendingWeekendEventDraw: false,
    pendingEvent: null,
    pendingLimitPlayerIds: [],
    scopeChangeUsedThisPhase: 0,
    redrawUsedThisPhase: 0,
    extraBillingUsedThisPhase: 0,
    expeditedPlayerIds: [],
    placementCounter: 0,
    log: [],
    result: null,
  }
}
