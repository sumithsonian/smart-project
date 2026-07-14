<script setup lang="ts">
/**
 * 検収条件ボード(rules-v4-core.md §1-1・§1-3):公開済みの検収条件一覧。
 * 約束済み/達成済み/未約束をバッジ表示。スコープ会議中は未約束カードをクリックで COMMIT_ACCEPTANCE。
 */
import { computed } from 'vue'

const { state, dispatch, acceptanceCard, slotDef, commitmentOf } = useGame()

const cards = computed(() =>
  state.value.openAcceptanceIds
    .map((id) => acceptanceCard(id))
    .filter((c): c is NonNullable<typeof c> => !!c),
)

function statusOf(id: string): { label: string; kind: 'met' | 'committed' | 'open' } {
  if (state.value.metAcceptanceIds.includes(id)) return { label: '✅ 達成済み', kind: 'met' }
  const commitment = commitmentOf(id)
  if (commitment) {
    const grace = commitment.graceUntilPhase >= state.value.phase
    return { label: grace ? '🤝 約束済み(猶予中)' : '🤝 約束済み', kind: 'committed' }
  }
  return { label: '未約束', kind: 'open' }
}

function clickable(id: string): boolean {
  return state.value.step === 'scope_meeting' && statusOf(id).kind === 'open'
}

function commit(id: string) {
  if (!clickable(id)) return
  dispatch({ type: 'COMMIT_ACCEPTANCE', playerId: state.value.pmPlayerId, acceptanceId: id })
}
</script>

<template>
  <section class="panel">
    <h2>検収条件ボード</h2>
    <div class="acceptance-list">
      <button
        v-for="c in cards"
        :key="c.id"
        class="acceptance-card"
        :class="[statusOf(c.id).kind, { clickable: clickable(c.id) }]"
        :disabled="!clickable(c.id)"
        @click="commit(c.id)"
      >
        <span>
          <strong>{{ c.name }}</strong>
          <span class="muted"> 【{{ slotDef(c.slot)?.name ?? c.slot }}】を Lv{{ c.level }}</span>
        </span>
        <span class="badge" :class="statusOf(c.id).kind === 'met' ? 'ok' : statusOf(c.id).kind === 'committed' ? 'warn' : ''">
          {{ statusOf(c.id).label }}
        </span>
      </button>
      <p v-if="cards.length === 0" class="muted">まだ検収条件が公開されていません。</p>
    </div>
  </section>
</template>
