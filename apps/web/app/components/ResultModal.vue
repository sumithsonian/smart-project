<script setup lang="ts">
/** ゲーム終了(RULES.md §4-4):勝敗+最終検収の内訳。 */
const { state, reset } = useGame()

const summary = computed(() => {
  const idx = state.value.log.findIndex((e) => e.message === '── 最終検収 ──')
  return idx >= 0 ? state.value.log.slice(idx) : []
})
</script>

<template>
  <div v-if="state.result" class="modal-backdrop">
    <div class="modal-card">
      <span class="modal-result-badge" :class="state.result.outcome">
        {{ state.result.outcome === 'win' ? '🎉 チーム勝利!' : '💀 チーム敗北' }}
      </span>
      <p>{{ state.result.reason }}</p>
      <template v-if="summary.length">
        <h3>最終検収の内訳</h3>
        <ul class="modal-settlement">
          <li v-for="(e, i) in summary" :key="i">{{ e.message }}</li>
        </ul>
      </template>
      <div class="modal-actions">
        <button class="primary" @click="reset">新しいゲーム</button>
      </div>
    </div>
  </div>
</template>
