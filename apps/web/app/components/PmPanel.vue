<script setup lang="ts">
/**
 * PM 帽子の権限(rules-v4-core.md §3):交渉(猶予/取り下げ。フェーズ1回)・追加請求(フェーズ1回)。
 * 引き直し(redraw)はスコープ会議中のみのため ScopeMeetingPanel 側にある。
 * 「週末を締める」(END_WEEKEND)操作は進行バー(TurnDirector)に一本化されている。
 */
import { computed, ref } from 'vue'
import type { NegotiationMode } from '@smart-project/engine'

const { state, dispatch, acceptanceCard } = useGame()

const pm = computed(() => state.value.players.find((p) => p.id === state.value.pmPlayerId))
const negotiateMode = ref<Extract<NegotiationMode, 'grace' | 'withdraw'>>('grace')
const acceptanceId = ref('')
const negotiateDone = computed(() => state.value.negotiationUsedPhase === state.value.phase)
const extraBillingLeft = computed(
  () => state.value.config.extraBillingPerPhase - state.value.extraBillingUsedThisPhase,
)

function negotiate() {
  if (!acceptanceId.value) return
  if (
    dispatch({
      type: 'NEGOTIATE',
      playerId: state.value.pmPlayerId,
      mode: negotiateMode.value,
      acceptanceId: acceptanceId.value,
    })
  ) {
    acceptanceId.value = ''
  }
}
function extraBilling() {
  dispatch({ type: 'EXTRA_BILLING', playerId: state.value.pmPlayerId })
}
</script>

<template>
  <section class="panel">
    <h2>PM 帽子の権限 <span class="muted">({{ pm?.name }})</span></h2>
    <div class="row">
      <select v-model="negotiateMode" :disabled="negotiateDone">
        <option value="grace">猶予(1フェーズ)</option>
        <option value="withdraw">取り下げ(即時CS-1)</option>
      </select>
      <select v-model="acceptanceId" :disabled="negotiateDone">
        <option value="">約束済みの検収条件を選択…</option>
        <option v-for="c in state.commitments" :key="c.acceptanceId" :value="c.acceptanceId">
          {{ acceptanceCard(c.acceptanceId)?.name ?? c.acceptanceId }}
        </option>
      </select>
      <button :disabled="negotiateDone || !acceptanceId" @click="negotiate">🤝 交渉する</button>
      <span v-if="negotiateDone" class="muted">(交渉はこのフェーズ使用済み)</span>
    </div>
    <div class="row">
      <button :disabled="extraBillingLeft <= 0" @click="extraBilling">
        💴 追加請求(予算+{{ state.config.extraBillingBudget }} / CS-{{ state.config.extraBillingCsCost }})
        <span class="muted">残{{ Math.max(0, extraBillingLeft) }}回</span>
      </button>
    </div>
  </section>
</template>
