import type { SkillKind } from '../types/content'

/** v7試作の調整値。1ワーカー=1有効営業日。 */
export interface V7Config {
  initialWorkdays: number
  maxWorkdays: number
  urgentHandoffCost: number
  roundsPerPhase: number
  fireSpreadThreshold: number
  learningCostTo4: number
  learningCostTo5: number
  initialBudget: number
  fatigueMax: number
  restRecovery: number
  activeTaskLimit: number
}

export const V7_DEFAULT_CONFIG: V7Config = {
  initialWorkdays: 3,
  maxWorkdays: 5,
  urgentHandoffCost: 3,
  roundsPerPhase: 3,
  fireSpreadThreshold: 3,
  learningCostTo4: 2,
  learningCostTo5: 3,
  initialBudget: 12,
  fatigueMax: 4,
  restRecovery: 2,
  activeTaskLimit: 4,
}

export interface V7PlayerInput {
  id: string
  name: string
  skills: Record<SkillKind, number>
}

export interface V7Player extends V7PlayerInput {
  /** 今週使える有効営業日。学習で最大5まで増える。 */
  workdayCapacity: number
  learningProgress: number
  pendingCapacityGain: number
  fatigue: number
}

export interface V7DeliverableSlot {
  id: string
  name: string
  completedByTaskId: string | null
}

export interface V7TaskDefinition {
  id: string
  name: string
  /** 埋める成果物枠 */
  slotId: string
  skill: SkillKind
  /** 主担当に必要なスキルレベル。 */
  requiredSkillLevel?: number
  effort: number
  prerequisiteSlotIds: string[]
  /** 完成品質。Lv2は次フェーズに資産を残す。 */
  quality?: 1 | 2
  /** 完成時に支払う外部費用。 */
  cost?: number
  /** その週に着手した担当者へ加わる疲労。 */
  fatigue?: 1 | 2
}

export type V7TaskStatus = 'planned' | 'active' | 'completed'

export interface V7BoardTask {
  taskId: string
  slotId: string
  progress: number
  fire: number
  status: V7TaskStatus
  leadPlayerId: string | null
  supportPlayerId: string | null
}

export interface V7WorkAllocation {
  playerId: string
  taskId: string
  days: number
  kind: 'work' | 'handoff' | 'urgent_handoff' | 'learning' | 'incident' | 'fire' | 'rest'
}

export interface V7PendingHandoff {
  taskId: string
  role: 'lead' | 'support'
  fromPlayerId: string
  toPlayerId: string
}

export type V7IncidentStatus = 'unknown' | 'investigated' | 'resolved'
export type V7SpreadTarget = 'prerequisites' | 'dependents' | 'same_skill' | 'same_lead' | 'cs'

export interface V7Incident {
  id: string
  name: string
  taskId: string
  ownerPlayerId: string | null
  status: V7IncidentStatus
  investigationRequired: number
  investigationProgress: number
  resolutionRequired: number
  resolutionProgress: number
  spreadTarget: V7SpreadTarget
  spreadTriggered: boolean
  source: 'personal' | 'project'
}

export interface V7EventDefinition {
  id: string
  name: string
  source: 'personal' | 'project'
  tone: 'bad' | 'neutral' | 'good'
  fire?: number
  investigationRequired?: number
  resolutionRequired?: number
  spreadTarget?: V7SpreadTarget
  capacityDelta?: number
}

export type V7TileKind = 'asset' | 'debt'
export interface V7CarryoverTile {
  id: string
  kind: V7TileKind
  name: string
  source: string
  skill?: SkillKind
  effortModifier: number
}

export interface V7Metrics {
  normalHandoffs: number
  urgentHandoffs: number
  fireActions: number
  learningDays: number
  parallelWorkWeeks: number
}

export interface V7State {
  config: V7Config
  phase: number
  week: number
  players: V7Player[]
  taskDefinitions: V7TaskDefinition[]
  slots: V7DeliverableSlot[]
  board: V7BoardTask[]
  allocations: V7WorkAllocation[]
  pendingHandoffs: V7PendingHandoff[]
  /** 緊急引き継ぎで今週使える原因究明／消火クレジット。 */
  emergencyResponseCredits: Record<string, number>
  incidents: V7Incident[]
  carryoverDeck: V7CarryoverTile[]
  availableTiles: V7CarryoverTile[]
  metrics: V7Metrics
  cs: number
  budget: number
  log: string[]
}
