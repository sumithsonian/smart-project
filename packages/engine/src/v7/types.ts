import type { SkillKind } from '../types/content'

/** v7試作の調整値。1ワーカー=1有効営業日。 */
export interface V7Config {
  initialWorkdays: number
  maxWorkdays: number
  urgentHandoffCost: number
  roundsPerPhase: number
}

export const V7_DEFAULT_CONFIG: V7Config = {
  initialWorkdays: 3,
  maxWorkdays: 5,
  urgentHandoffCost: 3,
  roundsPerPhase: 3,
}

export interface V7PlayerInput {
  id: string
  name: string
  skills: Record<SkillKind, number>
}

export interface V7Player extends V7PlayerInput {
  /** 今週使える有効営業日。学習で最大5まで増える。 */
  workdayCapacity: number
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
  effort: number
  prerequisiteSlotIds: string[]
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
  kind: 'work' | 'handoff' | 'urgent_handoff'
}

export interface V7PendingHandoff {
  taskId: string
  role: 'lead' | 'support'
  fromPlayerId: string
  toPlayerId: string
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
  log: string[]
}

