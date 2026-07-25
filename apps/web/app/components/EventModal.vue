<script setup lang="ts">
/** 解決待ちイベント(週初トラブル/限界イベント)のモーダル表示(rules-v4-core.md §1-2・§0)。 */
const { state, dispatch, eventCardOf, limitEventCardOf } = useGame()

const pending = computed(() => state.value.pendingEvent)
const isLimit = computed(() => pending.value?.kind === 'limit')
const targetName = computed(() =>
  pending.value?.targetPlayerId
    ? state.value.players.find((p) => p.id === pending.value!.targetPlayerId)?.name
    : null,
)
const eventCard = computed(() => (pending.value && !isLimit.value ? eventCardOf(pending.value.cardId) : null))
const limitCard = computed(() => (pending.value && isLimit.value ? limitEventCardOf(pending.value.cardId) : null))

function resolve() {
  dispatch({ type: 'RESOLVE_EVENT' })
}
</script>

<template>
  <div v-if="pending" class="modal-backdrop">
    <div class="modal-card">
      <h2 v-if="isLimit">😵 限界イベント <span class="modal-sub">({{ targetName }})</span></h2>
      <h2 v-else>⚡ 週初トラブル</h2>
      <template v-if="eventCard">
        <p><strong>{{ eventCard.name }}</strong></p>
        <p class="modal-desc">{{ eventCard.description }}</p>
      </template>
      <template v-else-if="limitCard">
        <p><strong>{{ limitCard.name }}</strong></p>
        <p class="modal-desc">{{ limitCard.description }}</p>
      </template>
      <div class="modal-actions">
        <button class="primary" @click="resolve">イベントを解決</button>
      </div>
    </div>
  </div>
</template>
