<script setup lang="ts">
/**
 * サプライのタスク候補カード(draftPool。rules-v4-core.md §1-1)。
 * クリックで WBS レーンに配置(PLACE_TASK)。PM 交渉「引き直し」中はクリックで選択トグルになる。
 */
const props = defineProps<{ taskId: string; redrawMode?: boolean; selected?: boolean }>()
const emit = defineEmits<{ toggle: [taskId: string]; place: [taskId: string] }>()

const { taskCard, laneLabels, skillColors, skillShortLabels, state } = useGame()

const card = computed(() => taskCard(props.taskId))

function onClick() {
  if (props.redrawMode) {
    emit('toggle', props.taskId)
  } else {
    emit('place', props.taskId)
  }
}
</script>

<template>
  <div
    v-if="card"
    class="task-card market"
    :class="{ 'redraw-selected': selected }"
    :style="{ '--skill': skillColors[card.skill] }"
    :title="redrawMode ? '引き直す候補として選択' : 'クリックで WBS に配置'"
    @click="onClick"
  >
    <div class="tc-body">
      <div class="tc-corner-row">
        <span class="tc-chip">{{ laneLabels[card.lane] }}</span>
        <span class="tc-chip">💰{{ card.cost }}</span>
        <span class="tc-chip">😓{{ card.fatigue }}</span>
      </div>
      <div class="tc-name">{{ card.name }}</div>
      <div class="tc-row">
        <span class="tc-label">必要人日</span>
        <div class="cube-track">
          <span v-for="i in card.effort" :key="i" class="ccell">
            <span class="token-cube wood" style="opacity: .3" />
          </span>
        </div>
      </div>
      <div class="tc-row">
        <span class="skill-chip" :style="{ background: skillColors[card.skill] }">{{ skillShortLabels[card.skill] }}</span>
        <span class="tc-chip">上限Lv{{ card.maxLevel }}</span>
      </div>
    </div>
    <div class="tc-reward">
      <span class="tc-reward-slot">【{{ card.slot }}】</span>
      <div class="tc-reward-line">
        <span>納品 □×{{ card.effort }} →</span>
        <span class="cube-token mini silver" />
        <span>Lv1</span>
      </div>
      <div v-if="card.maxLevel === 2" class="tc-reward-line">
        <span>積増 □×{{ card.effort + state.config.qualityOvershoot }} →</span>
        <span class="cube-token mini gold" />
        <span>Lv2</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.skill-chip { display: inline-flex; align-items: center; color: #fff; font-size: 10px; font-weight: 700; border-radius: 4px; padding: 1px 6px; }
</style>
