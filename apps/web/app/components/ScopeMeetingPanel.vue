<script setup lang="ts">
/**
 * スコープ会議(rules-v4-core.md §1-1):タスク候補プール + WBS配置 + PM交渉(引き直し)。
 * 検収条件の約束は AcceptanceBoard(常時表示)側のクリックで行う。
 * 「会議を締める」(FINISH_SCOPE)操作は進行バー(TurnDirector)に一本化されている。
 */
import { computed, ref } from 'vue'

const { state, dispatch, taskCard, laneLabels, skillColors, skillShortLabels } = useGame()

const pool = computed(() => state.value.taskPool.map((id) => taskCard(id)).filter((c): c is NonNullable<typeof c> => !!c))

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
  if (redrawMode.value) {
    toggleCard(cardId)
    return
  }
  dispatch({ type: 'PLACE_TASK', playerId: state.value.pmPlayerId, cardId })
}
</script>

<template>
  <section class="panel">
    <h2>スコープ会議 <span class="muted">検収条件の約束 → タスクをWBSに配置(締めは進行バーから)</span></h2>

    <div class="row">
      <button :disabled="negotiateDone" @click="toggleRedrawMode">
        {{ redrawMode ? '引き直しモードを終了' : '🔄 PM交渉:候補の引き直し' }}
      </button>
      <template v-if="redrawMode">
        <span class="muted">引き直す候補を1〜2枚クリックで選択({{ redrawSelection.length }}/2)</span>
        <button class="primary" :disabled="redrawSelection.length === 0" @click="confirmRedraw">
          確定して引き直す
        </button>
      </template>
      <span v-if="negotiateDone" class="muted">(交渉はこのフェーズ使用済み)</span>
    </div>

    <h3>タスク候補プール({{ pool.length }})</h3>
    <div class="players-grid">
      <div
        v-for="c in pool"
        :key="c.id"
        class="tile"
        :class="{ selected: redrawSelection.includes(c.id) }"
        @click="placeTask(c.id)"
      >
        <div class="tile-head"><strong>{{ c.name }}</strong></div>
        <div class="tile-cost-row">
          <span class="skill-chip" :style="{ background: skillColors[c.skill] }">{{ skillShortLabels[c.skill] }}</span>
          <span class="pip-row" title="必要人日">
            <span
              v-for="i in c.effort"
              :key="i"
              class="pip filled"
              :style="{ background: skillColors[c.skill], borderColor: skillColors[c.skill] }"
            />
          </span>
          <span class="muted">必要{{ c.effort }}人日</span>
        </div>
        <div class="tile-meta">
          <span class="badge">{{ laneLabels[c.lane] }}列</span>
          <span class="badge">上限Lv{{ c.maxLevel }}</span>
          <span class="badge">😓{{ c.fatigue }}</span>
          <span class="badge">💰{{ c.cost }}</span>
        </div>
      </div>
      <p v-if="pool.length === 0" class="muted">候補プールが空です。</p>
    </div>
    <p class="muted">カードをクリックで WBS レーンに配置(下の「WBSボード」に表示されます)。</p>
  </section>
</template>
