/**
 * SETUP_GAME — ゲームセットアップ(rules-v4-core.md)
 * メンバーカード配布 → プロダクトボード初期化 → デッキ構成 → 第1フェーズのスコープ会議へ
 */
import type { GameAction } from '../types/actions'
import type { GameState } from '../types/state'
import type { RuleViolation } from '../types/violation'
import { violation } from '../types/violation'
import { DEFAULT_CONFIG } from '../types/config'
import { DEFAULT_CONTENT } from '../content'
import { buildDeck } from '../deck'
import { shuffle } from '../rng'
import { openScopeMeeting } from './scope'

type SetupAction = Extract<GameAction, { type: 'SETUP_GAME' }>

export function handleSetupGame(
  state: GameState,
  action: SetupAction,
): GameState | RuleViolation {
  if (state.step !== 'setup' || state.phase !== 0) {
    return violation('INVALID_STEP', 'ゲームはすでにセットアップ済みです。')
  }

  const config = { ...DEFAULT_CONFIG, ...action.config }
  const content = DEFAULT_CONTENT

  if (action.players.length !== config.playerCount) {
    return violation('INVALID_SETUP', `プレイヤー数が設定(${config.playerCount}人)と一致しません。`)
  }
  if (new Set(action.players.map((p) => p.id)).size !== action.players.length) {
    return violation('INVALID_SETUP', 'プレイヤーIDが重複しています。')
  }
  if (action.players.length > content.members.length) {
    return violation('INVALID_SETUP', 'メンバーカードがプレイヤー数に足りません。')
  }
  const pmPlayerId = action.pmPlayerId ?? action.players[0]!.id
  if (!action.players.some((p) => p.id === pmPlayerId)) {
    return violation('INVALID_SETUP', `PM 帽子のプレイヤーが見つかりません: ${pmPlayerId}`)
  }
  const sheet =
    action.projectSheetId === undefined
      ? content.projectSheets[0]
      : content.projectSheets.find((s) => s.id === action.projectSheetId)
  if (!sheet) {
    return violation('INVALID_SETUP', `プロジェクトシートが見つかりません: ${action.projectSheetId}`)
  }

  let rng = { seed: action.seed >>> 0 }

  // ── メンバーカード配布(指定があれば尊重、なければシャッフルして先頭から)──
  const explicitIds = action.players.map((p) => p.memberId).filter((id): id is string => !!id)
  if (new Set(explicitIds).size !== explicitIds.length) {
    return violation('INVALID_SETUP', 'メンバーカードの指定が重複しています。')
  }
  for (const id of explicitIds) {
    if (!content.members.some((m) => m.id === id)) {
      return violation('INVALID_SETUP', `メンバーカードが見つかりません: ${id}`)
    }
  }
  const [shuffledMembers, rng2] = shuffle(
    rng,
    content.members.filter((m) => !explicitIds.includes(m.id)),
  )
  rng = rng2
  let dealIndex = 0
  const players = action.players.map((p) => {
    const member =
      p.memberId !== undefined
        ? content.members.find((m) => m.id === p.memberId)!
        : shuffledMembers[dealIndex++]!
    return {
      id: p.id,
      name: p.name,
      memberId: member.id,
      skills: { ...member.skills },
      fatigue: 0,
      pendingLearn: null,
      abilityUsedPhase: 0,
      overtimeBanPhase: 0,
    }
  })

  // ── デッキ構成(タスクデッキはフェーズ進行時に該当フェーズぶんを混ぜる)──
  const [eventDeck, rng3] = buildDeck(content.events.map((c) => c.id), rng)
  const [fireDeck, rng4] = buildDeck(content.fires.map((c) => c.id), rng3)
  const [limitDeck, rng5] = buildDeck(content.limitEvents.map((c) => c.id), rng4)
  rng = rng5

  const next: GameState = {
    config,
    content,
    step: 'scope_meeting',
    phase: 1,
    week: 0,
    cs: sheet.initialCs,
    budget: sheet.initialBudget,
    projectSheetId: sheet.id,
    pmPlayerId,
    players,
    taskPool: [],
    board: [],
    slots: content.slots.map((s) => ({
      slotId: s.id,
      level: 0 as const,
      reworkCubes: 0,
      upgradeCubes: 0,
      contributorIds: [],
    })),
    openAcceptanceIds: [],
    commitments: [],
    metAcceptanceIds: [],
    decks: {
      tasks: { drawPile: [], discardPile: [] },
      events: eventDeck,
      fires: fireDeck,
      limitEvents: limitDeck,
    },
    rng,
    assignments: [],
    readyPlayerIds: [],
    remainingFireDraws: 0,
    pendingWeekEventDraw: false,
    pendingEvent: null,
    pendingLimitPlayerIds: [],
    negotiationUsedPhase: 0,
    extraBillingUsedThisPhase: 0,
    expeditedPlayerIds: [],
    placementCounter: 0,
    lanePlacedCount: { start: 0, middle: 0, finish: 0 },
    log: [],
    result: null,
  }

  // ── 第1フェーズのスコープ会議を開く(検収条件の公開・候補プール補充)──
  return openScopeMeeting(next)
}
