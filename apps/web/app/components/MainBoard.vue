<script setup lang="ts">
/**
 * メインボード:CS・予算の数値トラック + プロジェクトシート情報。
 * フェーズ/週/ステップの表示は進行バー(TurnDirector)のステッパーに一本化されているため、
 * ここでは重複を避けて数値トラックのみに絞る。
 */
import { computed } from 'vue'

const { state, projectSheetOf, skillLabels, skillColors } = useGame()

const sheet = computed(() => projectSheetOf(state.value.projectSheetId))
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
    </div>
    <div class="board-info">
      <span v-if="sheet">📦 {{ sheet.name }}<span class="muted"> {{ sheet.description }}</span></span>
      <span>👑 PM帽子:<strong>{{ pmName }}</strong></span>
    </div>
    <div class="skill-legend" title="系統カラー(全ボード共通)">
      <span v-for="(label, skill) in skillLabels" :key="skill" class="skill-legend-item">
        <span class="skill-legend-dot" :style="{ background: skillColors[skill] }" />
        {{ label }}
      </span>
    </div>
  </section>
</template>
