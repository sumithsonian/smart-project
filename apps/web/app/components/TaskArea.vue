<script setup lang="ts">
/** タスクエリア:依存関係・トークン積み上げ・解決状況の表示。クリックで選択 */
import { computed } from 'vue'
import type { TaskInstance } from '@smart-project/engine'

const { state, tile, selectedTaskId, roleName } = useGame()

const skillLabels: Record<string, string> = {
  direction: 'ディレクション',
  design: 'デザイン',
  engineering: 'エンジニアリング',
}

function tokenSum(t: TaskInstance): number {
  return Object.values(t.tokens).reduce((a, b) => a + b, 0)
}

function depNames(tileId: string): string[] {
  const def = tile(tileId)
  if (!def) return []
  return def.dependsOn.map((d) => {
    const parent = tile(d)
    const instance = state.value.taskArea.find((x) => x.tileId === d)
    const done = !instance || instance.resolved
    return `${parent?.name ?? d}${done ? ' ✅' : ''}`
  })
}

function playerName(id: string): string {
  return state.value.players.find((p) => p.id === id)?.name ?? id
}

const sorted = computed(() => {
  // 持ち越しタスク(前フェーズ)→ 今フェーズの順に表示
  return [...state.value.taskArea].sort(
    (a, b) => (tile(a.tileId)?.phase ?? 0) - (tile(b.tileId)?.phase ?? 0),
  )
})
</script>

<template>
  <section class="panel">
    <h2>タスクエリア</h2>
    <div class="task-grid">
      <div
        v-for="t in sorted"
        :key="t.tileId"
        class="task-card"
        :class="{
          resolved: t.resolved,
          selected: selectedTaskId === t.tileId,
          carried: (tile(t.tileId)?.phase ?? 0) < state.phase,
        }"
        @click="selectedTaskId = selectedTaskId === t.tileId ? null : t.tileId"
      >
        <div class="task-title">
          <strong>{{ tile(t.tileId)?.name }}</strong>
          <span v-if="t.resolved" class="badge ok">解決済</span>
          <span v-else-if="(tile(t.tileId)?.phase ?? 0) < state.phase" class="badge warn">持ち越し</span>
        </div>
        <div class="task-meta">
          <span class="badge">🪙 {{ tokenSum(t) }}/{{ tile(t.tileId)?.requiredTokens }}</span>
          <span class="badge">💰 {{ tile(t.tileId)?.cost }}</span>
          <span class="badge">😓 +{{ tile(t.tileId)?.fatigue }}</span>
          <span v-if="tile(t.tileId)?.skillRequirement" class="badge">
            🎓 {{ skillLabels[tile(t.tileId)!.skillRequirement!.skill] }} Lv{{ tile(t.tileId)!.skillRequirement!.level }}
          </span>
          <span v-if="tile(t.tileId)?.hiddenRequirement" class="badge secret">❓秘匿要件</span>
          <span v-if="tile(t.tileId)?.collaboration" class="badge">🤝協業</span>
          <span v-if="tile(t.tileId)?.eventMark" class="badge">⚡イベント</span>
          <span v-if="tile(t.tileId)?.specialEffect" class="badge">✨次コスト-{{ tile(t.tileId)!.specialEffect!.amount }}</span>
        </div>
        <div v-if="tile(t.tileId)?.deliverables.length" class="task-meta muted">
          成果物: {{ tile(t.tileId)!.deliverables.map((l) => `Lv${l}`).join(', ') }}
        </div>
        <div v-if="depNames(t.tileId).length" class="task-deps muted">
          ⬆ 依存: {{ depNames(t.tileId).join(' / ') }}
        </div>
        <div v-if="tokenSum(t) > 0" class="task-tokens">
          <span v-for="(count, pid) in t.tokens" :key="pid">
            <template v-if="count > 0">{{ playerName(String(pid)) }}×{{ count }} </template>
          </span>
        </div>
        <div v-if="t.appliedRequirementId" class="muted">
          📋 要件: {{ useGame().requirementCard(t.appliedRequirementId)?.name }}
        </div>
      </div>
    </div>
    <p class="muted">タスクをクリックすると選択され、個人ボードの「配置」「回収」の対象になります。</p>
  </section>
</template>
