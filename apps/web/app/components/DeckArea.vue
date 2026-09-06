<script setup lang="ts">
/** イベント/炎上の山札+捨て札(装飾+残数表示)。 */
const { state } = useGame()

const lastLogMessage = computed(() => {
  const last = state.value.log[state.value.log.length - 1]
  return last ? last.message : 'まだ何も起きていません'
})
</script>

<template>
  <div class="board">
    <div class="board-title">山札</div>
    <div class="deck-area">
      <div class="deck-stack">
        <div class="deck-card back" style="transform: rotate(-4deg); top: 6px; left: 2px" />
        <div class="deck-card back" style="transform: rotate(2deg); top: 3px; left: 0" />
        <div class="deck-card back" style="transform: rotate(-1deg)" />
        <div class="deck-label">イベント山札({{ state.decks.events.drawPile.length }}){{ '\n' }}週末に1枚</div>
      </div>
      <div class="deck-stack">
        <div class="deck-card back fire-back" style="transform: rotate(3deg); top: 5px; left: 3px" />
        <div class="deck-card back fire-back" style="transform: rotate(-2deg); top: 2px" />
        <div class="deck-card back fire-back" />
        <div class="deck-label">炎上山札({{ state.decks.fires.drawPile.length }}){{ '\n' }}週初に1枚</div>
      </div>
      <div class="discard">直近のログ<br />「{{ lastLogMessage }}」</div>
    </div>
  </div>
</template>
