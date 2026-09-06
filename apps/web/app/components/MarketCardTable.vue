<script setup lang="ts">
/**
 * サプライのタスク候補カード(draftPool。RULES.md §5-1)。
 * 「短いが高リスク / 長いが低リスク」の対比が読めるように、見積工数とリスクを並べて出す。
 * クリックで配置先の週を選ぶ(PLAN_TASK)。引き直しモード中はクリックで選択トグルになる。
 */
const props = defineProps<{ taskId: string; redrawMode?: boolean; selected?: boolean }>()
const emit = defineEmits<{ toggle: [taskId: string]; place: [taskId: string, week: number | null] }>()

const { state, taskCard, slotName, skillColors, skillIcons, skillLabels, riskLabels, riskColors } =
  useGame()

const card = computed(() => taskCard(props.taskId))
const weeks = computed(() =>
  Array.from({ length: state.value.config.roundsPerPhase }, (_, i) => i + 1),
)
const menuOpen = ref(false)

function onClick() {
  if (props.redrawMode) {
    emit('toggle', props.taskId)
    return
  }
  menuOpen.value = !menuOpen.value
}
function place(week: number | null) {
  emit('place', props.taskId, week)
  menuOpen.value = false
}
</script>

<template>
  <div
    v-if="card"
    class="task-card market"
    :class="{ 'redraw-selected': selected }"
    :style="{ '--skill': skillColors[card.skill] }"
    :title="redrawMode ? '引き直す候補として選択' : 'クリックして計画ボードの週を選ぶ'"
    @click="onClick"
  >
    <div class="tc-body">
      <div class="tc-corner-row">
        <span class="tc-chip skill" :style="{ background: skillColors[card.skill] }">
          {{ skillIcons[card.skill] }} {{ skillLabels[card.skill] }}
        </span>
        <span class="tc-chip" title="納品時の実行コスト(予算)">💰{{ card.cost }}</span>
        <span class="tc-chip" title="座った週の疲労">😓{{ card.fatigue }}</span>
      </div>

      <div class="tc-name">{{ card.name }}</div>

      <div class="tc-effort-row">
        <span class="tc-label">見積</span>
        <span class="tc-effort-value">{{ card.estimate }}</span>
        <span class="tc-risk" :style="{ color: riskColors[card.risk] }">{{
          riskLabels[card.risk]
        }}</span>
      </div>

      <div v-if="card.prerequisiteSlots.length > 0" class="tc-prereq">
        前提:{{ card.prerequisiteSlots.map(slotName).join('・') }}
      </div>
      <div v-else class="tc-prereq none">前提なし(すぐ着手できます)</div>

      <div class="tc-row">
        <span class="tc-chip">上限 Lv{{ card.maxLevel }}</span>
      </div>
    </div>

    <div class="tc-reward">
      <span class="tc-reward-slot">{{ slotName(card.slot) }}</span>
      <div class="tc-reward-line">
        <span>納品 □×{{ card.estimate }} →</span>
        <span class="cube-token mini silver" />
        <span>Lv1</span>
      </div>
      <div v-if="card.maxLevel === 2" class="tc-reward-line">
        <span>積増 □×{{ card.estimate + state.config.qualityOvershoot }} →</span>
        <span class="cube-token mini gold" />
        <span>Lv2</span>
      </div>
    </div>

    <div v-if="menuOpen && !redrawMode" class="market-place-menu" @click.stop>
      <span class="market-place-label">どの週にやる?</span>
      <button v-for="w in weeks" :key="w" @click="place(w)">第{{ w }}週</button>
      <button @click="place(null)">Backlog</button>
      <button class="market-place-close" @click="menuOpen = false">閉じる</button>
    </div>
  </div>
</template>
