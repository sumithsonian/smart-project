<script setup lang="ts">
/** メインボード:CS・予算・フェーズ・クライアント/プロジェクト情報 */
import { computed } from 'vue'

const { state, content } = useGame()

const client = computed(() => content.value.clients.find((c) => c.id === state.value.clientId))
const project = computed(() =>
  content.value.projects.find((c) => c.id === state.value.projectCardId),
)
const sheet = computed(() =>
  content.value.projectSheets.find((s) => s.id === state.value.projectSheetId),
)
const stepLabel = computed(() => {
  const labels: Record<string, string> = {
    setup: 'セットアップ',
    planning: 'プランニング(同時配置)',
    execution: '実行',
    phase_end: 'フェーズ終了',
    finished: 'ゲーム終了',
  }
  return labels[state.value.step] ?? state.value.step
})
const lv1Count = computed(() => state.value.deliverables.filter((d) => d.level === 1).length)
const lv2Count = computed(() => state.value.deliverables.filter((d) => d.level === 2).length)
const phaseRule = computed(() => sheet.value?.phaseRules[state.value.phase - 1])
const phaseNames = ['企画・要件定義', '設計・デザイン', '開発', 'テスト']
</script>

<template>
  <section class="panel main-board">
    <div class="tracks">
      <div class="track" :class="{ danger: state.cs < 2 }">
        <span class="track-label">CS</span>
        <span class="track-value">{{ state.cs }}</span>
      </div>
      <div class="track" :class="{ danger: state.budget < 3 }">
        <span class="track-label">予算</span>
        <span class="track-value">{{ state.budget }}<span class="muted">/{{ state.initialBudget }}</span></span>
      </div>
      <div class="track">
        <span class="track-label">フェーズ</span>
        <span class="track-value">{{ state.phase }}<span class="muted">/{{ state.config.phases }}</span></span>
      </div>
      <div class="track">
        <span class="track-label">成果物</span>
        <span class="track-value">Lv1×{{ lv1Count }} / Lv2×{{ lv2Count }}</span>
      </div>
      <div class="track step-badge">
        <span class="track-label">{{ phaseNames[state.phase - 1] ?? '-' }}</span>
        <span class="track-value">{{ stepLabel }}</span>
      </div>
    </div>
    <div class="board-info">
      <span v-if="client">
        🏢 {{ client.name }}(Q{{ client.weights.q }}/C{{ client.weights.c }}/D{{ client.weights.d }})
        <span class="muted">{{ client.personality }}</span>
      </span>
      <span v-if="project">📦 {{ project.name }}</span>
      <span v-if="phaseRule" class="muted">
        今フェーズ基準:品質 Lv2×{{ phaseRule.qualityThreshold }} / 納期 未解決≦{{ phaseRule.deadlineAllowance }}
      </span>
    </div>
    <div v-if="state.lastPhaseSummary" class="phase-summary">
      フェーズ{{ state.lastPhaseSummary.phase }}判定:
      納期 {{ state.lastPhaseSummary.deadlineMet ? '✅' : '❌' }}(未解決{{ state.lastPhaseSummary.unresolvedCount }})
      / 品質 {{ state.lastPhaseSummary.qualityMet ? '✅' : '❌' }}(Lv2×{{ state.lastPhaseSummary.lv2Count }})
      / CS変動 {{ state.lastPhaseSummary.csDelta }}
    </div>
  </section>
</template>
