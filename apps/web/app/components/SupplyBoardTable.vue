<script setup lang="ts">
/**
 * サプライ(タスク候補。RULES.md §5-1・§9-2):タスク山札 + 候補マーケット。
 * 候補カードをクリックして予定週を選ぶと計画ボードに載る(PLAN_TASK)。
 * 引き直し(REDRAW_TASKS)はスコープ会議中・フェーズ redrawPerPhase 回まで。
 */
const { state, dispatch } = useGame()

const redrawMode = ref(false)
const redrawSelection = ref<string[]>([])
const redrawLeft = computed(
  () => state.value.config.redrawPerPhase - state.value.redrawUsedThisPhase,
)
const canPlan = computed(
  () =>
    (state.value.step === 'scope_meeting' || state.value.step === 'weekend') &&
    !state.value.pendingEvent,
)

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
      type: 'REDRAW_TASKS',
      playerId: state.value.pmPlayerId,
      cardIds: [...redrawSelection.value],
    })
  ) {
    redrawMode.value = false
    redrawSelection.value = []
  }
}
function planTask(cardId: string, week: number | null) {
  dispatch({ type: 'PLAN_TASK', playerId: state.value.pmPlayerId, cardId, week })
}
</script>

<template>
  <div class="board supply-board">
    <div class="board-title">
      サプライ — タスク候補
      <span class="board-sub">同じ成果物に複数の道があります。やらなくていいタスクも混ざっています</span>
    </div>
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
          <span class="rail-label">
            タスク候補(表向き{{ state.taskPool.length }}枚)
            <template v-if="canPlan"> — クリックして予定週を選びます</template>
            <template v-else> — 配置はスコープ会議か週末に行います</template>
          </span>
          <div v-if="state.step === 'scope_meeting'" class="redraw-controls">
            <button :disabled="redrawLeft <= 0" @click="toggleRedrawMode">
              {{ redrawMode ? '引き直しを終了' : `🔄 引き直し(残り${redrawLeft})` }}
            </button>
            <template v-if="redrawMode">
              <span class="muted">{{ redrawSelection.length }}/2 選択中</span>
              <button class="primary" :disabled="redrawSelection.length === 0" @click="confirmRedraw">
                確定
              </button>
            </template>
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
            @place="planTask"
          />
          <p v-if="state.taskPool.length === 0" class="muted">候補プールが空です。</p>
        </div>
      </div>
    </div>
  </div>
</template>
