<script setup lang="ts">
/**
 * サプライ(タスク候補。rules-v4-core.md §1-1):タスク山札+候補マーケット。
 * 候補カードのクリックで WBS 配置(PLACE_TASK)。PM 交渉「引き直し」中はクリックで選択トグル。
 */
const { state, dispatch } = useGame()

const redrawMode = ref(false)
const redrawSelection = ref<string[]>([])
const negotiateDone = computed(() => state.value.negotiationUsedPhase === state.value.phase)

function toggleRedrawMode() {
  redrawMode.value = !redrawMode.value
  redrawSelection.value = []
}
function toggleCard(cardId: string) {
  if (redrawSelection.value.includes(cardId)) {
    redrawSelection.value = redrawSelection.value.filter((id) => id !== cardId)
  } else if (redrawSelection.value.length < 2) {
    redrawSelection.value = [...redrawSelection.value, cardId]
  }
}
function confirmRedraw() {
  if (
    dispatch({
      type: 'NEGOTIATE',
      playerId: state.value.pmPlayerId,
      mode: 'redraw',
      cardIds: [...redrawSelection.value],
    })
  ) {
    redrawMode.value = false
    redrawSelection.value = []
  }
}
function placeTask(cardId: string) {
  dispatch({ type: 'PLACE_TASK', playerId: state.value.pmPlayerId, cardId })
}
</script>

<template>
  <div class="board supply-board">
    <div class="board-title">サプライ — タスク候補</div>
    <div class="supply-row">
      <div class="supply-deck-block">
        <div class="rail-label">タスク山札({{ state.decks.tasks.drawPile.length }})</div>
        <div class="deck-stack">
          <div class="deck-card back" style="transform: rotate(-3deg); top: 5px; left: 2px" />
          <div class="deck-card back" style="transform: rotate(2deg); top: 2px; left: 0" />
          <div class="deck-card back" style="transform: rotate(-1deg)" />
        </div>
      </div>
      <div class="supply-market-block">
        <div class="market-header">
          <span class="rail-label">タスク候補(表向き{{ state.taskPool.length }}枚) — スコープ会議でここから選んで場に置く</span>
          <div v-if="state.step === 'scope_meeting'" class="redraw-controls">
            <button :disabled="negotiateDone" @click="toggleRedrawMode">
              {{ redrawMode ? '引き直しを終了' : '🔄 PM交渉:引き直し' }}
            </button>
            <template v-if="redrawMode">
              <span class="muted">{{ redrawSelection.length }}/2 選択中</span>
              <button class="primary" :disabled="redrawSelection.length === 0" @click="confirmRedraw">確定</button>
            </template>
            <span v-if="negotiateDone" class="muted">(交渉は使用済み)</span>
          </div>
        </div>
        <div class="market-row">
          <MarketCardTable
            v-for="id in state.taskPool"
            :key="id"
            :task-id="id"
            :redraw-mode="redrawMode"
            :selected="redrawSelection.includes(id)"
            @toggle="toggleCard"
            @place="placeTask"
          />
          <p v-if="state.taskPool.length === 0" class="muted">候補プールが空です。</p>
        </div>
      </div>
    </div>
  </div>
</template>
