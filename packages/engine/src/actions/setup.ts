/**
 * SETUP_GAME — ゲームセットアップ(RULES.md §7)
 */
import type { GameAction } from '../types/actions'
import type { GameState, TaskInstance } from '../types/state'
import type { RuleViolation } from '../types/violation'
import { violation } from '../types/violation'
import { DEFAULT_CONFIG } from '../types/config'
import { DEFAULT_CONTENT } from '../content'
import { buildDeck, drawCard } from '../deck'
import { nextInt, shuffle } from '../rng'

type SetupAction = Extract<GameAction, { type: 'SETUP_GAME' }>

/** フェーズのタスクタイルをタスクエリアに公開する */
export function publishPhaseTasks(state: GameState, phase: number): GameState {
  const tiles = state.content.tasks
    .filter((t) => t.phase === phase)
    .slice(0, state.config.tasksPerPhase)
  const instances: TaskInstance[] = tiles.map((tile) => ({
    tileId: tile.id,
    tokens: {},
    resolved: false,
    resolvedPhase: null,
    appliedRequirementId: null,
  }))
  return { ...state, taskArea: [...state.taskArea, ...instances] }
}

export function handleSetupGame(
  state: GameState,
  action: SetupAction,
): GameState | RuleViolation {
  if (state.step !== 'setup' || state.phase !== 0) {
    return violation('INVALID_STEP', 'ゲームはすでにセットアップ済みです。')
  }

  const config = { ...DEFAULT_CONFIG, ...action.config }
  const content = DEFAULT_CONTENT

  // ── プレイヤー構成の検証 ──
  if (action.players.length !== config.playerCount) {
    return violation(
      'INVALID_SETUP',
      `プレイヤー数が設定(${config.playerCount}人)と一致しません。`,
    )
  }
  if (new Set(action.players.map((p) => p.id)).size !== action.players.length) {
    return violation('INVALID_SETUP', 'プレイヤーIDが重複しています。')
  }
  if (action.players.filter((p) => p.role === 'pm').length !== 1) {
    return violation('INVALID_SETUP', 'PM ロールのプレイヤーがちょうど1人必要です。')
  }
  if (action.players.length > content.personalGoals.length) {
    return violation('INVALID_SETUP', '個人目標カードがプレイヤー数に足りません。')
  }
  for (const p of action.players) {
    if (!content.roles.some((r) => r.role === p.role)) {
      return violation('INVALID_SETUP', `未知のロールです: ${p.role}`)
    }
  }

  let rng = { seed: action.seed >>> 0 }

  // ── 1. プロジェクトカード・クライアントカードを各1枚公開 ──
  let clientId = action.clientId
  if (clientId === undefined) {
    const [i, r] = nextInt(rng, content.clients.length)
    rng = r
    clientId = content.clients[i]!.id
  } else if (!content.clients.some((c) => c.id === clientId)) {
    return violation('INVALID_SETUP', `クライアントカードが見つかりません: ${clientId}`)
  }
  let projectCardId = action.projectCardId
  if (projectCardId === undefined) {
    const [i, r] = nextInt(rng, content.projects.length)
    rng = r
    projectCardId = content.projects[i]!.id
  } else if (!content.projects.some((c) => c.id === projectCardId)) {
    return violation('INVALID_SETUP', `プロジェクトカードが見つかりません: ${projectCardId}`)
  }

  // ── 2. プロジェクトシートに従いトラックを初期化 ──
  const sheet =
    action.projectSheetId === undefined
      ? content.projectSheets[0]
      : content.projectSheets.find((s) => s.id === action.projectSheetId)
  if (!sheet) {
    return violation('INVALID_SETUP', `プロジェクトシートが見つかりません: ${action.projectSheetId}`)
  }
  if (sheet.phaseRules.length < config.phases) {
    return violation('INVALID_SETUP', 'プロジェクトシートの判定ルールがフェーズ数に足りません。')
  }

  // ── 3. デッキを構成しシャッフル ──
  const [eventDeck, rng2] = buildDeck(
    content.events.map((c) => c.id),
    rng,
  )
  const [requirementDeck, rng3] = buildDeck(
    content.requirements.map((c) => c.id),
    rng2,
  )
  const [limitEventDeck, rng4] = buildDeck(
    content.limitEvents.map((c) => c.id),
    rng3,
  )
  rng = rng4

  // ── 5〜7. ロール・個人目標(非公開)・初期スキル・行動トークンを配布 ──
  const [shuffledGoals, rng5] = shuffle(rng, content.personalGoals)
  rng = rng5
  const players = action.players.map((p, i) => {
    const roleDef = content.roles.find((r) => r.role === p.role)!
    return {
      id: p.id,
      name: p.name,
      role: p.role,
      fatigue: 0,
      skills: { ...roleDef.initialSkills },
      initialSkillTotal:
        roleDef.initialSkills.direction +
        roleDef.initialSkills.design +
        roleDef.initialSkills.engineering,
      tokens: config.tokensPerPhase,
      nextPhaseTokenPenalty: 0,
      personalGoalId: shuffledGoals[i]!.id,
      learningProgress: { direction: 0, design: 0, engineering: 0 },
    }
  })

  let next: GameState = {
    config,
    content,
    step: 'planning',
    phase: 1,
    cs: sheet.initialCs,
    budget: sheet.initialBudget,
    initialBudget: sheet.initialBudget,
    clientId,
    projectCardId,
    projectSheetId: sheet.id,
    players,
    taskArea: [],
    deliverables: [],
    decks: { events: eventDeck, requirements: requirementDeck, limitEvents: limitEventDeck },
    rng,
    readyPlayerIds: [],
    resolutionQueue: null,
    pendingRequirementChoice: null,
    pendingEvent: null,
    replenishAfterEvent: false,
    pendingLimitPlayerIds: [],
    nextTaskCostModifier: 0,
    resolutionLog: [],
    lastPhaseSummary: null,
    result: null,
  }

  // ── 4. 第1フェーズのタスクタイルを公開 ──
  next = publishPhaseTasks(next, 1)

  // ── フェーズ開始イベントを1枚引く(RULES.md §2-1。トークンは配布済みのため補充なし) ──
  const { cardId, deck, rng: rng6 } = drawCard(next.decks.events, next.rng)
  if (cardId !== null) {
    next = {
      ...next,
      decks: { ...next.decks, events: deck },
      rng: rng6,
      pendingEvent: { kind: 'phase_start', cardId, targetPlayerId: null },
      replenishAfterEvent: false,
    }
  }

  return next
}
