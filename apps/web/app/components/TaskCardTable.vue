<script setup lang="ts">
/**
 * 卓上のタスクカード(盤上に配置済み。rules-v4-core.md §0)。
 * モックのカード文法(左上に系統色+疲労・コスト、必要人日キューブ枠列、🔥トークン、
 * 下部の段階報酬帯2行)を再現し、担当行はドラッグ&ドロップの配属先(ASSIGN_WORKER)、
 * 🔥アイコンは消火(extinguish)の配属先にする。差し込みカードは PM 謝絶(DECLINE_INTERRUPT)を持つ。
 */
const props = defineProps<{ cardId: string }>()

const {
  state,
  dispatch,
  taskCard,
  displayTaskName,
  requiredCubesOf,
  deliveryPreview,
  boardTask,
  playerColor,
  playerName,
  skillColors,
  skillShortLabels,
  laneLabels,
  assignmentsForTarget,
} = useGame()
const { hoverZoneKey } = useTableDrag()

const task = computed(() => boardTask(props.cardId))
const isInterrupt = computed(() => !!task.value?.interrupt)
const card = computed(() => (task.value && !task.value.interrupt ? taskCard(task.value.cardId) : undefined))
const skillColor = computed(() => (card.value ? skillColors[card.value.skill] : '#64748b'))
const needed = computed(() => (task.value ? requiredCubesOf(task.value) : 0))
const overshootCells = computed(() => Math.max(0, (task.value?.cubes ?? 0) - needed.value))

const assignZoneKey = 'task:' + props.cardId
const extinguishZoneKey = 'extinguish:' + props.cardId
const canAssignNow = computed(() => state.value.step === 'standup' && !state.value.pendingEvent)
const assignGlow = computed(() => hoverZoneKey.value === assignZoneKey)
const extinguishGlow = computed(() => hoverZoneKey.value === extinguishZoneKey)
const assignees = computed(() => (task.value ? assignmentsForTarget({ kind: 'task', cardId: task.value.cardId }) : []))

const isReadyGlow = computed(() => state.value.step === 'weekend' && !!task.value && task.value.cubes >= needed.value)

function canDeliver(): boolean {
  if (state.value.step !== 'weekend' || !task.value) return false
  if (task.value.cubes < needed.value) return false
  if (!task.value.interrupt) {
    const c = taskCard(task.value.cardId)
    if (!c) return false
    if (state.value.budget < c.cost) return false
  }
  return true
}
function deliver() {
  dispatch({ type: 'DELIVER_TASK', cardId: props.cardId })
}
function declineInterrupt() {
  if (!confirm(`「${displayTaskName(task.value!)}」を謝絶しますか?(即時 CS-${state.value.config.declineCs})`)) return
  dispatch({ type: 'DECLINE_INTERRUPT', playerId: state.value.pmPlayerId, cardId: props.cardId })
}
</script>

<template>
  <div
    v-if="task"
    class="task-card"
    :class="{ 'card-interrupt': isInterrupt, ready: isReadyGlow }"
    :style="{ '--skill': skillColor }"
  >
    <div v-if="task.fire > 0" class="tc-fire-corner">
      <span
        v-for="i in task.fire"
        :key="i"
        class="fire-disc"
        :class="{ 'tc-extinguish-zone': i === 1 }"
        :data-dropzone-key="i === 1 && canAssignNow ? extinguishZoneKey : undefined"
        :title="i === 1 ? '🧯 ここにミープルをドロップして消火' : ''"
      >🔥</span>
    </div>

    <div class="tc-body">
      <div class="tc-corner-row">
        <span class="tc-chip">{{ isInterrupt ? '差込' : laneLabels[card!.lane] }}</span>
        <template v-if="!isInterrupt && card">
          <span class="tc-chip">💰{{ card.cost }}</span>
          <span class="tc-chip">😓{{ card.fatigue }}</span>
        </template>
      </div>

      <div class="tc-name">
        {{ displayTaskName(task) }}
      </div>

      <div class="tc-row">
        <span class="tc-label">{{ isInterrupt ? '解消人日' : '必要人日' }}</span>
        <div class="cube-track">
          <span
            v-for="i in needed"
            :key="'n' + i"
            class="ccell"
            :class="{ burning: task.fire > 0 && i > needed - task.fire && i > task.cubes }"
          >
            <span v-if="i <= task.cubes" class="token-cube wood" />
          </span>
          <span v-for="i in overshootCells" :key="'o' + i" class="ccell" style="border-color: var(--gold)">
            <span class="token-cube wood" />
          </span>
        </div>
      </div>

      <div
        class="tc-row tc-assign"
        :class="{ 'dz-active': canAssignNow, 'dz-glow': assignGlow }"
        :data-dropzone-key="canAssignNow ? assignZoneKey : undefined"
      >
        <span class="tc-label">担当{{ '\n' }}(👣)</span>
        <div class="footprint-row">
          <MeepleToken
            v-for="a in assignees"
            :key="a.playerId + String(a.overtime)"
            :player-id="a.playerId"
            :overtime="a.overtime"
            :color="playerColor(a.playerId)"
            :draggable="canAssignNow && !state.readyPlayerIds.includes(a.playerId)"
            :title="playerName(a.playerId)"
          />
          <span v-if="assignees.length === 0" class="footprint"><span class="fp-mark">👣</span></span>
        </div>
      </div>

      <AbilityPicker v-if="!isInterrupt && (state.step === 'standup' || state.step === 'weekend')" ability="automate" :card-id="task.cardId" />
    </div>

    <div class="tc-reward">
      <template v-if="isInterrupt">
        <span class="tc-reward-slot">{{ displayTaskName(task) }}の解消</span>
        <div class="tc-reward-line"><span>解消 → 🔁 消える</span></div>
      </template>
      <template v-else-if="card">
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
      </template>
    </div>

    <div v-if="state.step === 'weekend'" class="tc-deliver-row">
      <span v-if="deliveryPreview(task)" class="lv-badge" :class="`lv${deliveryPreview(task)}`">予告Lv{{ deliveryPreview(task) }}</span>
      <button class="deliver-btn" :disabled="!canDeliver()" @click="deliver">📦 納品</button>
    </div>

    <div v-if="isInterrupt" class="tc-decline-row">
      <button class="decline-btn" :disabled="!!state.pendingEvent" @click="declineInterrupt">
        🙇 PM謝絶(CS-{{ state.config.declineCs }})
      </button>
    </div>
  </div>
</template>
