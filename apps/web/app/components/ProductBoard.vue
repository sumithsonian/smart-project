<script setup lang="ts">
/**
 * プロダクトボード(rules-v4-core.md §2):9スロットのグリッド。
 * Lv0/1/2 を色分けし、手戻りキューブ・改修進行を表示する。
 * 朝会中はクリックで「改修・手戻り対応」の配属対象として選択できる。
 */
import { computed } from 'vue'

const { state, slotDef, skillLabels, selectedTarget, isSlotSelectable } = useGame()

const slots = computed(() => state.value.slots)

function clickable(slotId: string): boolean {
  return state.value.step === 'standup' && isSlotSelectable(slotId)
}
function select(slotId: string) {
  if (!clickable(slotId)) return
  const cur = selectedTarget.value
  selectedTarget.value = cur && cur.kind === 'slot' && cur.slotId === slotId ? null : { kind: 'slot', slotId }
}
</script>

<template>
  <section class="panel">
    <h2>プロダクトボード</h2>
    <div class="slot-grid">
      <div
        v-for="s in slots"
        :key="s.slotId"
        class="slot-card"
        :class="{
          lv1: s.level === 1,
          lv2: s.level === 2,
          selectable: clickable(s.slotId),
          selected: selectedTarget?.kind === 'slot' && selectedTarget.slotId === s.slotId,
        }"
        @click="select(s.slotId)"
      >
        <div class="slot-name">{{ slotDef(s.slotId)?.name ?? s.slotId }}</div>
        <div class="slot-level">Lv{{ s.level }} <span class="muted">({{ skillLabels[slotDef(s.slotId)!.skill].slice(0, 2) }})</span></div>
        <div class="slot-badges">
          <span v-if="s.reworkCubes > 0" class="badge warn">🔁手戻り {{ s.reworkCubes }}</span>
          <span v-if="s.level === 1 && s.upgradeCubes > 0" class="badge">
            🔧改修 {{ s.upgradeCubes }}/{{ state.config.upgradeCost }}
          </span>
        </div>
      </div>
    </div>
  </section>
</template>
