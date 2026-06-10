/**
 * シード付き乱数(mulberry32)
 * エンジン内で Math.random は使わない。状態は GameState.rng に保持し、再現可能にする。
 */
import type { RngState } from './types/state'

/** 0以上1未満の乱数を1つ生成し、次の乱数状態を返す */
export function nextRandom(rng: RngState): [number, RngState] {
  const t = (rng.seed + 0x6d2b79f5) >>> 0
  let r = t
  r = Math.imul(r ^ (r >>> 15), r | 1)
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
  const value = ((r ^ (r >>> 14)) >>> 0) / 4294967296
  return [value, { seed: t }]
}

/** 0以上 maxExclusive 未満の整数乱数 */
export function nextInt(rng: RngState, maxExclusive: number): [number, RngState] {
  const [value, next] = nextRandom(rng)
  return [Math.floor(value * maxExclusive), next]
}

/** Fisher–Yates シャッフル(元配列は変更しない) */
export function shuffle<T>(rng: RngState, items: readonly T[]): [T[], RngState] {
  const result = [...items]
  let current = rng
  for (let i = result.length - 1; i > 0; i--) {
    const [j, next] = nextInt(current, i + 1)
    current = next
    const a = result[i]!
    result[i] = result[j]!
    result[j] = a
  }
  return [result, current]
}
