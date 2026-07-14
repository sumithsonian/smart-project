<script setup lang="ts">
/** メインボード:CS・予算・フェーズ/週トラック + プロジェクトシート情報 */
import { computed } from 'vue'

const { state, projectSheetOf, phaseNames, stepLabels } = useGame()

const sheet = computed(() => projectSheetOf(state.value.projectSheetId))
const stepLabel = computed(() => stepLabels[state.value.step])
const pmName = computed(() => state.value.players.find((p) => p.id === state.value.pmPlayerId)?.name)
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
        <span class="track-value">{{ state.budget }}</span>
      </div>
      <div class="track">
        <span class="track-label">フェーズ</span>
        <span class="track-value">{{ state.phase }}<span class="muted">/{{ state.config.phases }}</span></span>
      </div>
      <div class="track">
        <span class="track-label">週</span>
        <span class="track-value">
          {{ state.step === 'scope_meeting' ? '会議' : state.week }}<span class="muted">/{{ state.config.roundsPerPhase }}</span>
        </span>
      </div>
      <div class="track step-badge">
        <span class="track-label">{{ phaseNames[state.phase - 1] ?? '-' }}</span>
        <span class="track-value">{{ stepLabel }}</span>
      </div>
    </div>
    <div class="board-info">
      <span v-if="sheet">📦 {{ sheet.name }}<span class="muted"> {{ sheet.description }}</span></span>
      <span>👑 PM帽子:<strong>{{ pmName }}</strong></span>
    </div>
  </section>
</template>
