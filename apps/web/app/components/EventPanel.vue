<script setup lang="ts">
/**
 * 解決待ちイベント(週初トラブル/限界イベント)のカード内容表示パネル。
 * pendingEvent があれば常に最優先で表示する(rules-v4-core.md §1-2・§0)。
 * 「解決」操作は進行バー(TurnDirector)に一本化されているため、ここはカード表示専用。
 */
import { computed } from 'vue'

const { state, eventCardOf, limitEventCardOf } = useGame()

const pending = computed(() => state.value.pendingEvent)
const isLimit = computed(() => pending.value?.kind === 'limit')
const targetName = computed(() =>
  pending.value?.targetPlayerId
    ? state.value.players.find((p) => p.id === pending.value!.targetPlayerId)?.name
    : null,
)
const eventCard = computed(() => (pending.value && !isLimit.value ? eventCardOf(pending.value.cardId) : null))
const limitCard = computed(() => (pending.value && isLimit.value ? limitEventCardOf(pending.value.cardId) : null))
</script>

<template>
  <section v-if="pending" class="panel event-box" :class="{ 'fire-box': isLimit }">
    <h2 v-if="isLimit">😵 限界イベント <span class="muted">({{ targetName }})</span></h2>
    <h2 v-else>⚡ 週初トラブル</h2>
    <template v-if="eventCard">
      <p><strong>{{ eventCard.name }}</strong></p>
      <p class="muted">{{ eventCard.description }}</p>
    </template>
    <template v-else-if="limitCard">
      <p><strong>{{ limitCard.name }}</strong></p>
      <p class="muted">{{ limitCard.description }}</p>
    </template>
    <p class="muted">解決は上部の進行バーの「イベントを解決」で行います。</p>
  </section>
</template>
