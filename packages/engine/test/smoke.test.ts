import { describe, it, expect } from 'vitest'
import { ENGINE_VERSION } from '../src/index'

describe('エンジンパッケージ', () => {
  it('エクスポートが解決できる', () => {
    expect(ENGINE_VERSION).toBe('0.1.0')
  })
})
