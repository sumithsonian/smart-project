import { describe, it, expect } from 'vitest'
import type { GameAction, PlayerSetup } from '../src/types'
import { isRuleViolation, DEFAULT_CONFIG } from '../src/types'
import { applyAction } from '../src/applyAction'
import { createInitialState } from '../src/initialState'
import { replay } from '../src/replay'
import { PROJECT_SHEETS } from '../src/content'

export const PLAYERS: PlayerSetup[] = [
  { id: 'a', name: 'あきら', role: 'pm' },
  { id: 'b', name: 'ばなな', role: 'director' },
  { id: 'c', name: 'ちひろ', role: 'designer' },
  { id: 'd', name: 'だいち', role: 'engineer' },
]

/** v1 ルール相当(v2.1 の新システムはオフ)でのセットアップ */
export const SETUP_ACTION: GameAction = {
  type: 'SETUP_GAME',
  seed: 42,
  players: PLAYERS,
  clientId: 'cl-komakai',
  projectCardId: 'pj-corporate',
  projectSheetId: 'ps-standard',
  config: {
    fireEnabled: false,
    epEnabled: false,
    milestonesEnabled: false,
    personalGoalChoices: 1,
  },
}

describe('SETUP_GAME(RULES.md §7)', () => {
  it('セットアップ後の状態が正しい', () => {
    const state = applyAction(createInitialState(), SETUP_ACTION)
    if (isRuleViolation(state)) throw new Error(state.message)

    const sheet = PROJECT_SHEETS[0]!
    // §7-1,2: カード公開とトラック初期化
    expect(state.clientId).toBe('cl-komakai')
    expect(state.projectCardId).toBe('pj-corporate')
    expect(state.cs).toBe(sheet.initialCs)
    expect(state.budget).toBe(sheet.initialBudget)
    // §7-3: デッキ構成(フェーズ開始イベントを1枚引いた残り)
    expect(state.decks.events.drawPile.length).toBe(10 - 1)
    expect(state.decks.requirements.drawPile.length).toBe(8)
    expect(state.decks.limitEvents.drawPile.length).toBe(7)
    // §7-4: 第1フェーズのタスク公開
    expect(state.taskArea).toHaveLength(DEFAULT_CONFIG.tasksPerPhase)
    expect(state.taskArea.every((t) => !t.resolved)).toBe(true)
    // §7-5,6: ロール・個人目標・初期スキル
    expect(state.players).toHaveLength(4)
    const goalIds = state.players.map((p) => p.personalGoalId)
    expect(new Set(goalIds).size).toBe(4)
    const pm = state.players.find((p) => p.role === 'pm')!
    expect(pm.skills.direction).toBe(2)
    // §7-7: 行動トークン配布
    expect(state.players.every((p) => p.tokens === DEFAULT_CONFIG.tokensPerPhase)).toBe(true)
    // フェーズ1のプランニングから開始(フェーズ開始イベントの解決待ち)
    expect(state.step).toBe('planning')
    expect(state.phase).toBe(1)
    expect(state.pendingEvent?.kind).toBe('phase_start')
  })

  it('同じシードなら同じ状態になる(再現性)', () => {
    const a = applyAction(createInitialState(), SETUP_ACTION)
    const b = applyAction(createInitialState(), SETUP_ACTION)
    expect(a).toEqual(b)
  })

  it('シードが違えばデッキの並びが変わる', () => {
    const a = applyAction(createInitialState(), SETUP_ACTION)
    const b = applyAction(createInitialState(), { ...SETUP_ACTION, seed: 43 })
    if (isRuleViolation(a) || isRuleViolation(b)) throw new Error('セットアップ失敗')
    expect(a.decks.events.drawPile).not.toEqual(b.decks.events.drawPile)
  })

  it('PM が2人いると拒否される', () => {
    const result = applyAction(createInitialState(), {
      ...SETUP_ACTION,
      players: PLAYERS.map((p) => (p.id === 'b' ? { ...p, role: 'pm' as const } : p)),
    })
    expect(isRuleViolation(result) && result.code).toBe('INVALID_SETUP')
  })

  it('プレイヤー数が設定と合わないと拒否される', () => {
    const result = applyAction(createInitialState(), {
      ...SETUP_ACTION,
      players: PLAYERS.slice(0, 3),
    })
    expect(isRuleViolation(result) && result.code).toBe('INVALID_SETUP')
  })

  it('二重セットアップは拒否される', () => {
    const state = applyAction(createInitialState(), SETUP_ACTION)
    if (isRuleViolation(state)) throw new Error(state.message)
    const again = applyAction(state, SETUP_ACTION)
    expect(isRuleViolation(again) && again.code).toBe('INVALID_STEP')
  })
})

describe('replay', () => {
  it('アクションログから同じ状態を再構築できる', () => {
    const direct = applyAction(createInitialState(), SETUP_ACTION)
    const replayed = replay([SETUP_ACTION])
    expect(replayed).toEqual(direct)
  })

  it('不正なログは例外になる', () => {
    expect(() => replay([{ type: 'DECLARE_READY', playerId: 'a' }])).toThrow(/リプレイ失敗/)
  })
})

describe('RESOLVE_EVENT(フェーズ開始イベント)', () => {
  it('イベントを解決すると pendingEvent が消え、カードが捨て札に行く', () => {
    const state = applyAction(createInitialState(), SETUP_ACTION)
    if (isRuleViolation(state)) throw new Error(state.message)
    const cardId = state.pendingEvent!.cardId
    const next = applyAction(state, { type: 'RESOLVE_EVENT' })
    if (isRuleViolation(next)) throw new Error(next.message)
    expect(next.pendingEvent).toBeNull()
    expect(next.decks.events.discardPile).toContain(cardId)
  })

  it('解決待ちがないのに RESOLVE_EVENT すると拒否される', () => {
    const state = applyAction(createInitialState(), SETUP_ACTION)
    if (isRuleViolation(state)) throw new Error(state.message)
    const next = applyAction(state, { type: 'RESOLVE_EVENT' })
    if (isRuleViolation(next)) throw new Error(next.message)
    const again = applyAction(next, { type: 'RESOLVE_EVENT' })
    expect(isRuleViolation(again) && again.code).toBe('NO_PENDING_EVENT')
  })
})
