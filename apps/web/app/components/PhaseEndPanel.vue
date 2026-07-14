<script setup lang="ts">
/** フェーズ終了(rules-v4-core.md §1-3):清算結果(直近ログ)を表示し、次フェーズへ進む。 */
import { computed } from 'vue'

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
  <section class="panel">
    <h2>🏁 フェーズ{{ state.phase }} 終了の清算</h2>
    <div class="settlement-log">
      <ul>
        <li v-for="(e, i) in settlement" :key="i">{{ e.message }}</li>
      </ul>
    </div>
    <button class="primary" @click="advance">
      {{ state.phase >= state.config.phases ? '最終検収へ' : '次フェーズへ' }}
    </button>
  </section>
</template>
