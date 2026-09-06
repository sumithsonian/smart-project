<script setup lang="ts">
/**
 * 解決待ちイベントのモーダル(RULES.md §7)。
 * 週末イベントは選択肢を持ちうる(受ける / 交渉する / 断る)。
 * 選べない選択肢(予算不足など)は理由つきで無効表示にする。
 */
const { state, dispatch, dryRun, eventCardOf, limitEventCardOf } = useGame()

const pending = computed(() => state.value.pendingEvent)
const isLimit = computed(() => pending.value?.kind === 'limit')
const targetName = computed(() =>
  pending.value?.targetPlayerId
    ? state.value.players.find((p) => p.id === pending.value!.targetPlayerId)?.name
    : null,
)
const eventCard = computed(() =>
  pending.value && !isLimit.value ? eventCardOf(pending.value.cardId) : null,
)
const limitCard = computed(() =>
  pending.value && isLimit.value ? limitEventCardOf(pending.value.cardId) : null,
)

/** 選択肢とその可否(dryRun で判定するので、予算不足などが理由つきで出る) */
const choices = computed(() =>
  (eventCard.value?.choices ?? []).map((c) => {
    const violation = dryRun({ type: 'RESOLVE_EVENT', choiceId: c.id })
    return { choice: c, reason: violation ? violation.message : null }
  }),
)

function resolve(choiceId?: string) {
  dispatch({ type: 'RESOLVE_EVENT', ...(choiceId ? { choiceId } : {}) })
}
</script>

<template>
  <div v-if="pending" class="modal-backdrop">
    <div class="modal-card event-modal">
      <h2 v-if="isLimit">
        😵 限界イベント <span class="modal-sub">({{ targetName }})</span>
      </h2>
      <h2 v-else>⚡ 週末のできごと <span class="modal-sub">結果は来週に効きます</span></h2>

      <template v-if="eventCard">
        <p class="event-name"><strong>{{ eventCard.name }}</strong></p>
        <p class="modal-desc">{{ eventCard.description }}</p>
      </template>
      <template v-else-if="limitCard">
        <p class="event-name"><strong>{{ limitCard.name }}</strong></p>
        <p class="modal-desc">{{ limitCard.description }}</p>
      </template>

      <div v-if="choices.length > 0" class="event-choices">
        <button
          v-for="c in choices"
          :key="c.choice.id"
          class="event-choice"
          :class="{ disabled: !!c.reason }"
          :disabled="!!c.reason"
          :title="c.reason ?? ''"
          @click="resolve(c.choice.id)"
        >
          <span class="event-choice-label">{{ c.choice.label }}</span>
          <span class="event-choice-desc">{{ c.choice.description }}</span>
          <span v-if="c.reason" class="event-choice-reason">{{ c.reason }}</span>
        </button>
      </div>

      <div v-else class="modal-actions">
        <button class="primary" @click="resolve()">解決する</button>
      </div>
    </div>
  </div>
</template>
