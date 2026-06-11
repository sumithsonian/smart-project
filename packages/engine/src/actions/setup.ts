/**
 * SETUP_GAME — ゲームセットアップ(RULES.md §7)
 */
import type { GameAction } from '../types/actions'
import type { GameState, TaskInstance } from '../types/state'
import type { RuleViolation } from '../types/violation'
import { violation } from '../types/violation'
import { DEFAULT_CONFIG } from '../types/config'
import { DEFAULT_CONTENT } from '../content'
import { buildDeck } from '../deck'
import { nextInt, shuffle } from '../rng'
import { beginPhaseStart } from './fire'

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
    fire: 0,
    extinguisherIds: [],
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
  const goalChoices = Math.max(1, config.personalGoalChoices)
  if (action.players.length * goalChoices > content.personalGoals.length) {
    return violation('INVALID_SETUP', '個人目標カードがプレイヤー数 × 配布枚数に足りません。')
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
  // v2.1:goalChoices 枚配って1枚選ぶ(1枚配布なら従来どおり自動割当)
  const [shuffledGoals, rng5] = shuffle(rng, content.personalGoals)
  rng = rng5
  const players = action.players.map((p, i) => {
    const roleDef = content.roles.find((r) => r.role === p.role)!
    const dealt = shuffledGoals.slice(i * goalChoices, (i + 1) * goalChoices)
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
      personalGoalId: goalChoices === 1 ? dealt[0]!.id : '',
      goalOptionIds: goalChoices === 1 ? [] : dealt.map((g) => g.id),
      learningProgress: { direction: 0, design: 0, engineering: 0 },
      ep: 0,
      extinguishCount: 0,
      skillUpCount: 0,
      tokensPlacedThisPhase: 0,
    }
  })

  // ── マイルストーンを公開(v2.1)──
  let milestones: GameState['milestones'] = []
  if (config.milestonesEnabled) {
    const [shuffledMilestones, rng6] = shuffle(rng, content.milestones)
    rng = rng6
    milestones = shuffledMilestones
      .slice(0, config.milestoneCount)
      .map((m) => ({ cardId: m.id, achievedBy: null }))
  }

  // ── 炎上デッキの初期構成(大炎上カードのみ。各フェーズ開始時にタスクカードが混ざる)──
  const fireDeck = {
    drawPile: Array.from({ length: config.epidemicCount }, (_, i) => `epidemic-${i + 1}`),
    discardPile: [],
  }

  const needsGoalSelection = goalChoices > 1

  let next: GameState = {
    config,
    content,
    step: needsGoalSelection ? 'goal_selection' : 'planning',
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
    decks: {
      events: eventDeck,
      requirements: requirementDeck,
      limitEvents: limitEventDeck,
      fires: fireDeck,
    },
    rng,
    readyPlayerIds: [],
    resolutionQueue: null,
    pendingRequirementChoice: null,
    pendingEvent: null,
    replenishAfterEvent: false,
    pendingLimitPlayerIds: [],
    nextTaskCostModifier: 0,
    remainingFireDraws: 0,
    pendingEpidemicCount: 0,
    phaseStartReplenish: null,
    fireLog: [],
    taskParticipants: {},
    milestones,
    resolutionLog: [],
    lastPhaseSummary: null,
    result: null,
  }

  // ── 4. 第1フェーズのタスクタイルを公開 ──
  next = publishPhaseTasks(next, 1)

  // ── フェーズ開始フロー(炎上 → イベント)。目標選択がある場合は全員の選択後に行う ──
  if (!needsGoalSelection) {
    next = beginPhaseStart(next, false)
  }

  return next
}

/** SELECT_PERSONAL_GOAL — 配られた個人目標カードから1枚選ぶ(v2.1) */
export function handleSelectPersonalGoal(
  state: GameState,
  action: Extract<GameAction, { type: 'SELECT_PERSONAL_GOAL' }>,
): GameState | RuleViolation {
  if (state.step !== 'goal_selection') {
    return violation('INVALID_STEP', '個人目標の選択ステップではありません。')
  }
  const player = state.players.find((p) => p.id === action.playerId)
  if (!player) {
    return violation('PLAYER_NOT_FOUND', `プレイヤーが見つかりません: ${action.playerId}`)
  }
  if (player.personalGoalId !== '') {
    return violation('GOAL_ALREADY_SELECTED', 'すでに個人目標を選択済みです。')
  }
  const chosen = player.goalOptionIds[action.choiceIndex]
  if (chosen === undefined) {
    return violation('INVALID_GOAL_CHOICE', '選択肢の範囲外です。')
  }
  let next: GameState = {
    ...state,
    players: state.players.map((p) =>
      p.id === player.id ? { ...p, personalGoalId: chosen, goalOptionIds: [] } : p,
    ),
  }
  // 全員選び終わったらプランニングへ(フェーズ開始フロー:炎上 → イベント)
  if (next.players.every((p) => p.personalGoalId !== '')) {
    next = { ...next, step: 'planning' }
    next = beginPhaseStart(next, false)
  }
  return next
}
