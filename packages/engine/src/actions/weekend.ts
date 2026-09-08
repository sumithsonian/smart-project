/**
 * 週末処理(RULES.md §8-5)
 *   1. 配属の効果を一括適用(残業疲労→休憩→学習→消火→キューブ→着席疲労)
 *   2. 初めて着手したタスクの実工数を公開(§2-2)
 *   3. 納品判定(DELIVER_TASK)・品質リスクの更新(§2-4)
 *   4. 週末イベントを1枚解決(§7)
 *   5. 再計画(§5-4)
 *   6. 週を締めて次週へ(END_WEEKEND を2回押す:1回目でイベント、2回目で締め)
 */
import type { GameAction } from '../types/actions'
import type { BoardTask, GameState } from '../types/state'
import type { RuleViolation } from '../types/violation'
import { violation } from '../types/violation'
import { drawCard } from '../deck'
import { nextInt } from '../rng'
import {
  addFatigue,
  addLog,
  capacityPenalty,
  changeBudget,
  cubesForSlot,
  cubesForTask,
  getBoardTask,
  getMember,
  getPlayer,
  getSlotDef,
  getSlotState,
  getTaskCard,
  refreshRequirements,
  requiredCubes,
  updateBoardTask,
  updateSlot,
} from '../helpers'
import { maybeStartLimitEvent } from './events'
import { startWeek, taskLabel } from './week'
import { processPhaseEnd } from './phaseEnd'
import { riskLabel } from './scope'

/**
 * 週末処理の本体(全員 Ready 時に呼ばれる)。
 * 終了後は step='weekend'(納品判定は DELIVER_TASK、締めは END_WEEKEND)。
 */
export function processWeekend(state: GameState): GameState {
  let next = state

  // ── 1. 残業疲労(「マルチタスク」持ちは免除)──
  for (const a of next.assignments) {
    if (!a.overtime) continue
    const member = getMember(next.content, getPlayer(next, a.playerId)!.memberId)
    if (member?.ability === 'multitask') continue
    next = addFatigue(next, a.playerId, next.config.overtimeFatigue)
  }
  // ── 2. 休憩 ──
  for (const a of next.assignments) {
    if (a.target.kind === 'rest') {
      next = addFatigue(next, a.playerId, -next.config.restRecovery)
    }
  }
  // ── 3. 学習(来週反映の予約)──
  for (const a of next.assignments) {
    if (a.target.kind === 'learn') {
      const skill = a.target.skill
      next = {
        ...next,
        players: next.players.map((p) =>
          p.id === a.playerId ? { ...p, pendingLearn: skill } : p,
        ),
      }
    }
  }
  // ── 4. 消火(納品判定より先。消してから納品できる)──
  for (const a of next.assignments) {
    if (a.target.kind === 'extinguish') {
      const cardId = a.target.cardId
      const task = getBoardTask(next, cardId)
      if (task && task.fire > 0) {
        next = updateBoardTask(next, cardId, (t) => ({ ...t, fire: t.fire - 1 }))
        next = addLog(
          next,
          `🧯 ${getPlayer(next, a.playerId)!.name} が「${taskLabel(next, task)}」を消火`,
        )
      }
    }
  }
  // ── 5. キューブを積む(タスク/スロット)──
  // 「段取り」ボーナス(+1)は週に1回だけ(最初の着席にのみ乗る。残業併用でも+1)
  const expediteConsumed = new Set<string>()
  const expediteBonus = (playerId: string): number => {
    if (!next.expeditedPlayerIds.includes(playerId) || expediteConsumed.has(playerId)) return 0
    expediteConsumed.add(playerId)
    return 1
  }
  for (const a of next.assignments) {
    if (a.target.kind === 'task') {
      const cardId = a.target.cardId
      const task = getBoardTask(next, cardId)
      if (!task) continue
      const cubes = cubesForTask(next, a.playerId, task) + expediteBonus(a.playerId)
      next = updateBoardTask(next, cardId, (t) => ({
        ...t,
        cubes: t.cubes + cubes,
        contributorIds: t.contributorIds.includes(a.playerId)
          ? t.contributorIds
          : [...t.contributorIds, a.playerId],
      }))
    } else if (a.target.kind === 'slot') {
      // スロットに座るのは改修(Lv1→Lv2)のみ
      const slotId = a.target.slotId
      const def = getSlotDef(next.content, slotId)!
      const cubes = cubesForSlot(next, a.playerId, slotId) + expediteBonus(a.playerId)
      next = updateSlot(next, slotId, (s) => ({
        ...s,
        upgradeCubes: s.upgradeCubes + cubes,
        contributorIds: s.contributorIds.includes(a.playerId)
          ? s.contributorIds
          : [...s.contributorIds, a.playerId],
      }))
      const after = getSlotState(next, slotId)!
      // 改修完了:upgradeCost 到達で Lv2 化 + 品質リスク除去(RULES.md §2-4)
      if (after.level === 1 && after.upgradeCubes >= next.config.upgradeCost) {
        next = updateSlot(next, slotId, (s) => ({
          ...s,
          level: 2,
          upgradeCubes: 0,
          qualityRisk: false,
        }))
        next = addLog(next, `✨ 「${def.name}」を Lv2 に改修(品質リスクを解消)`)
      }
    }
  }
  // ── 6. 着席疲労(タスク=カードの疲労値(差し込みは1)、スロット=1)──
  for (const a of next.assignments) {
    if (a.target.kind === 'task') {
      const task = getBoardTask(next, a.target.cardId)
      const card = task && !task.interrupt ? getTaskCard(next.content, a.target.cardId) : undefined
      next = addFatigue(next, a.playerId, task?.interrupt ? 1 : (card?.fatigue ?? 1))
    } else if (a.target.kind === 'slot') {
      next = addFatigue(next, a.playerId, 1)
    }
  }

  // ── 7. 実工数の公開(初めてキューブが積まれたタスク。RULES.md §2-2)──
  next = revealActualEfforts(next)

  // 改修で要件が満ちた可能性
  next = refreshRequirements(next)
  next = { ...next, step: 'weekend', expeditedPlayerIds: [], pendingWeekendEventDraw: true }
  // 疲労上限到達者の限界イベント(解決後も weekend ステップが続く)
  return maybeStartLimitEvent(next)
}

/**
 * 実工数の公開(RULES.md §2-2)。
 * 初めてキューブが積まれた通常タスクについて、リスク別分布からシード乱数で補正を引き、
 * 実工数 = 見積 + 補正 を確定して公開する。差し込みは振れ幅なし。
 */
function revealActualEfforts(state: GameState): GameState {
  let next = state
  // placedSeq 順に処理して、同じシードなら必ず同じ結果になるようにする
  // earlyEffortReveal のときは、まだ着手していない計画タスクも対象にする
  // (見積の外れを知ってから配置を決められる = 不確実性が減る)
  const pending = next.board
    .filter(
      (t) =>
        !t.interrupt &&
        t.actualEffort === null &&
        (t.cubes > 0 || (next.config.earlyEffortReveal && t.plannedWeek !== null)),
    )
    .sort((a, b) => a.placedSeq - b.placedSeq)
  for (const task of pending) {
    const card = getTaskCard(next.content, task.cardId)
    if (!card) continue
    const distribution = next.config.riskVariance[card.risk] ?? [0]
    const [index, rng] = nextInt(next.rng, distribution.length)
    const variance = distribution[index] ?? 0
    const actual = Math.max(1, card.estimate + variance)
    next = { ...next, rng }
    next = updateBoardTask(next, task.cardId, (t) => ({ ...t, actualEffort: actual }))
    if (variance === 0) {
      next = addLog(next, `🔍 「${card.name}」の実工数は見積どおり ${actual}人日でした。`)
    } else {
      next = addLog(
        next,
        `🔍 「${card.name}」に着手:実工数は ${actual}人日(見積${card.estimate} ${
          variance > 0 ? `+${variance}` : variance
        }・リスク${riskLabel(card.risk)})`,
      )
    }
  }
  return next
}

/** DELIVER_TASK — 必要工数に達したタスクを納品する(週末) */
export function handleDeliverTask(
  state: GameState,
  action: Extract<GameAction, { type: 'DELIVER_TASK' }>,
): GameState | RuleViolation {
  if (state.step !== 'weekend') {
    return violation('INVALID_STEP', '納品は週末に行います。')
  }
  if (state.pendingEvent !== null) {
    return violation('PENDING_EVENT', '先にイベントを解決してください。')
  }
  const task = getBoardTask(state, action.cardId)
  if (!task) return violation('NOT_FOUND', `盤上にないタスクです: ${action.cardId}`)
  const needed = requiredCubes(state, task)
  if (task.cubes < needed) {
    return violation('CANNOT_DELIVER', `人日が足りません(残り${needed - task.cubes})。`)
  }

  // ── 差し込みの完了 ──
  if (task.interrupt) {
    return completeInterrupt(state, task)
  }

  // ── 通常タスクの納品 ──
  const card = getTaskCard(state.content, task.cardId)!
  if (state.budget < card.cost) {
    return violation(
      'CANNOT_DELIVER',
      `実行コスト(${card.cost})に予算が足りません。追加請求を検討してください。`,
    )
  }
  const level = card.maxLevel === 2 && task.cubes >= needed + state.config.qualityOvershoot ? 2 : 1
  let next = changeBudget(state, -card.cost)
  next = { ...next, board: next.board.filter((t) => t.cardId !== task.cardId) }
  // 品質リスク:Lv1 納品で立ち、Lv2 納品では立たない(RULES.md §2-4)
  next = updateSlot(next, card.slot, (s) => ({
    ...s,
    level: level as 1 | 2,
    upgradeCubes: 0,
    qualityRisk: level === 1,
    contributorIds: [...new Set([...s.contributorIds, ...task.contributorIds])],
  }))
  const slotName = getSlotDef(next.content, card.slot)?.name ?? card.slot
  next = addLog(
    next,
    level === 1
      ? `📦 「${card.name}」を納品!【${slotName}】が Lv1 に(コスト${card.cost})⚠ 品質リスクが残ります`
      : `📦 「${card.name}」を納品!【${slotName}】が Lv2 に(コスト${card.cost})品質リスクなし`,
  )
  return refreshRequirements(next)
}

/** 差し込みカードの完了処理 */
function completeInterrupt(state: GameState, task: BoardTask): GameState {
  let next: GameState = { ...state, board: state.board.filter((t) => t.cardId !== task.cardId) }
  if (task.interrupt === 'bug') {
    next = addLog(next, '🐛 バグ対応を完了(CS の出血が止まった)')
  } else if (task.interrupt === 'rework') {
    const slotId = task.targetSlotId!
    const name = getSlotDef(next.content, slotId)?.name ?? slotId
    next = addLog(next, `🔁 「${name}」の手戻りに対応完了(要件の判定が復帰)`)
  } else {
    next = changeBudget(next, task.rewardBudget ?? 0)
    next = addLog(next, `💬 相談ごとに対応(予算+${task.rewardBudget ?? 0})`)
  }
  // イベント選択肢由来の追加対応:完了で CS(RULES.md §4-1)
  if (
    task.csOnFulfill > 0 &&
    (task.sourceEventId === null || !next.csAwardedEventIds.includes(task.sourceEventId))
  ) {
    next = {
      ...next,
      cs: next.cs + task.csOnFulfill,
      csAwardedEventIds:
        task.sourceEventId === null
          ? next.csAwardedEventIds
          : [...next.csAwardedEventIds, task.sourceEventId],
    }
    next = addLog(next, `💚 引き受けた追加対応をやり切りました(CS+${task.csOnFulfill})`)
  }
  return refreshRequirements(next)
}

/**
 * END_WEEKEND — 週末を進める(PM)。
 * 1回目:週末イベントを1枚めくって解決待ちにする(RULES.md §7-1)。
 *        解決後、チームは再計画(MOVE_TASK / DROP_TASK / PLAN_TASK)ができる。
 * 2回目:未完了タスクを繰り越して次週へ(最終週ならフェーズ終了へ)。
 */
export function handleEndWeekend(
  state: GameState,
  action: Extract<GameAction, { type: 'END_WEEKEND' }>,
): GameState | RuleViolation {
  if (state.step !== 'weekend') {
    return violation('INVALID_STEP', '週末ではありません。')
  }
  if (state.pendingEvent !== null || state.pendingLimitPlayerIds.length > 0) {
    return violation('PENDING_EVENT', '先にイベントを解決してください。')
  }
  const player = getPlayer(state, action.playerId)
  if (!player) {
    return violation('PLAYER_NOT_FOUND', `プレイヤーが見つかりません: ${action.playerId}`)
  }
  if (state.pmPlayerId !== action.playerId) {
    return violation('NOT_PM', '週末を締めるのは PM 帽子の役目です。')
  }

  // ── 1回目:週末イベントを引く ──
  if (state.pendingWeekendEventDraw) {
    const next: GameState = { ...state, pendingWeekendEventDraw: false }
    const { cardId, deck, rng } = drawCard(next.decks.events, next.rng)
    if (cardId === null) return closeWeek(next)
    return {
      ...next,
      decks: { ...next.decks, events: deck },
      rng,
      pendingEvent: { kind: 'weekend', cardId, targetPlayerId: null },
    }
  }

  // ── 2回目:週を締める ──
  return closeWeek(state)
}

/**
 * 週を締める:未完了タスクの自動繰越(RULES.md §5-4)→ 次週 or フェーズ終了。
 */
function closeWeek(state: GameState): GameState {
  const isLastWeek = state.week >= state.config.roundsPerPhase
  let next = state
  const nextWeek = state.week + 1

  for (const task of state.board) {
    if (task.interrupt || task.plannedWeek === null) continue
    if (task.plannedWeek > state.week) continue
    // 予定週が過ぎている未完了タスク
    const carryTo = isLastWeek || nextWeek > state.config.roundsPerPhase ? null : nextWeek
    if (task.plannedWeek === carryTo) continue
    next = updateBoardTask(next, task.cardId, (t) => ({ ...t, plannedWeek: carryTo }))
    next = addLog(
      next,
      carryTo === null
        ? `⏭ 「${taskLabel(next, task)}」は今フェーズ中に終わらず Backlog へ戻りました。`
        : `⏭ 「${taskLabel(next, task)}」は終わらず第${carryTo}週へ繰り越しました。`,
    )
  }

  if (isLastWeek) return processPhaseEnd(next)
  return startWeek(next, nextWeek)
}

/** 今週のキャパシティ減を受けているプレイヤーID一覧(UI 表示用) */
export function capacityReducedPlayerIds(state: GameState): string[] {
  return state.players.filter((p) => capacityPenalty(state, p) > 0).map((p) => p.id)
}
