/**
 * 週次ループ:週初の炎上と朝会(配属)(RULES.md §8-2・§8-3)
 * イベントは週末に引く(RULES.md §7-1)。
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
  isTaskBlocked,
  taskSkill,
  unmetPrerequisites,
  updateBoardTask,
} from '../helpers'
import { processWeekend } from './weekend'

/** タスクの表示名(差し込みは種別ラベル付き) */
export function taskLabel(state: GameState, task: BoardTask): string {
  if (task.interrupt === 'rework') {
    const name = task.targetSlotId
      ? getSlotDef(state.content, task.targetSlotId)?.name ?? task.targetSlotId
      : ''
    return `手戻り対応(${name})`
  }
  if (task.interrupt === 'bug') return 'バグ対応'
  if (task.interrupt === 'consult') return '相談ごと'
  return getTaskCard(state.content, task.cardId)?.name ?? task.cardId
}

/** 進行中(未納品)タスク一覧 */
function activeTasks(state: GameState): BoardTask[] {
  return state.board
}

/** 炎上ターゲットの解決(該当なしなら null。複数該当は placedSeq が最小のもの=物理版は PM 裁定) */
function resolveFireTarget(state: GameState, target: FireTarget): BoardTask | null {
  const tasks = activeTasks(state)
  if (tasks.length === 0) return null
  const bySeq = (list: BoardTask[]) => [...list].sort((a, b) => a.placedSeq - b.placedSeq)[0]!
  switch (target) {
    case 'most_cubes': {
      const max = Math.max(...tasks.map((t) => t.cubes))
      return bySeq(tasks.filter((t) => t.cubes === max))
    }
    case 'oldest':
      return bySeq(tasks)
    case 'this_week': {
      const thisWeek = tasks.filter((t) => t.plannedWeek === state.week)
      if (thisWeek.length > 0) return bySeq(thisWeek)
      // 予定週が最も近いもの(Backlog・割り込みは最後に回す)
      const planned = tasks.filter((t) => t.plannedWeek !== null)
      if (planned.length > 0) {
        const nearest = Math.min(...planned.map((t) => t.plannedWeek!))
        return bySeq(planned.filter((t) => t.plannedWeek === nearest))
      }
      return bySeq(tasks)
    }
    case 'blocked': {
      const blocked = tasks.filter((t) => isTaskBlocked(state, t))
      return blocked.length > 0 ? bySeq(blocked) : bySeq(tasks)
    }
    case 'epidemic':
      return null // 呼び出し側で全タスク処理
  }
}

/**
 * 🔥を1個置く。fireOutbreakThreshold 個目は置く代わりに延焼:
 * 同じ予定週のタスク全部に🔥+1、CS-1(RULES.md §2-5)。
 */
function addFire(state: GameState, cardId: string): GameState {
  const task = getBoardTask(state, cardId)
  if (!task) return state
  if (task.fire >= state.config.fireOutbreakThreshold - 1) {
    let next = changeCs(state, -1)
    next = addLog(
      next,
      `🚨 「${taskLabel(state, task)}」が延焼!同じ週の予定に飛び火(CS-1)`,
    )
    if (next.result !== null) return next
    for (const other of next.board) {
      if (other.plannedWeek === task.plannedWeek && other.cardId !== task.cardId) {
        next = updateBoardTask(next, other.cardId, (t) => ({ ...t, fire: t.fire + 1 }))
      }
    }
    return next
  }
  let next = updateBoardTask(state, cardId, (t) => ({ ...t, fire: t.fire + 1 }))
  next = addLog(next, `🔥 「${taskLabel(state, task)}」に炎上トークン(必要人日+1)`)
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
 * 週を開始する:学習予約の反映 → 炎上ドロー(RULES.md §8-2)。
 * イベントは週末に引くため、ここでは引かない。
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
    pendingWeekendEventDraw: false,
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
      const grown = next.players.find((pl) => pl.id === p.id)!.skills[skill]
      next = addLog(next, `📚 ${p.name} の ${skillName(skill)} が Lv${grown} に成長`)
    }
  }
  next = addLog(next, `── フェーズ${next.phase} 第${week}週 ──`)
  return processFireDraws(next)
}

/** 系統の日本語名 */
export function skillName(skill: 'direction' | 'design' | 'engineering'): string {
  if (skill === 'direction') return 'ディレクション'
  if (skill === 'design') return 'デザイン'
  return 'エンジニアリング'
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

/** 配属先の検証(RULES.md §8-3) */
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
      // ① ブロック中(前提未達 or 確認待ち)には座れない
      if (isTaskBlocked(state, task)) {
        const unmet = unmetPrerequisites(state, task)
          .map((id) => getSlotDef(state.content, id)?.name ?? id)
          .join('・')
        return violation(
          'TASK_BLOCKED',
          unmet.length > 0
            ? `「${taskLabel(state, task)}」はブロック中です(前提:${unmet} が未納品)。`
            : `「${taskLabel(state, task)}」はクライアント確認待ちで、今週は着手できません。`,
        )
      }
      // ② 今週予定でない計画タスクには座れない(割り込みはいつでも可)
      if (!task.interrupt && task.plannedWeek !== state.week) {
        return violation(
          'NOT_PLANNED_THIS_WEEK',
          `「${taskLabel(state, task)}」は今週の予定ではありません(${
            task.plannedWeek === null ? 'Backlog' : `第${task.plannedWeek}週`
          })。再計画は週末に行います。`,
        )
      }
      // ③ 必要スキルが 0 なら座れない(系統指定なしの割り込みは誰でも可)
      const skill = taskSkill(state, task)
      if (skill !== null && player.skills[skill] < 1) {
        return violation(
          'SKILL_ZERO',
          `${skillName(skill)} のスキルが 0 のため、このタスクには座れません。`,
        )
      }
      return null
    }
    case 'slot': {
      // スロットに座れるのは Lv1 の改修のみ(手戻り対応は割り込みレーンの task)
      const slot = getSlotState(state, target.slotId)
      if (!slot || slot.level !== 1) {
        return violation(
          'NOT_FOUND',
          'Lv1 で納品済みのスロットではありません(改修は納品後の Lv1 のみ)。',
        )
      }
      const def = getSlotDef(state.content, target.slotId)!
      if (player.skills[def.skill] < 1) {
        return violation(
          'SKILL_ZERO',
          `${skillName(def.skill)} のスキルが 0 のため、このスロットには座れません。`,
        )
      }
      return null
    }
    case 'learn':
      if (
        player.skills[target.skill] + (player.pendingLearn === target.skill ? 1 : 0) >=
        state.config.skillMax
      ) {
        return violation('SKILL_MAX', `${skillName(target.skill)} はすでに上限です。`)
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
    return violation(
      'ALREADY_ASSIGNED',
      overtime ? '残業枠は配属済みです。' : '主担当は配属済みです。',
    )
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

/**
 * DECLARE_READY — 準備完了宣言。全員揃ったら週末処理へ。
 * 未配属のままでは宣言できない(RULES.md §10-4)。
 */
export function handleDeclareReady(
  state: GameState,
  action: Extract<GameAction, { type: 'DECLARE_READY' }>,
): GameState | RuleViolation {
  const guard = guardStandup(state, action.playerId)
  if (guard) return guard
  if (!state.assignments.some((a) => a.playerId === action.playerId && !a.overtime)) {
    return violation(
      'NOT_ASSIGNED',
      '今週の自分を決めてから準備完了してください(座る・学習・休憩・消火のいずれか)。',
    )
  }
  const readyPlayerIds = [...state.readyPlayerIds, action.playerId]
  if (readyPlayerIds.length === state.players.length) {
    return processWeekend({ ...state, readyPlayerIds })
  }
  return { ...state, readyPlayerIds }
}

/** CANCEL_READY — 準備完了を取り消す(全員揃う前のみ。RULES.md §10-4) */
export function handleCancelReady(
  state: GameState,
  action: Extract<GameAction, { type: 'CANCEL_READY' }>,
): GameState | RuleViolation {
  if (state.step !== 'standup') {
    return violation('INVALID_STEP', '朝会(配属)中ではありません。')
  }
  if (!getPlayer(state, action.playerId)) {
    return violation('PLAYER_NOT_FOUND', `プレイヤーが見つかりません: ${action.playerId}`)
  }
  if (!state.readyPlayerIds.includes(action.playerId)) {
    return violation('NOT_READY', '準備完了を宣言していません。')
  }
  return {
    ...state,
    readyPlayerIds: state.readyPlayerIds.filter((id) => id !== action.playerId),
  }
}
