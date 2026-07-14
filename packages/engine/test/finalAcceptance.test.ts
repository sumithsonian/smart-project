/**
 * 最終検収と勝敗判定(rules-v4-core.md §1-3-5)
 * フェーズ4まで実際にプレイせず、phase_end 局面を直接捏造して ADVANCE_PHASE を呼ぶ。
 */
import { describe, expect, it } from 'vitest'
import { applyAction } from '../src/applyAction'
import { must, newGame } from './util'

describe('最終検収', () => {
  it('未達成はfinalMissCs、Lv2要求をLv1で充足した場合はfinalCompromiseCsが引かれる', () => {
    let state = newGame(80)
    state = {
      ...state,
      phase: state.config.phases,
      step: 'phase_end',
      openAcceptanceIds: ['ac-p1-reqs', 'ac-p1-map'], // requirements:Lv1 / sitemap:Lv2
      metAcceptanceIds: [],
      slots: state.slots.map((s) => {
        if (s.slotId === 'requirements') return { ...s, level: 0 as const } // 未達成
        if (s.slotId === 'sitemap') return { ...s, level: 1 as const, reworkCubes: 0 } // Lv2要求をLv1で妥協
        return s
      }),
    }
    const csBefore = state.cs

    const result = must(applyAction(state, { type: 'ADVANCE_PHASE' }))
    expect(result.cs).toBe(csBefore - state.config.finalMissCs - state.config.finalCompromiseCs)
    expect(result.step).toBe('finished')
    expect(result.result?.outcome).toBe('win') // 5 - 2 - 1 = 2 >= 0
  })

  it('最終検収の結果、CSが0以上なら勝利・0未満なら敗北と判定される', () => {
    const build = (initialCs: number) => {
      let s = newGame(81)
      s = {
        ...s,
        cs: initialCs,
        phase: s.config.phases,
        step: 'phase_end',
        openAcceptanceIds: ['ac-p1-reqs'],
        metAcceptanceIds: [],
        slots: s.slots.map((sl) => (sl.slotId === 'requirements' ? { ...sl, level: 0 as const } : sl)),
      }
      return must(applyAction(s, { type: 'ADVANCE_PHASE' }))
    }
    const lose = build(1) // 1 - finalMissCs(2) = -1
    expect(lose.result?.outcome).toBe('lose')
    const win = build(2) // 2 - 2 = 0
    expect(win.result?.outcome).toBe('win')
  })

  it('最終検収中にCSが0未満になった時点で即時敗北し、以降の項目は清算されない', () => {
    let state = newGame(82)
    state = {
      ...state,
      cs: 1,
      phase: state.config.phases,
      step: 'phase_end',
      openAcceptanceIds: ['ac-p1-reqs', 'ac-p1-map'], // 2件とも未達成
      metAcceptanceIds: [],
      slots: state.slots.map((s) =>
        s.slotId === 'requirements' || s.slotId === 'sitemap' ? { ...s, level: 0 as const } : s,
      ),
    }

    const result = must(applyAction(state, { type: 'ADVANCE_PHASE' }))
    // 1件目(finalMissCs=2)で cs = 1-2 = -1 となり即時敗北。2件目の-2は適用されない
    expect(result.cs).toBe(-1)
    expect(result.step).toBe('finished')
    expect(result.result).toEqual({
      outcome: 'lose',
      reason: expect.stringContaining('CS'),
    })
  })
})
