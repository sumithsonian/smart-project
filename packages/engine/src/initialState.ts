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
      acceptance: [],
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
    openAcceptanceIds: [],
    commitments: [],
    metAcceptanceIds: [],
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
    pendingWeekEventDraw: false,
    pendingEvent: null,
    pendingLimitPlayerIds: [],
    negotiationUsedPhase: 0,
    extraBillingUsedThisPhase: 0,
    expeditedPlayerIds: [],
    placementCounter: 0,
    lanePlacedCount: { start: 0, middle: 0, finish: 0 },
    log: [],
    result: null,
  }
}
