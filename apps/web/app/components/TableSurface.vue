<script setup lang="ts">
/** 卓面本体(印刷ボード一式)。パン&ズームの対象になる大きなキャンバス。 */
const { state } = useGame()
</script>

<template>
  <div class="table-surface">
    <div class="area-scope"><RequirementBoard /></div>
    <div class="area-main"><MainBoardTable /></div>
    <div class="area-side">
      <ProductBoardTable />
      <DeckArea />
    </div>
    <div class="area-supply"><SupplyBoardTable /></div>
    <div class="area-players">
      <PersonalBoardTable v-for="p in state.players" :key="p.id" :player="p" />
    </div>
  </div>
</template>
