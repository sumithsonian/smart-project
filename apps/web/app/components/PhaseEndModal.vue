<script setup lang="ts">
/**
 * フェーズ終了の清算モーダル(RULES.md §8-6)。
 * 期限を迎えた要件の清算(Must / Better)と信頼ボーナスの結果を並べる。
 */
const { state, dispatch } = useGame()

const settlement = computed(() => {
  const marker = `── フェーズ${state.value.phase} 終了の清算 ──`
  const idx = state.value.log.findIndex((e) => e.message === marker)
  return idx >= 0 ? state.value.log.slice(idx) : state.value.log.slice(-6)
})
function advance() {
  dispatch({ type: 'ADVANCE_PHASE' })
}

/** CS が動いた行を色分けする(RULES.md §4-5) */
function settlementClass(message: string): string {
  if (message.includes('CS+') || message.includes('💚') || message.includes('🏆')) return 'plus'
  if (message.includes('CS-') || message.includes('💢') || message.includes('❌')) return 'minus'
  return ''
}
</script>

<template>
  <div class="modal-backdrop">
    <div class="modal-card">
      <h2>🏁 フェーズ{{ state.phase }} 終了の清算</h2>
      <p class="modal-desc">
        期限がこのフェーズの要件を1回だけ清算します(未達の Must は以後くり返し罰されません)。
      </p>
      <ul class="modal-settlement">
        <li v-for="(e, i) in settlement" :key="i" :class="settlementClass(e.message)">
          {{ e.message }}
        </li>
      </ul>
      <div class="modal-actions">
        <button class="primary" @click="advance">
          {{ state.phase >= state.config.phases ? '最終検収へ' : '次フェーズへ' }}
        </button>
      </div>
    </div>
  </div>
</template>
