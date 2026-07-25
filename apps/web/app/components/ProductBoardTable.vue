<script setup lang="ts">
/** プロダクトボード(rules-v4-core.md §2):9スロット印刷+彫り込みソケット。 */
const { state } = useGame()
</script>

<template>
  <div class="board product-board">
    <div class="board-title">プロダクトボード</div>
    <div class="product-grid">
      <ProductSlotTable v-for="s in state.slots" :key="s.slotId" :slot-id="s.slotId" />
    </div>
  </div>
</template>
