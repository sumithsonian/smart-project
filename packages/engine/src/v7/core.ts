import type { RuleViolation } from '../types/violation'
import { violation } from '../types/violation'
import type {
  V7BoardTask,
  V7Config,
  V7DeliverableSlot,
  V7PlayerInput,
  V7State,
  V7TaskDefinition,
  V7WorkAllocation,
} from './types'
import { V7_DEFAULT_CONFIG } from './types'

export type V7Result = V7State | RuleViolation

export function createV7State(input: {
  players: V7PlayerInput[]
  tasks: V7TaskDefinition[]
  slots: Array<Pick<V7DeliverableSlot, 'id' | 'name'>>
  config?: Partial<V7Config>
}): V7State {
  const config = { ...V7_DEFAULT_CONFIG, ...input.config }
  return {
    config,
    phase: 1,
    week: 1,
    players: input.players.map((player) => ({
      ...player,
      workdayCapacity: config.initialWorkdays,
    })),
    taskDefinitions: input.tasks,
    slots: input.slots.map((slot) => ({ ...slot, completedByTaskId: null })),
    board: [],
    allocations: [],
    pendingHandoffs: [],
    emergencyResponseCredits: {},
    log: [],
  }
}

function taskDefinition(state: V7State, taskId: string): V7TaskDefinition | undefined {
  return state.taskDefinitions.find((task) => task.id === taskId)
}

function boardTask(state: V7State, taskId: string): V7BoardTask | undefined {
  return state.board.find((task) => task.taskId === taskId)
}

function usedDays(state: V7State, playerId: string): number {
  return state.allocations
    .filter((allocation) => allocation.playerId === playerId)
    .reduce((total, allocation) => total + allocation.days, 0)
}

function reserveDays(
  state: V7State,
  playerId: string,
  taskId: string,
  days: number,
  kind: V7WorkAllocation['kind'],
): V7Result {
  const player = state.players.find((candidate) => candidate.id === playerId)
  if (!player) return violation('PLAYER_NOT_FOUND', `プレイヤーが見つかりません: ${playerId}`)
  if (!Number.isInteger(days) || days <= 0) {
    return violation('INVALID_TARGET', '営業日は1以上の整数で指定してください。')
  }
  if (usedDays(state, playerId) + days > player.workdayCapacity) {
    return violation(
      'LIMIT_REACHED',
      `${player.name}の有効営業日${player.workdayCapacity}日を超えています。`,
    )
  }
  return {
    ...state,
    allocations: [...state.allocations, { playerId, taskId, days, kind }],
  }
}

/** 候補からタスクを1枚選び、対応する成果物枠へ置く。 */
export function planV7Task(state: V7State, taskId: string): V7Result {
  const definition = taskDefinition(state, taskId)
  if (!definition) return violation('NOT_FOUND', `タスクが見つかりません: ${taskId}`)
  if (boardTask(state, taskId)) return violation('ALREADY_ASSIGNED', 'すでに計画済みのタスクです。')
  if (state.slots.find((slot) => slot.id === definition.slotId)?.completedByTaskId) {
    return violation('INVALID_TARGET', 'この成果物枠はすでに完成しています。')
  }
  if (state.board.some((task) => task.slotId === definition.slotId && task.status !== 'completed')) {
    return violation('INVALID_TARGET', 'この成果物枠にはすでに別のタスクを計画しています。')
  }
  if (!state.slots.some((slot) => slot.id === definition.slotId)) {
    return violation('NOT_FOUND', `成果物枠が見つかりません: ${definition.slotId}`)
  }
  return {
    ...state,
    board: [
      ...state.board,
      {
        taskId,
        slotId: definition.slotId,
        progress: 0,
        fire: 0,
        status: 'planned',
        leadPlayerId: null,
        supportPlayerId: null,
      },
    ],
    log: [...state.log, `🗂「${definition.name}」を計画へ追加`],
  }
}

function hasRole(state: V7State, playerId: string, role: 'lead' | 'support'): boolean {
  return state.board.some((task) =>
    role === 'lead' ? task.leadPlayerId === playerId : task.supportPlayerId === playerId,
  )
}

/** 初回着手前のタスクへ主担当を決める。 */
export function assignV7Lead(state: V7State, playerId: string, taskId: string): V7Result {
  if (!state.players.some((player) => player.id === playerId)) {
    return violation('PLAYER_NOT_FOUND', `プレイヤーが見つかりません: ${playerId}`)
  }
  const task = boardTask(state, taskId)
  if (!task) return violation('NOT_FOUND', `計画上のタスクが見つかりません: ${taskId}`)
  if (task.status === 'completed') return violation('INVALID_TARGET', '完成済みタスクです。')
  if (task.leadPlayerId) return violation('ALREADY_ASSIGNED', '主担当はすでに決まっています。')
  if (hasRole(state, playerId, 'lead')) {
    return violation('LIMIT_REACHED', '主担当は同時に1タスクまでです。')
  }
  return {
    ...state,
    board: state.board.map((candidate) =>
      candidate.taskId === taskId ? { ...candidate, leadPlayerId: playerId } : candidate,
    ),
  }
}

/** タスクへ副担当を決める。 */
export function assignV7Support(state: V7State, playerId: string, taskId: string): V7Result {
  if (!state.players.some((player) => player.id === playerId)) {
    return violation('PLAYER_NOT_FOUND', `プレイヤーが見つかりません: ${playerId}`)
  }
  const task = boardTask(state, taskId)
  if (!task) return violation('NOT_FOUND', `計画上のタスクが見つかりません: ${taskId}`)
  if (!task.leadPlayerId) return violation('INVALID_TARGET', '先に主担当を決めてください。')
  if (task.leadPlayerId === playerId) return violation('INVALID_TARGET', '主担当と副担当は兼任できません。')
  if (task.supportPlayerId) return violation('ALREADY_ASSIGNED', '副担当はすでに決まっています。')
  if (hasRole(state, playerId, 'support')) {
    return violation('LIMIT_REACHED', '副担当は同時に1タスクまでです。')
  }
  return {
    ...state,
    board: state.board.map((candidate) =>
      candidate.taskId === taskId ? { ...candidate, supportPlayerId: playerId } : candidate,
    ),
  }
}

function prerequisitesMet(state: V7State, definition: V7TaskDefinition): boolean {
  return definition.prerequisiteSlotIds.every(
    (slotId) => state.slots.find((slot) => slot.id === slotId)?.completedByTaskId !== null,
  )
}

/** 担当タスクへ今週の営業日を配分する。進捗は週末に一括解決する。 */
export function allocateV7Workdays(
  state: V7State,
  playerId: string,
  taskId: string,
  days: number,
): V7Result {
  const task = boardTask(state, taskId)
  const definition = taskDefinition(state, taskId)
  if (!task || !definition) return violation('NOT_FOUND', `タスクが見つかりません: ${taskId}`)
  if (task.status === 'completed') return violation('INVALID_TARGET', '完成済みタスクです。')
  if (task.fire > 0) return violation('TASK_BLOCKED', '炎上中のため通常進捗を置けません。')
  if (!prerequisitesMet(state, definition)) {
    return violation('TASK_BLOCKED', '前提成果物が未完成です。')
  }
  if (task.leadPlayerId !== playerId && task.supportPlayerId !== playerId) {
    return violation('NOT_ASSIGNED', '主担当または副担当だけが工数を置けます。')
  }
  return reserveDays(state, playerId, taskId, days, 'work')
}

/** 通常引き継ぎ。双方1営業日を使い、週末に担当を交代する。 */
export function scheduleV7Handoff(
  state: V7State,
  input: {
    taskId: string
    role: 'lead' | 'support'
    fromPlayerId: string
    toPlayerId: string
  },
): V7Result {
  const task = boardTask(state, input.taskId)
  if (!task) return violation('NOT_FOUND', `タスクが見つかりません: ${input.taskId}`)
  const current = input.role === 'lead' ? task.leadPlayerId : task.supportPlayerId
  if (current !== input.fromPlayerId) return violation('INVALID_TARGET', '引き継ぎ元が現在の担当者ではありません。')
  if (hasRole(state, input.toPlayerId, input.role)) {
    return violation('LIMIT_REACHED', `${input.role === 'lead' ? '主' : '副'}担当の上限です。`)
  }
  let next = reserveDays(state, input.fromPlayerId, input.taskId, 1, 'handoff')
  if ('type' in next) return next
  next = reserveDays(next, input.toPlayerId, input.taskId, 1, 'handoff')
  if ('type' in next) return next
  return {
    ...next,
    pendingHandoffs: [...next.pendingHandoffs, input],
  }
}

/** 3営業日を使う緊急引き継ぎ。即時交代し、炎上対応クレジットを1得る。 */
export function urgentV7Handoff(
  state: V7State,
  input: { taskId: string; role: 'lead' | 'support'; toPlayerId: string },
): V7Result {
  const task = boardTask(state, input.taskId)
  if (!task) return violation('NOT_FOUND', `タスクが見つかりません: ${input.taskId}`)
  if (hasRole(state, input.toPlayerId, input.role)) {
    return violation('LIMIT_REACHED', `${input.role === 'lead' ? '主' : '副'}担当の上限です。`)
  }
  const reserved = reserveDays(
    state,
    input.toPlayerId,
    input.taskId,
    state.config.urgentHandoffCost,
    'urgent_handoff',
  )
  if ('type' in reserved) return reserved
  return {
    ...reserved,
    board: reserved.board.map((candidate) =>
      candidate.taskId === input.taskId
        ? {
            ...candidate,
            ...(input.role === 'lead'
              ? { leadPlayerId: input.toPlayerId }
              : { supportPlayerId: input.toPlayerId }),
          }
        : candidate,
    ),
    emergencyResponseCredits: {
      ...reserved.emergencyResponseCredits,
      [input.toPlayerId]: (reserved.emergencyResponseCredits[input.toPlayerId] ?? 0) + 1,
    },
  }
}

/** 引き継ぎせず主担当を外す。対象は炎上し、主担当不在になる。 */
export function leaveV7Lead(state: V7State, playerId: string, taskId: string): V7Result {
  const task = boardTask(state, taskId)
  if (!task) return violation('NOT_FOUND', `タスクが見つかりません: ${taskId}`)
  if (task.leadPlayerId !== playerId) return violation('INVALID_TARGET', '現在の主担当ではありません。')
  return {
    ...state,
    board: state.board.map((candidate) =>
      candidate.taskId === taskId
        ? { ...candidate, leadPlayerId: null, fire: candidate.fire + 1 }
        : candidate,
    ),
    log: [...state.log, `🔥 引き継ぎなしで離脱し「${taskId}」が炎上`],
  }
}

/** 週末解決。工数反映、完成、通常引き継ぎを処理し、営業日を戻す。 */
export function resolveV7Week(state: V7State): V7State {
  let board = state.board.map((task) => ({ ...task }))
  const log = [...state.log]

  for (const task of board) {
    const definition = taskDefinition(state, task.taskId)
    if (!definition || task.status === 'completed') continue
    const allocations = state.allocations.filter(
      (allocation) => allocation.taskId === task.taskId && allocation.kind === 'work',
    )
    if (allocations.length === 0) continue
    let gain = allocations.reduce((total, allocation) => total + allocation.days, 0)
    const leadAllocation = allocations.find(
      (allocation) => allocation.playerId === task.leadPlayerId,
    )
    if (leadAllocation) {
      const lead = state.players.find((player) => player.id === leadAllocation.playerId)
      gain += Math.max(0, (lead?.skills[definition.skill] ?? 1) - 1)
    }
    task.progress += gain
    task.status = task.progress >= definition.effort ? 'completed' : 'active'
    if (task.status === 'completed') {
      task.leadPlayerId = null
      task.supportPlayerId = null
      log.push(`✅「${definition.name}」が完成`)
    }
  }

  let slots = state.slots.map((slot) => ({ ...slot }))
  for (const task of board.filter((candidate) => candidate.status === 'completed')) {
    slots = slots.map((slot) =>
      slot.id === task.slotId && slot.completedByTaskId === null
        ? { ...slot, completedByTaskId: task.taskId }
        : slot,
    )
  }

  for (const handoff of state.pendingHandoffs) {
    board = board.map((task) =>
      task.taskId === handoff.taskId && task.status !== 'completed'
        ? {
            ...task,
            ...(handoff.role === 'lead'
              ? { leadPlayerId: handoff.toPlayerId }
              : { supportPlayerId: handoff.toPlayerId }),
          }
        : task,
    )
  }

  const nextWeek = state.week >= state.config.roundsPerPhase ? 1 : state.week + 1
  const nextPhase = state.week >= state.config.roundsPerPhase ? state.phase + 1 : state.phase
  return {
    ...state,
    phase: nextPhase,
    week: nextWeek,
    board,
    slots,
    allocations: [],
    pendingHandoffs: [],
    emergencyResponseCredits: {},
    log,
  }
}
