<script setup lang="ts">
/**
 * プロダクトボードの1スロット(RULES.md §2-3・§2-4)。
 * Lv1 は「品質リスクあり(⚠)」として表示する。Lv1 のスロットは改修の配属先になる。
 * 手戻り中は🔁を出す(その間そのスロットは要件の判定上「未達」)。
 */
const props = defineProps<{ slotId: string }>()

const {
  state,
  slotDef,
  slotState,
  isSlotSelectable,
  slotHasRework,
  assignmentsForTarget,
  playerColor,
  playerName,
  selectedMeeple,
  canPlaceAt,
  placeSelectedAt,
  previewForSelected,
} = useGame()
const { hoverZoneKey } = useTableDrag()

const def = computed(() => slotDef(props.slotId))
const slot = computed(() => slotState(props.slotId))
const zoneKey = 'slot:' + props.slotId
const target = computed(() => ({ kind: 'slot' as const, slotId: props.slotId }))
const active = computed(
  () =>
    state.value.step === 'standup' &&
    !state.value.pendingEvent &&
    isSlotSelectable(props.slotId),
)
const glow = computed(() => hoverZoneKey.value === zoneKey)
const rework = computed(() => slotHasRework(props.slotId))
const assignees = computed(() => assignmentsForTarget(target.value))
const placeable = computed(() => canPlaceAt(target.value))
</script>

<template>
  <div
    v-if="slot && def"
    class="p-slot"
    :class="{
      'dz-active': active,
      'dz-glow': glow,
      'dz-clickable': !!selectedMeeple && placeable.ok,
      risky: slot.qualityRisk,
    }"
    :data-dropzone-key="active ? zoneKey : undefined"
    @click="selectedMeeple && placeSelectedAt(target)"
  >
    <div class="p-slot-name">{{ def.name }}</div>
    <div class="p-slot-cube-row">
      <div class="recess-cell p-slot-recess">
        <span
          v-if="slot.level > 0"
          class="cube-token slot-cube"
          :class="slot.level === 2 ? 'gold' : 'silver'"
        />
      </div>
      <span v-if="rework" class="p-slot-rework-disc" title="手戻り中(解消するまで要件は未達扱い)"
        >🔁</span
      >
    </div>
    <div v-if="slot.level > 0" class="p-tile-lv">{{ slot.level === 2 ? '★★ Lv2' : 'Lv1' }}</div>
    <div v-else class="p-empty-mark">(未納品)</div>

    <div
      v-if="slot.qualityRisk"
      class="p-quality-risk"
      title="品質リスク:手戻り・バグの対象になりやすく、対応工数も増えます。Lv2 にすると消えます"
    >
      ⚠ 品質リスク
    </div>

    <div v-if="slot.level === 1 && slot.upgradeCubes > 0" class="p-slot-upgrade">
      🔧 改修 {{ slot.upgradeCubes }}/{{ state.config.upgradeCost }}
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

    <PreviewChip
      v-if="selectedMeeple && placeable.ok"
      :preview="previewForSelected(target)!"
    />

    <AbilityPicker
      v-if="state.step === 'weekend' && slot.level === 1 && !rework"
      ability="polish"
      :slot-id="props.slotId"
    />
  </div>
</template>
