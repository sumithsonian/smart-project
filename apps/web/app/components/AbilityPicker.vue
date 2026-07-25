<script setup lang="ts">
/**
 * 個人能力(polish/automate)の対象選択UI(rules-v4-core.md §3)。
 * 対象(納品済みLv1スロット / 盤上タスク)に直接乗せる形の小さなアイコンボタン。
 * 「段取り」(expedite・対象なし)と「マルチタスク」(パッシブ)は PersonalBoardTable 側で扱う。
 */
const props = defineProps<{
  ability: 'polish' | 'automate'
  slotId?: string
  cardId?: string
}>()

const { state, dispatch, memberCard, playerColor } = useGame()

const eligible = computed(() =>
  state.value.players.filter((p) => {
    const m = memberCard(p.memberId)
    return m?.ability === props.ability && p.abilityUsedPhase !== state.value.phase
  }),
)

function use(playerId: string) {
  dispatch({
    type: 'USE_ABILITY',
    playerId,
    ...(props.slotId ? { slotId: props.slotId } : {}),
    ...(props.cardId ? { cardId: props.cardId } : {}),
  })
}
</script>

<template>
  <div
    v-if="eligible.length"
    class="ability-picker"
    :title="ability === 'polish' ? '💎磨き込み:このスロットをLv1→Lv2に(週末・フェーズ1回)' : '🤖自動化:このタスクの必要人日-1(フェーズ1回)'"
  >
    <button
      v-for="p in eligible"
      :key="p.id"
      class="ability-dot"
      :style="{ background: playerColor(p.id) }"
      @click.stop="use(p.id)"
    >
      {{ ability === 'polish' ? '💎' : '🤖' }}
    </button>
  </div>
</template>
