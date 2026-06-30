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
      tasks: [],
      events: [],
      requirements: [],
      limitEvents: [],
      personalGoals: [],
      milestones: [],
      clients: [],
      projects: [],
      projectSheets: [],
      roles: [],
    },
    step: 'setup',
    phase: 0,
    cs: 0,
    budget: 0,
    initialBudget: 0,
    clientId: '',
    projectCardId: '',
    projectSheetId: '',
    players: [],
    taskArea: [],
    deliverables: [],
    decks: {
      events: { drawPile: [], discardPile: [] },
      requirements: { drawPile: [], discardPile: [] },
      limitEvents: { drawPile: [], discardPile: [] },
      fires: { drawPile: [], discardPile: [] },
    },
    rng: { seed: 0 },
    readyPlayerIds: [],
    resolutionQueue: null,
    pendingRequirementChoice: null,
    pendingEvent: null,
    replenishAfterEvent: false,
    pendingLimitPlayerIds: [],
    nextTaskCostModifier: 0,
    remainingFireDraws: 0,
    pendingEpidemicCount: 0,
    outsourceCountThisPhase: 0,
    phaseStartReplenish: null,
    fireLog: [],
    taskParticipants: {},
    milestones: [],
    resolutionLog: [],
    lastPhaseSummary: null,
    result: null,
  }
}
