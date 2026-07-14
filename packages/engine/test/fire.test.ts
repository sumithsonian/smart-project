/**
 * 🔥(炎上)(rules-v4-core.md §0)
 */
import { describe, expect, it } from 'vitest'
import { applyAction } from '../src/applyAction'
import { requiredCubes } from '../src/helpers'
import { addBoardTask, makeBoardTask, must, newGame, toStandup } from './util'

describe('🔥(炎上)', () => {
  it('requiredCubesは基本工数に🔥の数を足したもの', () => {
    const state = toStandup(newGame(60))
    const withFire = addBoardTask(state, makeBoardTask('t-sitemap-mid', { fire: 2 })) // effort3
    const task = withFire.board.find((b) => b.cardId === 't-sitemap-mid')!
    expect(requiredCubes(withFire, task)).toBe(3 + 2)
  })

  it('延焼:閾値到達で同じ列の他タスクに🔥+1・CS-1が起きる(対象タスク自身は変わらない)', () => {
    let state = newGame(61)
    // fireOutbreakThreshold(3)の1個手前(2個)まで炎上済み・最多キューブにしておく
    state = addBoardTask(state, makeBoardTask('t-req-light', { fire: 2, cubes: 5, lane: 'start' }))
    state = addBoardTask(state, makeBoardTask('t-sitemap-light', { fire: 0, cubes: 0, lane: 'start' }))
    // 局面捏造:次に引く炎上カードを most_cubes 系に固定する
    state = { ...state, decks: { ...state.decks, fires: { drawPile: ['fire-most-1'], discardPile: [] } } }
    const csBefore = state.cs

    state = must(applyAction(state, { type: 'FINISH_SCOPE', playerId: 'a' }))

    const target = state.board.find((b) => b.cardId === 't-req-light')!
    const other = state.board.find((b) => b.cardId === 't-sitemap-light')!
    expect(state.cs).toBe(csBefore - 1)
    expect(target.fire).toBe(2) // 延焼元自身の🔥は増えない
    expect(other.fire).toBe(1) // 同じ列の他タスクに+1
  })

  it('大炎上(epidemic):進行中の全タスクに🔥+1', () => {
    let state = newGame(62)
    state = addBoardTask(state, makeBoardTask('t-req-light'))
    state = addBoardTask(state, makeBoardTask('t-sitemap-light'))
    state = { ...state, decks: { ...state.decks, fires: { drawPile: ['fire-epidemic-1'], discardPile: [] } } }

    state = must(applyAction(state, { type: 'FINISH_SCOPE', playerId: 'a' }))
    expect(state.board.every((b) => b.fire === 1)).toBe(true)
  })
})
