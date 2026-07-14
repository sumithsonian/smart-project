/**
 * 週次ループ:週初トラブル(炎上→イベント)と朝会(配属)(rules-v4-core.md §1-2)
 */
import type { GameAction, WorkerTarget } from '../types/actions'
import type { BoardTask, GameState } from '../types/state'
import type { FireTarget } from '../types/content'
import type { RuleViolation } from '../types/violation'
import { violation } from '../types/violation'
import { drawCard, discard } from '../deck'
import { shuffle } from '../rng'
import {
  addLog,
  changeCs,
  getBoardTask,
  getPlayer,
  getSlotDef,
  getSlotState,
  getTaskCard,
  updateBoardTask,
} from '../helpers'
import { processWeekend } from './weekend'

/** タスクの表示名(差し込みは種別ラベル付き) */
export function taskLabel(state: GameState, task: BoardTask): string {
  const card = getTaskCard(state.content, task.cardId)
  return card?.name ?? task.cardId
}

/** 進行中(未納品)タスク一覧 */
function activeTasks(state: GameState): BoardTask[] {
  return state.board
}

/** 炎上ターゲットの解決(該当なしなら null。複数該当は placedSeq が最小のもの=物理版は PM 裁定) */
function resolveFireTarget(state: GameState, target: FireTarget): BoardTask | null {
  const tasks = activeTasks(state)
  if (tasks.length === 0) return null
  switch (target) {
    case 'most_cubes': {
      const max = Math.max(...tasks.map((t) => t.cubes))
      return tasks.filter((t) => t.cubes === max).sort((a, b) => a.placedSeq - b.placedSeq)[0]!
    }
    case 'lane_finish': {
      for (const lane of ['finish', 'middle', 'start'] as const) {
        const inLane = tasks.filter((t) => t.lane === lane)
        if (inLane.length > 0) return inLane.sort((a, b) => a.placedSeq - b.placedSeq)[0]!
      }
      return tasks[0]!
    }
    case 'oldest':
      return [...tasks].sort((a, b) => a.placedSeq - b.placedSeq)[0]!
    case 'epidemic':
      return null // 呼び出し側で全タスク処理
  }
}

/**
 * 🔥を1個置く。fireOutbreakThreshold 個目は置く代わりに延焼:
 * 同じ列の進行中タスク全部に🔥+1、CS-1。
 */
function addFire(state: GameState, cardId: string): GameState {
  const task = getBoardTask(state, cardId)
  if (!task) return state
  if (task.fire >= state.config.fireOutbreakThreshold - 1) {
    let next = changeCs(state, -1)
    next = addLog(next, `🚨 「${taskLabel(state, task)}」が延焼!同じ列に飛び火(CS-1)`)
    if (next.result !== null) return next
    for (const other of next.board) {
      if (other.lane === task.lane && other.cardId !== task.cardId) {
        next = updateBoardTask(next, other.cardId, (t) => ({ ...t, fire: t.fire + 1 }))
      }
    }
    return next
  }
  let next = updateBoardTask(state, cardId, (t) => ({ ...t, fire: t.fire + 1 }))
  next = addLog(next, `🔥 「${taskLabel(state, task)}」に炎上トークン(必要工数+1)`)
  return next
}

/** 炎上ドローを消化する(対象は条件式で自動解決。デッキが空なら捨て札をリシャッフル) */
function processFireDraws(state: GameState): GameState {
  let next = state
  while (next.remainingFireDraws > 0 && next.result === null) {
    let deckState = next.decks.fires
    if (deckState.drawPile.length === 0 && deckState.discardPile.length > 0) {
      const [reshuffled, rng] = shuffle(next.rng, deckState.discardPile)
      deckState = { drawPile: reshuffled, discardPile: [] }
      next = { ...next, rng, decks: { ...next.decks, fires: deckState } }
    }
    const { cardId, deck, rng } = drawCard(deckState, next.rng)
    next = {
      ...next,
      decks: { ...next.decks, fires: deck },
      rng,
      remainingFireDraws: next.remainingFireDraws - 1,
    }
    if (cardId === null) break
    const card = next.content.fires.find((f) => f.id === cardId)!
    if (card.target === 'epidemic') {
      next = addLog(next, `🌋 大炎上「${card.name}」!進行中の全タスクに🔥`)
      for (const task of [...next.board]) {
        next = addFire(next, task.cardId)
        if (next.result !== null) return next
      }
    } else {
      const target = resolveFireTarget(next, card.target)
      if (target === null) {
        next = addLog(next, `💨 炎上カード「${card.name}」:対象なし(平和な週)`)
      } else {
        next = addFire(next, target.cardId)
        if (next.result !== null) return next
      }
    }
    next = { ...next, decks: { ...next.decks, fires: discard(next.decks.fires, cardId) } }
  }
  return next
}

/**
 * 週を開始する:学習予約の反映 → 炎上ドロー → 週初イベントのドロー(解決は RESOLVE_EVENT)。
 */
export function startWeek(state: GameState, week: number): GameState {
  let next: GameState = {
    ...state,
    step: 'standup',
    week,
    assignments: [],
    readyPlayerIds: [],
    expeditedPlayerIds: [],
    remainingFireDraws: state.config.firePerRound,
  }
  // 学習予約の反映(先週の学習が今週から効く)
  for (const p of next.players) {
    if (p.pendingLearn !== null) {
      const skill = p.pendingLearn
      next = {
        ...next,
        players: next.players.map((pl) =>
          pl.id === p.id
            ? {
                ...pl,
                skills: {
                  ...pl.skills,
                  [skill]: Math.min(next.config.skillMax, pl.skills[skill] + 1),
                },
                pendingLearn: null,
              }
            : pl,
        ),
      }
      next = addLog(next, `📚 ${p.name} の ${skill} が Lv${next.players.find((pl) => pl.id === p.id)!.skills[skill]} に成長`)
    }
  }
  next = addLog(next, `── フェーズ${next.phase} 第${week}週 ──`)
  next = processFireDraws(next)
  if (next.result !== null) return next
  // 週初イベントを1枚引く
  const { cardId, deck, rng } = drawCard(next.decks.events, next.rng)
  if (cardId !== null) {
    next = {
      ...next,
      decks: { ...next.decks, events: deck },
      rng,
      pendingEvent: { kind: 'week_start', cardId, targetPlayerId: null },
    }
  }
  return next
}

/** 朝会の共通ガード */
function guardStandup(state: GameState, playerId: string): RuleViolation | null {
  if (state.step !== 'standup') {
    return violation('INVALID_STEP', '朝会(配属)中ではありません。')
  }
  if (state.pendingEvent !== null) {
    return violation('PENDING_EVENT', '先にイベントを解決してください。')
  }
  if (!getPlayer(state, playerId)) {
    return violation('PLAYER_NOT_FOUND', `プレイヤーが見つかりません: ${playerId}`)
  }
  if (state.readyPlayerIds.includes(playerId)) {
    return violation('ALREADY_READY', '準備完了を宣言したプレイヤーは配属を変えられません。')
  }
  return null
}

/** 配属先の検証 */
function validateTarget(
  state: GameState,
  playerId: string,
  target: WorkerTarget,
): RuleViolation | null {
  const player = getPlayer(state, playerId)!
  switch (target.kind) {
    case 'task': {
      const task = getBoardTask(state, target.cardId)
      if (!task) return violation('NOT_FOUND', `盤上にないタスクです: ${target.cardId}`)
      // 差し込み(bug/consult)は系統不問(最高スキル=総合対応力で積む)
      const skill = task.interrupt ? undefined : getTaskCard(state.content, task.cardId)?.skill
      if (skill !== undefined && player.skills[skill] < 1) {
        return violation('SKILL_ZERO', `${skill} のスキルが 0 のため、このタスクには座れません。`)
      }
      return null
    }
    case 'slot': {
      const slot = getSlotState(state, target.slotId)
      if (!slot || slot.level === 0) {
        return violation('NOT_FOUND', '納品済みのスロットではありません(改修・手戻り対応は納品後)。')
      }
      if (slot.reworkCubes === 0 && slot.level >= 2) {
        return violation('INVALID_TARGET', 'このスロットに積む理由がありません(手戻りなし・Lv2)。')
      }
      const def = getSlotDef(state.content, target.slotId)!
      if (player.skills[def.skill] < 1) {
        return violation('SKILL_ZERO', `${def.skill} のスキルが 0 のため、このスロットには座れません。`)
      }
      return null
    }
    case 'learn':
      if (player.skills[target.skill] + (player.pendingLearn === target.skill ? 1 : 0) >= state.config.skillMax) {
        return violation('SKILL_MAX', `${target.skill} はすでに上限です。`)
      }
      return null
    case 'rest':
      return null
    case 'extinguish': {
      const task = getBoardTask(state, target.cardId)
      if (!task) return violation('NOT_FOUND', `盤上にないタスクです: ${target.cardId}`)
      const pledged = state.assignments.filter(
        (a) => a.target.kind === 'extinguish' && a.target.cardId === target.cardId,
      ).length
      if (task.fire <= pledged) return violation('NO_FIRE', '消火できる🔥が残っていません。')
      return null
    }
  }
}

/** ASSIGN_WORKER — 今週の配属を宣言する */
export function handleAssignWorker(
  state: GameState,
  action: Extract<GameAction, { type: 'ASSIGN_WORKER' }>,
): GameState | RuleViolation {
  const guard = guardStandup(state, action.playerId)
  if (guard) return guard
  const player = getPlayer(state, action.playerId)!
  const overtime = action.overtime ?? false
  if (state.assignments.some((a) => a.playerId === player.id && a.overtime === overtime)) {
    return violation('ALREADY_ASSIGNED', overtime ? '残業枠は配属済みです。' : '主担当は配属済みです。')
  }
  if (overtime) {
    if (!state.assignments.some((a) => a.playerId === player.id && !a.overtime)) {
      return violation('OVERTIME_FORBIDDEN', '残業は主担当を決めてからです。')
    }
    if (player.fatigue >= state.config.noOvertimeAtFatigue) {
      return violation('OVERTIME_FORBIDDEN', `疲労${player.fatigue}では残業できません。`)
    }
    if (player.overtimeBanPhase === state.phase) {
      return violation('OVERTIME_FORBIDDEN', '体調不良のため、このフェーズは残業できません。')
    }
    if (action.target.kind === 'rest' || action.target.kind === 'learn') {
      return violation('OVERTIME_FORBIDDEN', '残業枠は「座る」「消火」のみです。')
    }
  }
  const invalid = validateTarget(state, action.playerId, action.target)
  if (invalid) return invalid
  return {
    ...state,
    assignments: [...state.assignments, { playerId: player.id, target: action.target, overtime }],
  }
}

/** UNASSIGN_WORKER — 今週の配属を取り消す(主担当を消すには先に残業を消す) */
export function handleUnassignWorker(
  state: GameState,
  action: Extract<GameAction, { type: 'UNASSIGN_WORKER' }>,
): GameState | RuleViolation {
  const guard = guardStandup(state, action.playerId)
  if (guard) return guard
  const overtime = action.overtime ?? false
  const assignment = state.assignments.find(
    (a) => a.playerId === action.playerId && a.overtime === overtime,
  )
  if (!assignment) return violation('NO_ASSIGNMENT', '取り消せる配属がありません。')
  if (!overtime && state.assignments.some((a) => a.playerId === action.playerId && a.overtime)) {
    return violation('OVERTIME_FORBIDDEN', '先に残業枠を取り消してください。')
  }
  return { ...state, assignments: state.assignments.filter((a) => a !== assignment) }
}

/** DECLARE_READY — 準備完了宣言。全員揃ったら週末処理へ */
export function handleDeclareReady(
  state: GameState,
  action: Extract<GameAction, { type: 'DECLARE_READY' }>,
): GameState | RuleViolation {
  const guard = guardStandup(state, action.playerId)
  if (guard) return guard
  const readyPlayerIds = [...state.readyPlayerIds, action.playerId]
  if (readyPlayerIds.length === state.players.length) {
    return processWeekend({ ...state, readyPlayerIds })
  }
  return { ...state, readyPlayerIds }
}
