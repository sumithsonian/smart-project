/**
 * エンジン内部の共通ヘルパ(すべて純粋関数)
 */
import type {
  AcceptanceCard,
  GameContent,
  MemberCard,
  ProjectSheet,
  SlotDef,
  TaskCard,
} from './types/content'
import type { BoardTask, GameState, PlayerState, SlotState } from './types/state'

/** タスクカード定義を引く */
export function getTaskCard(content: GameContent, cardId: string): TaskCard | undefined {
  return content.tasks.find((t) => t.id === cardId)
}

/** スロット定義を引く */
export function getSlotDef(content: GameContent, slotId: string): SlotDef | undefined {
  return content.slots.find((s) => s.id === slotId)
}

/** 検収条件カードを引く */
export function getAcceptance(content: GameContent, id: string): AcceptanceCard | undefined {
  return content.acceptance.find((a) => a.id === id)
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

/** 盤上タスクの必要工数(基本 + 🔥 - 恒久減。差し込みは interruptEffort) */
export function requiredCubes(state: GameState, task: BoardTask): number {
  const base =
    task.interruptEffort ?? getTaskCard(state.content, task.cardId)?.effort ?? 0
  return Math.max(1, base + task.fire - task.effortReduction)
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
 * 検収条件の達成チェック:スロットが要求 Lv 以上・手戻りなしなら達成扱いにする。
 * 納品・改修完了・手戻り解消のたびに呼ぶ。
 */
export function checkAcceptance(state: GameState): GameState {
  let next = state
  for (const id of next.openAcceptanceIds) {
    if (next.metAcceptanceIds.includes(id)) continue
    const card = getAcceptance(next.content, id)
    if (!card) continue
    const slot = getSlotState(next, card.slot)
    if (slot && slot.level >= card.level && slot.reworkCubes === 0) {
      next = {
        ...next,
        metAcceptanceIds: [...next.metAcceptanceIds, id],
        commitments: next.commitments.filter((c) => c.acceptanceId !== id),
      }
      next = addLog(next, `✅ 検収条件「${card.name}」を達成しました。`)
    }
  }
  return next
}

/**
 * 手戻りの再発:達成済み条件のスロットに手戻りが乗った場合、達成を取り消す。
 * (手戻りイベントの適用後に呼ぶ)
 */
export function recheckMetAcceptance(state: GameState): GameState {
  const stillMet = state.metAcceptanceIds.filter((id) => {
    const card = getAcceptance(state.content, id)
    if (!card) return true
    const slot = getSlotState(state, card.slot)
    return slot !== undefined && slot.level >= card.level && slot.reworkCubes === 0
  })
  if (stillMet.length === state.metAcceptanceIds.length) return state
  return { ...state, metAcceptanceIds: stillMet }
}
