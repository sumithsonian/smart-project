import { describe, it, expect } from 'vitest'
import { redactFor } from '../src/redact'
import { newGame } from './util'

describe('redactFor(秘匿情報の隠蔽)', () => {
  it('自分の個人目標は見え、他人の個人目標は隠される', () => {
    const state = newGame()
    const view = redactFor(state, 'a')
    expect(view.viewerId).toBe('a')
    const me = view.players.find((p) => p.id === 'a')!
    const other = view.players.find((p) => p.id === 'b')!
    expect(me.personalGoalId).toBe(state.players.find((p) => p.id === 'a')!.personalGoalId)
    expect(other.personalGoalId).toBeNull()
  })

  it('デッキの中身(山札の並び)は枚数だけになる', () => {
    const state = newGame()
    const view = redactFor(state, 'a')
    expect(view.decks.events.drawCount).toBe(state.decks.events.drawPile.length)
    expect(view.decks.requirements.drawCount).toBe(state.decks.requirements.drawPile.length)
    expect((view.decks.events as unknown as Record<string, unknown>)['drawPile']).toBeUndefined()
  })

  it('捨て札は公開情報として見える', () => {
    const state = newGame() // フェーズ開始イベントが1枚捨て札にある
    const view = redactFor(state, 'a')
    expect(view.decks.events.discardPile).toEqual(state.decks.events.discardPile)
  })

  it('乱数シードはビューに含まれない(山札の並びが推測できてしまうため)', () => {
    const view = redactFor(newGame(), 'a')
    expect((view as unknown as Record<string, unknown>)['rng']).toBeUndefined()
  })

  it('盤面の公開情報(CS/予算/タスクエリア/成果物)はそのまま見える', () => {
    const state = newGame()
    const view = redactFor(state, 'b')
    expect(view.cs).toBe(state.cs)
    expect(view.budget).toBe(state.budget)
    expect(view.taskArea).toEqual(state.taskArea)
    expect(view.deliverables).toEqual(state.deliverables)
  })
})
