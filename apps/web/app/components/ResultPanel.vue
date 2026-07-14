<script setup lang="ts">
/** ゲーム終了(rules-v4-core.md §1-3-5):勝敗 + 最終検収の内訳(ログから)。 */
import { computed } from 'vue'

const { state } = useGame()

const summary = computed(() => {
  const idx = state.value.log.findIndex((e) => e.message === '── 最終検収 ──')
  return idx >= 0 ? state.value.log.slice(idx) : []
})
</script>

<template>
  <section v-if="state.result" class="panel result-box" :class="state.result.outcome">
    <h2>{{ state.result.outcome === 'win' ? '🎉 チーム勝利!' : '💀 チーム敗北' }}</h2>
    <p>{{ state.result.reason }}</p>
    <div v-if="summary.length" class="settlement-log">
      <h3>最終検収の内訳</h3>
      <ul>
        <li v-for="(e, i) in summary" :key="i">{{ e.message }}</li>
      </ul>
    </div>
  </section>
</template>
