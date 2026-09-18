import type { RuleViolation } from '../types/violation'
import { violation } from '../types/violation'
import type {
  V7BoardTask,
  V7CarryoverTile,
  V7Config,
  V7DeliverableSlot,
  V7EventDefinition,
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
      learningProgress: 0,
      pendingCapacityGain: 0,
    })),
    taskDefinitions: input.tasks,
    slots: input.slots.map((slot) => ({ ...slot, completedByTaskId: null })),
    board: [],
    allocations: [],
    pendingHandoffs: [],
    emergencyResponseCredits: {},
    incidents: [],
    carryoverDeck: [],
    availableTiles: [],
    metrics: {
      normalHandoffs: 0,
      urgentHandoffs: 0,
      fireActions: 0,
      learningDays: 0,
      parallelWorkWeeks: 0,
    },
    cs: 5,
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
    metrics: { ...next.metrics, normalHandoffs: next.metrics.normalHandoffs + 1 },
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
  const incident = reserved.incidents.find(
    (candidate) => candidate.taskId === input.taskId && candidate.status === 'unknown',
  )
  return {
    ...reserved,
    board: reserved.board.map((candidate) =>
      candidate.taskId === input.taskId
        ? {
            ...candidate,
            fire:
              !incident && candidate.fire > 0
                ? candidate.fire - 1
                : candidate.fire,
            ...(input.role === 'lead'
              ? { leadPlayerId: input.toPlayerId }
              : { supportPlayerId: input.toPlayerId }),
          }
        : candidate,
    ),
    incidents: reserved.incidents.map((candidate) => {
      if (candidate.id !== incident?.id) return candidate
      const progress = candidate.investigationProgress + 1
      return {
        ...candidate,
        investigationProgress: progress,
        status: progress >= candidate.investigationRequired ? 'investigated' : 'unknown',
      }
    }),
    emergencyResponseCredits: {
      ...reserved.emergencyResponseCredits,
      [input.toPlayerId]: (reserved.emergencyResponseCredits[input.toPlayerId] ?? 0) + 1,
    },
    metrics: { ...reserved.metrics, urgentHandoffs: reserved.metrics.urgentHandoffs + 1 },
  }
}

/** 学習へ営業日を投資する。解放は週末に予約され、次週から反映される。 */
export function allocateV7Learning(state: V7State, playerId: string, days: number): V7Result {
  const player = state.players.find((candidate) => candidate.id === playerId)
  if (!player) return violation('PLAYER_NOT_FOUND', `プレイヤーが見つかりません: ${playerId}`)
  if (player.workdayCapacity + player.pendingCapacityGain >= state.config.maxWorkdays) {
    return violation('SKILL_MAX', '5営業日すべて解放済みです。')
  }
  const reserved = reserveDays(state, playerId, 'learning', days, 'learning')
  if ('type' in reserved) return reserved
  const required =
    player.workdayCapacity + player.pendingCapacityGain === 3
      ? state.config.learningCostTo4
      : state.config.learningCostTo5
  const total = player.learningProgress + days
  const unlock = total >= required ? 1 : 0
  return {
    ...reserved,
    players: reserved.players.map((candidate) =>
      candidate.id === playerId
        ? {
            ...candidate,
            learningProgress: unlock ? total - required : total,
            pendingCapacityGain: candidate.pendingCapacityGain + unlock,
          }
        : candidate,
    ),
    metrics: { ...reserved.metrics, learningDays: reserved.metrics.learningDays + days },
    log: unlock ? [...reserved.log, `📚 ${player.name}は次週から営業日+1`] : reserved.log,
  }
}

/** 条件カード達成による営業日解放。効果は次週から。 */
export function unlockV7WorkdayByCondition(
  state: V7State,
  playerId: string,
  conditionName: string,
): V7Result {
  const player = state.players.find((candidate) => candidate.id === playerId)
  if (!player) return violation('PLAYER_NOT_FOUND', `プレイヤーが見つかりません: ${playerId}`)
  if (player.workdayCapacity + player.pendingCapacityGain >= state.config.maxWorkdays) {
    return violation('SKILL_MAX', '5営業日すべて解放済みです。')
  }
  return {
    ...state,
    players: state.players.map((candidate) =>
      candidate.id === playerId
        ? { ...candidate, pendingCapacityGain: candidate.pendingCapacityGain + 1 }
        : candidate,
    ),
    log: [...state.log, `🏅 ${conditionName}: ${player.name}は次週から営業日+1`],
  }
}

function canRespondToTask(state: V7State, playerId: string, taskId: string): boolean {
  const task = boardTask(state, taskId)
  return task?.leadPlayerId === playerId || task?.supportPlayerId === playerId
}

/** 外的イベントを発生させる。悪いイベントだけが複数週インシデントになる。 */
export function triggerV7Event(
  state: V7State,
  event: V7EventDefinition,
  input: { taskId?: string; playerId?: string } = {},
): V7Result {
  const targetTask = input.taskId ? boardTask(state, input.taskId) : undefined
  const targets =
    event.source === 'project'
      ? state.board.filter((task) => task.status !== 'completed')
      : targetTask
        ? [targetTask]
        : []
  if (event.tone === 'bad' && targets.length === 0) {
    return violation('INVALID_TARGET', '悪いイベントには対象タスクが必要です。')
  }
  let next = state
  if (targets.length > 0 && (event.fire ?? 0) > 0) {
    const targetIds = new Set(targets.map((task) => task.taskId))
    next = {
      ...next,
      board: next.board.map((task) =>
        targetIds.has(task.taskId) ? { ...task, fire: task.fire + (event.fire ?? 0) } : task,
      ),
    }
  }
  if (event.tone === 'bad' && targets.length > 0 && (event.investigationRequired ?? 0) > 0) {
    next = {
      ...next,
      incidents: [
        ...next.incidents,
        ...targets.map((task, index) => ({
          id: `${event.id}-${next.phase}-${next.week}-${next.incidents.length + index + 1}`,
          name: event.name,
          taskId: task.taskId,
          ownerPlayerId: input.playerId ?? null,
          status: 'unknown' as const,
          investigationRequired: event.investigationRequired ?? 1,
          investigationProgress: 0,
          resolutionRequired: event.resolutionRequired ?? 1,
          resolutionProgress: 0,
          spreadTarget: event.spreadTarget ?? 'dependents',
          spreadTriggered: false,
          source: event.source,
        })),
      ],
    }
  }
  if (input.playerId && event.capacityDelta && event.capacityDelta > 0) {
    const unlocked = unlockV7WorkdayByCondition(next, input.playerId, event.name)
    if (!('type' in unlocked)) next = unlocked
  }
  return { ...next, log: [...next.log, `🎴 ${event.name}`] }
}

function spendOnIncident(
  state: V7State,
  incidentId: string,
  playerId: string,
  days: number,
  action: 'investigate' | 'resolve',
): V7Result {
  const incident = state.incidents.find((candidate) => candidate.id === incidentId)
  if (!incident) return violation('NOT_FOUND', `炎上カードが見つかりません: ${incidentId}`)
  if (!canRespondToTask(state, playerId, incident.taskId)) {
    return violation('NOT_ASSIGNED', '担当者だけが炎上対応できます。先に引き継いでください。')
  }
  if (action === 'investigate' && incident.status !== 'unknown') {
    return violation('INVALID_TARGET', '原因究明済みです。')
  }
  if (action === 'resolve' && incident.status !== 'investigated') {
    return violation('TASK_BLOCKED', '先に原因を究明してください。')
  }
  const reserved = reserveDays(state, playerId, incident.taskId, days, 'incident')
  if ('type' in reserved) return reserved
  return {
    ...reserved,
    incidents: reserved.incidents.map((candidate) => {
      if (candidate.id !== incidentId) return candidate
      if (action === 'investigate') {
        const progress = candidate.investigationProgress + days
        return {
          ...candidate,
          investigationProgress: progress,
          status: progress >= candidate.investigationRequired ? 'investigated' : 'unknown',
        }
      }
      const progress = candidate.resolutionProgress + days
      return {
        ...candidate,
        resolutionProgress: progress,
        status: progress >= candidate.resolutionRequired ? 'resolved' : 'investigated',
      }
    }),
    metrics: { ...reserved.metrics, fireActions: reserved.metrics.fireActions + days },
  }
}

export function investigateV7Incident(state: V7State, incidentId: string, playerId: string, days = 1) {
  return spendOnIncident(state, incidentId, playerId, days, 'investigate')
}

export function resolveV7Incident(state: V7State, incidentId: string, playerId: string, days = 1) {
  return spendOnIncident(state, incidentId, playerId, days, 'resolve')
}

/** 通常炎上、または原因解決済みの炎上を1つ消す。 */
export function extinguishV7Fire(state: V7State, taskId: string, playerId: string): V7Result {
  const task = boardTask(state, taskId)
  if (!task) return violation('NOT_FOUND', `タスクが見つかりません: ${taskId}`)
  if (task.fire <= 0) return violation('NO_FIRE', '消火する炎上がありません。')
  if (!canRespondToTask(state, playerId, taskId)) {
    return violation('NOT_ASSIGNED', '担当者だけが消火できます。')
  }
  if (state.incidents.some((incident) => incident.taskId === taskId && incident.status !== 'resolved')) {
    return violation('TASK_BLOCKED', '原因を解決するまで炎上トークンを除去できません。')
  }
  const reserved = reserveDays(state, playerId, taskId, 1, 'fire')
  if ('type' in reserved) return reserved
  return {
    ...reserved,
    board: reserved.board.map((candidate) =>
      candidate.taskId === taskId ? { ...candidate, fire: candidate.fire - 1 } : candidate,
    ),
    metrics: { ...reserved.metrics, fireActions: reserved.metrics.fireActions + 1 },
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
  let cs = state.cs

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
    const carryoverModifier = state.availableTiles
      .filter((tile) => !tile.skill || tile.skill === definition.skill)
      .reduce((total, tile) => total + tile.effortModifier, 0)
    const effectiveEffort = Math.max(1, definition.effort + carryoverModifier)
    task.status = task.progress >= effectiveEffort ? 'completed' : 'active'
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

  const incidents = state.incidents.map((incident) => ({ ...incident }))
  for (const incident of incidents) {
    const task = board.find((candidate) => candidate.taskId === incident.taskId)
    if (!task || task.status === 'completed') continue
    if (incident.status === 'unknown') {
      task.fire += 1
      log.push(`🔥「${incident.name}」の原因未究明: ${incident.taskId}へ🔥+1`)
    }
    if (task.fire < state.config.fireSpreadThreshold || incident.spreadTriggered) continue
    incident.spreadTriggered = true
    const sourceDefinition = taskDefinition(state, task.taskId)
    const affected = board.filter((candidate) => {
      if (candidate.taskId === task.taskId || candidate.status === 'completed') return false
      const candidateDefinition = taskDefinition(state, candidate.taskId)
      if (!sourceDefinition || !candidateDefinition) return false
      if (incident.spreadTarget === 'prerequisites') {
        return sourceDefinition.prerequisiteSlotIds.includes(candidate.slotId)
      }
      if (incident.spreadTarget === 'dependents') {
        return candidateDefinition.prerequisiteSlotIds.includes(task.slotId)
      }
      if (incident.spreadTarget === 'same_skill') return candidateDefinition.skill === sourceDefinition.skill
      if (incident.spreadTarget === 'same_lead') return candidate.leadPlayerId === task.leadPlayerId
      return false
    })
    if (incident.spreadTarget === 'cs') {
      cs -= 1
      log.push(`💢「${incident.name}」が顧客へ飛び火: CS-1`)
    } else {
      const affectedIds = new Set(affected.map((candidate) => candidate.taskId))
      board = board.map((candidate) =>
        affectedIds.has(candidate.taskId) ? { ...candidate, fire: candidate.fire + 1 } : candidate,
      )
      if (affectedIds.size > 0) log.push(`🔥「${incident.name}」が${affectedIds.size}件へ飛び火`)
    }
  }

  const nextWeek = state.week >= state.config.roundsPerPhase ? 1 : state.week + 1
  const nextPhase = state.week >= state.config.roundsPerPhase ? state.phase + 1 : state.phase
  const phaseEnded = nextPhase !== state.phase
  let carryoverDeck = state.carryoverDeck
  let availableTiles = state.availableTiles
  if (phaseEnded && state.phase < 2) {
    const generated: V7CarryoverTile[] = board.flatMap<V7CarryoverTile>((task) => {
      const definition = taskDefinition(state, task.taskId)
      if (!definition) return []
      if (task.status !== 'completed') {
        return [{
          id: `unfinished-${state.phase}-${task.taskId}`,
          kind: 'debt' as const,
          name: '持ち越し作業',
          source: `${definition.name}が未完了`,
          skill: definition.skill,
          effortModifier: 1,
        }]
      }
      if ((definition.quality ?? 1) === 2) {
        return [{
          id: `asset-${state.phase}-${task.taskId}`,
          kind: 'asset' as const,
          name: '再利用できる成果',
          source: `${definition.name}をLv2で完成`,
          skill: definition.skill,
          effortModifier: -1,
        }]
      }
      return [{
        id: `quality-${state.phase}-${task.taskId}`,
        kind: 'debt' as const,
        name: '品質の手戻り',
        source: `${definition.name}をLv1で完成`,
        skill: definition.skill,
        effortModifier: 1,
      }]
    })
    const fireDebts = board
      .filter((task) => task.fire > 0)
      .map((task) => ({
        id: `fire-${state.phase}-${task.taskId}`,
        kind: 'debt' as const,
        name: '放置した炎上',
        source: `${task.taskId}に🔥${task.fire}を残した`,
        effortModifier: 1,
      }))
    carryoverDeck = [...state.carryoverDeck, ...generated, ...fireDebts]
    availableTiles = carryoverDeck
    log.push(`🧩 次フェーズへ資産／負債タイル${generated.length + fireDebts.length}枚を追加`)
  }
  const workedTaskCount = new Set(
    state.allocations.filter((allocation) => allocation.kind === 'work').map((allocation) => allocation.taskId),
  ).size
  return {
    ...state,
    phase: nextPhase,
    week: nextWeek,
    board: phaseEnded && state.phase < 2 ? [] : board,
    slots:
      phaseEnded && state.phase < 2
        ? slots.map((slot) => ({ ...slot, completedByTaskId: null }))
        : slots,
    players: state.players.map((player) => ({
      ...player,
      workdayCapacity: Math.min(
        state.config.maxWorkdays,
        player.workdayCapacity + player.pendingCapacityGain,
      ),
      pendingCapacityGain: 0,
    })),
    allocations: [],
    pendingHandoffs: [],
    emergencyResponseCredits: {},
    incidents: phaseEnded && state.phase < 2 ? [] : incidents,
    carryoverDeck,
    availableTiles,
    cs,
    metrics: {
      ...state.metrics,
      parallelWorkWeeks: state.metrics.parallelWorkWeeks + (workedTaskCount > 1 ? 1 : 0),
    },
    log,
  }
}
