<script setup lang="ts">
/** フェーズ終了の清算モーダル(rules-v4-core.md §1-3)。 */
const { state, dispatch } = useGame()

const settlement = computed(() => {
  const marker = `── フェーズ${state.value.phase} 終了の清算 ──`
  const idx = state.value.log.findIndex((e) => e.message === marker)
  return idx >= 0 ? state.value.log.slice(idx) : state.value.log.slice(-6)
})
function advance() {
  dispatch({ type: 'ADVANCE_PHASE' })
}
</script>

<template>
  <div class="modal-backdrop">
    <div class="modal-card">
      <h2>🏁 フェーズ{{ state.phase }} 終了の清算</h2>
      <ul class="modal-settlement">
        <li v-for="(e, i) in settlement" :key="i">{{ e.message }}</li>
      </ul>
      <div class="modal-actions">
        <button class="primary" @click="advance">
          {{ state.phase >= state.config.phases ? '最終判定へ' : '次フェーズへ' }}
        </button>
      </div>
    </div>
  </div>
</template>
