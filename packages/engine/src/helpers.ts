/**
 * エンジン内部の共通ヘルパ(すべて純粋関数)
 */
import type {
  GameContent,
  MemberCard,
  ProjectSheet,
  RequirementCard,
  SkillKind,
  SlotDef,
  TaskCard,
} from './types/content'
import type {
  BoardTask,
  GameState,
  PlayerState,
  RequirementState,
  SlotState,
} from './types/state'

/** タスクカード定義を引く */
export function getTaskCard(content: GameContent, cardId: string): TaskCard | undefined {
  return content.tasks.find((t) => t.id === cardId)
}

/** スロット定義を引く */
export function getSlotDef(content: GameContent, slotId: string): SlotDef | undefined {
  return content.slots.find((s) => s.id === slotId)
}

/** 要件カード定義を引く */
export function getRequirementCard(
  content: GameContent,
  id: string,
): RequirementCard | undefined {
  return content.requirements.find((r) => r.id === id)
}

/** 要件の状態を引く */
export function getRequirement(state: GameState, id: string): RequirementState | undefined {
  return state.requirements.find((r) => r.requirementId === id)
}

/** メンバーカードを引く */
export function getMember(content: GameContent, id: string): MemberCard | undefined {
  return content.members.find((m) => m.id === id)
}

/** プレイヤーを引く */
export function getPlayer(state: GameState, playerId: string): PlayerState | undefined {
  return state.players.find((p) => p.id === playerId)
}

/** 使用中のプロジェクトシート */
export function getSheet(state: GameState): ProjectSheet {
  return state.content.projectSheets.find((s) => s.id === state.projectSheetId)!
}

/** 盤上のタスクを引く */
export function getBoardTask(state: GameState, cardId: string): BoardTask | undefined {
  return state.board.find((t) => t.cardId === cardId)
}

/** スロット状態を引く */
export function getSlotState(state: GameState, slotId: string): SlotState | undefined {
  return state.slots.find((s) => s.slotId === slotId)
}

/**
 * 指定スロットを対象とする手戻りカードが場(割り込みレーン)にあるか。
 * ある間、そのスロットは検収上「未達」扱い(RULES.md §3-3)。
 */
export function hasReworkCard(state: GameState, slotId: string): boolean {
  return state.board.some((t) => t.interrupt === 'rework' && t.targetSlotId === slotId)
}

/** スロットが「納品済みで手戻りもない」状態か(前提成果物の判定に使う) */
export function isSlotUsable(state: GameState, slotId: string): boolean {
  const slot = getSlotState(state, slotId)
  return slot !== undefined && slot.level > 0 && !hasReworkCard(state, slotId)
}

/**
 * タスクがブロック中か(RULES.md §6-2)。
 * ① 前提成果物のいずれかが未納品 or 手戻り中
 * ② イベント(クライアント確認待ち)による一時ブロックが今週にかかっている
 * 割り込みカードは前提を持たないが、一時ブロックは受けうる。
 */
export function isTaskBlocked(state: GameState, task: BoardTask): boolean {
  if (task.blockedUntilWeek >= state.week && task.blockedUntilWeek > 0) return true
  // 前倒し着手を許す設定では、前提未達はブロック理由にならない(v6 提案 §2-3)
  if (state.config.allowEarlyStart) return false
  return isPrereqBlocked(state, task)
}

/**
 * 前提成果物が未納品でブロックされているか(クライアント確認待ちは含まない)。
 * `allowEarlyStart` が true のときは「着手はできるが前倒しである」の判定に使う。
 */
export function isPrereqBlocked(state: GameState, task: BoardTask): boolean {
  if (task.interrupt) return false
  const card = getTaskCard(state.content, task.cardId)
  if (!card) return false
  return card.prerequisiteSlots.some((slotId) => !isSlotUsable(state, slotId))
}

/** ブロック中タスクの、まだ満たされていない前提スロットID一覧(UI 表示用) */
export function unmetPrerequisites(state: GameState, task: BoardTask): string[] {
  if (task.interrupt) return []
  const card = getTaskCard(state.content, task.cardId)
  if (!card) return []
  return card.prerequisiteSlots.filter((slotId) => !isSlotUsable(state, slotId))
}

/**
 * 盤上タスクの必要工数(RULES.md §2-2)。
 *   (実工数が公開済みなら実工数 / 未公開なら見積工数)
 *   + 🔥 + 品質リスクのある前提の数 × qualityRiskPrereqPenalty - 恒久減、最低 1
 * 差し込みは interruptEffort が見積=実工数(振れ幅なし)。
 * 品質リスクのあるスロットへの手戻りは +qualityRiskEffortPenalty(RULES.md §2-4-5)。
 */
export function requiredCubes(state: GameState, task: BoardTask): number {
  let base: number
  if (task.interrupt) {
    base = task.interruptEffort ?? 0
    if (task.interrupt === 'rework' && task.targetSlotId) {
      const slot = getSlotState(state, task.targetSlotId)
      if (slot?.qualityRisk) base += state.config.qualityRiskEffortPenalty
    }
  } else {
    base = task.actualEffort ?? getTaskCard(state.content, task.cardId)?.estimate ?? 0
    base += riskyPrerequisiteCount(state, task) * state.config.qualityRiskPrereqPenalty
  }
  return Math.max(1, base + task.fire - task.effortReduction)
}

/**
 * 前提成果物のうち、品質リスクが付いているものの数(RULES.md §2-4-6)。
 * 雑な土台の上に積むぶん、このタスクは重くなる。前提が Lv2 になれば 0 に戻る。
 */
export function riskyPrerequisiteCount(state: GameState, task: BoardTask): number {
  if (task.interrupt) return 0
  const card = getTaskCard(state.content, task.cardId)
  if (!card) return 0
  return card.prerequisiteSlots.filter((slotId) => getSlotState(state, slotId)?.qualityRisk).length
}

/** 品質リスクのある前提成果物のスロットID一覧(UI 表示用) */
export function riskyPrerequisites(state: GameState, task: BoardTask): string[] {
  if (task.interrupt) return []
  const card = getTaskCard(state.content, task.cardId)
  if (!card) return []
  return card.prerequisiteSlots.filter((slotId) => getSlotState(state, slotId)?.qualityRisk)
}

/** 見積ベースの必要工数(実工数が未公開のときの表示用。前提リスクの増加は含む) */
export function estimatedCubes(state: GameState, task: BoardTask): number {
  if (task.interrupt) return requiredCubes(state, task)
  const estimate = getTaskCard(state.content, task.cardId)?.estimate ?? 0
  const risky = riskyPrerequisiteCount(state, task) * state.config.qualityRiskPrereqPenalty
  return Math.max(1, estimate + risky + task.fire - task.effortReduction)
}

/** 割り込み/通常タスクに対応するのに必要な系統(null = 指定なし・最高スキルで対応) */
export function taskSkill(state: GameState, task: BoardTask): SkillKind | null {
  if (task.interrupt === 'rework' && task.targetSlotId) {
    return getSlotDef(state.content, task.targetSlotId)?.skill ?? null
  }
  if (task.interrupt) return task.interruptSkill
  return getTaskCard(state.content, task.cardId)?.skill ?? null
}

/**
 * プレイヤーがこのタスクに1週座ったとき積むキューブ数(RULES.md §2-1・§7-3)。
 * 系統指定なしのタスクは最高スキルで対応する。キャパシティ減は今週ぶんだけ効く。
 * expedite(段取り)は週末処理側で加算するため、ここには含めない。
 */
export function cubesForTask(state: GameState, playerId: string, task: BoardTask): number {
  const player = getPlayer(state, playerId)
  if (!player) return 0
  const skill = taskSkill(state, task)
  const base =
    skill === null
      ? Math.max(player.skills.direction, player.skills.design, player.skills.engineering)
      : player.skills[skill]
  return Math.max(0, base - capacityPenalty(state, player))
}

/** 今週のキャパシティ減(他案件ヘルプ。RULES.md §7-3) */
export function capacityPenalty(state: GameState, player: PlayerState): number {
  return player.capacityDownUntilWeek >= state.week && player.capacityDownUntilWeek > 0
    ? state.config.capacityDownCubes
    : 0
}

/** 改修(Lv1 スロットに座る)で積むキューブ数 */
export function cubesForSlot(state: GameState, playerId: string, slotId: string): number {
  const player = getPlayer(state, playerId)
  const def = getSlotDef(state.content, slotId)
  if (!player || !def) return 0
  return Math.max(0, player.skills[def.skill] - capacityPenalty(state, player))
}

/**
 * 指定週の「予定工数 / 供給能力」を系統別に集計する(RULES.md §5-2)。
 * 予定工数はその週に配置された未納品タスクの必要工数の合計。
 * 供給能力はキャパシティ減を反映した全プレイヤーのスキル値合計(残業枠は数えない)。
 */
export interface WeekLoad {
  /** 対象の週 */
  week: number
  /** 系統別の予定工数(積み残しぶんを差し引いた残り必要工数) */
  planned: Record<SkillKind, number>
  /** 系統別の供給能力 */
  capacity: Record<SkillKind, number>
}

export function weekLoad(state: GameState, week: number): WeekLoad {
  const planned: Record<SkillKind, number> = { direction: 0, design: 0, engineering: 0 }
  const capacity: Record<SkillKind, number> = { direction: 0, design: 0, engineering: 0 }
  for (const task of state.board) {
    if (task.interrupt || task.plannedWeek !== week) continue
    const card = getTaskCard(state.content, task.cardId)
    if (!card) continue
    planned[card.skill] += Math.max(0, requiredCubes(state, task) - task.cubes)
  }
  for (const player of state.players) {
    // キャパシティ減はその週にかかっている場合のみ数える
    const penalty =
      player.capacityDownUntilWeek >= week && player.capacityDownUntilWeek > 0
        ? state.config.capacityDownCubes
        : 0
    for (const skill of ['direction', 'design', 'engineering'] as const) {
      capacity[skill] += Math.max(0, player.skills[skill] - penalty)
    }
  }
  return { week, planned, capacity }
}

/** 1人のプレイヤーだけ差し替えた players 配列を返す */
export function updatePlayer(
  state: GameState,
  playerId: string,
  update: (player: PlayerState) => PlayerState,
): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? update(p) : p)),
  }
}

/** 盤上のタスク1つだけ差し替えた board 配列を返す */
export function updateBoardTask(
  state: GameState,
  cardId: string,
  update: (task: BoardTask) => BoardTask,
): GameState {
  return {
    ...state,
    board: state.board.map((t) => (t.cardId === cardId ? update(t) : t)),
  }
}

/** スロット1つだけ差し替えた slots 配列を返す */
export function updateSlot(
  state: GameState,
  slotId: string,
  update: (slot: SlotState) => SlotState,
): GameState {
  return {
    ...state,
    slots: state.slots.map((s) => (s.slotId === slotId ? update(s) : s)),
  }
}

/** 要件1つだけ差し替えた requirements 配列を返す */
export function updateRequirement(
  state: GameState,
  requirementId: string,
  update: (req: RequirementState) => RequirementState,
): GameState {
  return {
    ...state,
    requirements: state.requirements.map((r) =>
      r.requirementId === requirementId ? update(r) : r,
    ),
  }
}

/** ログを1行追加する */
export function addLog(state: GameState, message: string): GameState {
  return {
    ...state,
    log: [...state.log, { phase: state.phase, week: state.week, message }],
  }
}

/**
 * CS を増減する。csInstantLose が有効で CS が 0 未満になったら即時敗北にする。
 */
export function changeCs(state: GameState, delta: number): GameState {
  if (delta === 0) return state
  const cs = state.cs + delta
  const next = { ...state, cs }
  if (cs < 0 && state.config.csInstantLose && next.result === null) {
    return {
      ...next,
      step: 'finished',
      result: {
        outcome: 'lose',
        reason: 'CS トラックが 0 未満になったため、チームは敗北しました。',
      },
    }
  }
  return next
}

/** 予算を増減する(0 未満にはならない) */
export function changeBudget(state: GameState, delta: number): GameState {
  return { ...state, budget: Math.max(0, state.budget + delta) }
}

/**
 * プレイヤーに疲労を加算する(上限 fatigueMax)。
 * 上限到達者は限界イベント処理待ちキューに積む。
 */
export function addFatigue(state: GameState, playerId: string, amount: number): GameState {
  const player = getPlayer(state, playerId)
  if (!player || amount === 0) return state
  if (amount < 0) {
    return updatePlayer(state, playerId, (p) => ({
      ...p,
      fatigue: Math.max(0, p.fatigue + amount),
    }))
  }
  const after = Math.min(state.config.fatigueMax, player.fatigue + amount)
  let next = updatePlayer(state, playerId, (p) => ({ ...p, fatigue: after }))
  if (
    after >= state.config.fatigueMax &&
    player.fatigue < state.config.fatigueMax &&
    !next.pendingLimitPlayerIds.includes(playerId)
  ) {
    next = { ...next, pendingLimitPlayerIds: [...next.pendingLimitPlayerIds, playerId] }
  }
  return next
}

/** 全員に疲労を加算する */
export function addFatigueAll(state: GameState, amount: number): GameState {
  let next = state
  for (const player of state.players) {
    next = addFatigue(next, player.id, amount)
  }
  return next
}

/**
 * 要件が現時点で達成条件を満たしているか(RULES.md §3-3)。
 * 対象スロットが要求 Lv 以上、かつ手戻りカードが場にないこと。
 */
export function isRequirementFulfilled(state: GameState, req: RequirementState): boolean {
  const card = getRequirementCard(state.content, req.requirementId)
  if (!card) return false
  const slot = getSlotState(state, card.slot)
  return slot !== undefined && slot.level >= card.level && !hasReworkCard(state, card.slot)
}

/**
 * 要件の達成状態を洗い替える(RULES.md §3-3)。
 * 納品・改修・手戻りの発生/解消のたびに呼ぶ。手戻りが乗れば未達成に戻る。
 * 「イベント由来の追加対応」の CS はここで即時付与する(RULES.md §4-1)。
 */
export function refreshRequirements(state: GameState): GameState {
  let next = state
  for (const req of next.requirements) {
    if (req.tier === 'dropped') continue
    const fulfilled = isRequirementFulfilled(next, req)
    if (fulfilled === req.met) continue
    next = updateRequirement(next, req.requirementId, (r) => ({ ...r, met: fulfilled }))
    const card = getRequirementCard(next.content, req.requirementId)
    if (fulfilled) {
      next = addLog(next, `✅ 要件「${card?.name}」を達成しました。`)
      next = awardEventFulfillment(next, req.requirementId)
      if (next.result !== null) return next
    } else {
      next = addLog(next, `↩️ 要件「${card?.name}」が未達成に戻りました(手戻り)。`)
    }
  }
  return next
}

/**
 * イベント選択肢由来の「追加対応の達成」で CS を付与する(RULES.md §4-1)。
 * 同じイベントカードからは1回しか獲得できない(RULES.md §4-3)。
 */
export function awardEventFulfillment(state: GameState, requirementId: string): GameState {
  const req = getRequirement(state, requirementId)
  if (!req || req.csOnFulfill <= 0) return state
  const eventId = req.sourceEventId
  if (eventId !== null && state.csAwardedEventIds.includes(eventId)) return state
  let next = changeCs(state, req.csOnFulfill)
  next = addLog(next, `💚 追加対応をやり切りました(CS+${req.csOnFulfill})`)
  if (eventId !== null) {
    next = { ...next, csAwardedEventIds: [...next.csAwardedEventIds, eventId] }
  }
  return next
}
