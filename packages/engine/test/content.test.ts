import { describe, it, expect } from 'vitest'
import { DEFAULT_CONTENT } from '../src/content'
import { DEFAULT_CONFIG } from '../src/types/config'

describe('仮コンテンツの整合性', () => {
  it('タスクは各フェーズ5枚 × 4フェーズある', () => {
    for (let phase = 1; phase <= 4; phase++) {
      const tasks = DEFAULT_CONTENT.tasks.filter((t) => t.phase === phase)
      expect(tasks, `フェーズ${phase}`).toHaveLength(5)
    }
  })

  it('タスクの依存参照は同フェーズ内の実在タイルを指す(自己参照なし)', () => {
    const byId = new Map(DEFAULT_CONTENT.tasks.map((t) => [t.id, t]))
    for (const task of DEFAULT_CONTENT.tasks) {
      for (const dep of task.dependsOn) {
        const parent = byId.get(dep)
        expect(parent, `${task.id} の依存先 ${dep}`).toBeDefined()
        expect(parent!.phase, `${task.id} の依存先フェーズ`).toBe(task.phase)
        expect(dep).not.toBe(task.id)
      }
    }
  })

  it('タスクの依存グラフは循環しない', () => {
    const byId = new Map(DEFAULT_CONTENT.tasks.map((t) => [t.id, t]))
    const visiting = new Set<string>()
    const done = new Set<string>()
    const visit = (id: string): void => {
      expect(visiting.has(id), `循環検出: ${id}`).toBe(false)
      if (done.has(id)) return
      visiting.add(id)
      for (const dep of byId.get(id)!.dependsOn) visit(dep)
      visiting.delete(id)
      done.add(id)
    }
    for (const task of DEFAULT_CONTENT.tasks) visit(task.id)
  })

  it('成果物は0〜2個・Lv1/Lv2のみ', () => {
    for (const task of DEFAULT_CONTENT.tasks) {
      expect(task.deliverables.length).toBeLessThanOrEqual(2)
      for (const lv of task.deliverables) expect([1, 2]).toContain(lv)
    }
  })

  it('カード枚数が HANDOFF の指定どおり', () => {
    expect(DEFAULT_CONTENT.events).toHaveLength(10)
    expect(DEFAULT_CONTENT.requirements).toHaveLength(8)
    expect(DEFAULT_CONTENT.limitEvents).toHaveLength(7) // 6枚 + 「何も起きない」1枚
    expect(DEFAULT_CONTENT.personalGoals).toHaveLength(4)
  })

  it('限界イベントに「何も起きない」が1枚だけ含まれる', () => {
    const none = DEFAULT_CONTENT.limitEvents.filter((c) => c.effect.type === 'NONE')
    expect(none).toHaveLength(1)
  })

  it('カードIDはすべて一意', () => {
    const ids = [
      ...DEFAULT_CONTENT.tasks,
      ...DEFAULT_CONTENT.events,
      ...DEFAULT_CONTENT.requirements,
      ...DEFAULT_CONTENT.limitEvents,
      ...DEFAULT_CONTENT.personalGoals,
      ...DEFAULT_CONTENT.clients,
      ...DEFAULT_CONTENT.projects,
      ...DEFAULT_CONTENT.projectSheets,
    ].map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('プロジェクトシートはフェーズ数ぶんの判定ルールを持つ', () => {
    for (const sheet of DEFAULT_CONTENT.projectSheets) {
      expect(sheet.phaseRules).toHaveLength(DEFAULT_CONFIG.phases)
    }
  })

  it('ロール定義は4種すべて揃っている', () => {
    const roles = DEFAULT_CONTENT.roles.map((r) => r.role)
    expect(new Set(roles)).toEqual(new Set(['pm', 'director', 'designer', 'engineer']))
  })
})
