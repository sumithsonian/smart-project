<script setup lang="ts">
/**
 * プロダクトボードの1スロット(rules-v4-core.md §2)。
 * Lv1 のスロットは「改修」の配属先(ドロップゾーン)になる。手戻り中は🔁ディスクを表示。
 */
const props = defineProps<{ slotId: string }>()

const { state, slotDef, slotState, isSlotSelectable, slotHasRework, assignmentsForTarget, playerColor, playerName } =
  useGame()
const { hoverZoneKey } = useTableDrag()

const def = computed(() => slotDef(props.slotId))
const slot = computed(() => slotState(props.slotId))
const zoneKey = 'slot:' + props.slotId
const active = computed(
  () => state.value.step === 'standup' && !state.value.pendingEvent && isSlotSelectable(props.slotId),
)
const glow = computed(() => hoverZoneKey.value === zoneKey)
const rework = computed(() => slotHasRework(props.slotId))
const assignees = computed(() => assignmentsForTarget({ kind: 'slot', slotId: props.slotId }))
</script>

<template>
  <div
    v-if="slot && def"
    class="p-slot"
    :class="{ 'dz-active': active, 'dz-glow': glow }"
    :data-dropzone-key="active ? zoneKey : undefined"
  >
    <div class="p-slot-name">{{ def.name }}</div>
    <div class="p-slot-cube-row">
      <div class="recess-cell p-slot-recess">
        <span v-if="slot.level > 0" class="cube-token slot-cube" :class="slot.level === 2 ? 'gold' : 'silver'" />
      </div>
      <span v-if="rework" class="p-slot-rework-disc">🔁</span>
    </div>
    <div v-if="slot.level > 0" class="p-tile-lv">{{ slot.level === 2 ? '★★ Lv2' : 'Lv1' }}</div>
    <div v-else class="p-empty-mark">(未納品)</div>
    <div v-if="slot.level === 1 && slot.upgradeCubes > 0" class="p-slot-upgrade">
      🔧改修 {{ slot.upgradeCubes }}/{{ state.config.upgradeCost }}
    </div>
    <div class="p-slot-meeples">
      <MeepleToken
        v-for="a in assignees"
        :key="a.playerId"
        :player-id="a.playerId"
        :color="playerColor(a.playerId)"
        size="small"
        :draggable="active && !state.readyPlayerIds.includes(a.playerId)"
        :title="playerName(a.playerId)"
      />
    </div>
    <AbilityPicker v-if="state.step === 'weekend' && slot.level === 1 && !rework" ability="polish" :slot-id="props.slotId" />
  </div>
</template>
