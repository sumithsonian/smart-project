<script setup lang="ts">
/** 検収条件カード列 + 検収条件山札(rules-v4-core.md §1-1)。 */
const { state } = useGame()
</script>

<template>
  <div class="board acceptance-board">
    <div class="board-title">検収条件</div>
    <div class="acceptance-row-wrap">
      <AcceptanceCardTable v-for="id in state.openAcceptanceIds" :key="id" :id="id" />
      <p v-if="state.openAcceptanceIds.length === 0" class="muted">まだ検収条件が公開されていません。</p>
      <div class="acceptance-deck">
        <div class="deck-stack">
          <div class="deck-card back" style="transform: rotate(-3deg); top: 4px; left: 2px" />
          <div class="deck-card back" style="transform: rotate(2deg)" />
        </div>
        <div class="acceptance-deck-label">検収条件 山札{{ '\n' }}フェーズ開始時に{{ state.config.acceptancePerPhase }}枚公開</div>
      </div>
    </div>
  </div>
</template>
