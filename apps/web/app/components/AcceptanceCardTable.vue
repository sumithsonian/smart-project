<script setup lang="ts">
/**
 * 検収条件カード(rules-v4-core.md §1-1・§1-3)。
 * スコープ会議中、未約束カードをクリックで COMMIT_ACCEPTANCE。
 * 約束済みカードは🤝スタンプをクリックで PM 交渉(猶予/取り下げ)を開ける。
 */
const props = defineProps<{ id: string }>()

const { state, dispatch, acceptanceCard, slotDef, commitmentOf } = useGame()

const card = computed(() => acceptanceCard(props.id))
const met = computed(() => state.value.metAcceptanceIds.includes(props.id))
const commitment = computed(() => commitmentOf(props.id))
const grace = computed(() => !!commitment.value && commitment.value.graceUntilPhase >= state.value.phase)
const negotiateDone = computed(() => state.value.negotiationUsedPhase === state.value.phase)

const committable = computed(() => state.value.step === 'scope_meeting' && !met.value && !commitment.value)

const menuOpen = ref(false)

function commit() {
  if (!committable.value) return
  dispatch({ type: 'COMMIT_ACCEPTANCE', playerId: state.value.pmPlayerId, acceptanceId: props.id })
}
function toggleMenu() {
  if (!commitment.value || negotiateDone.value || !!state.value.pendingEvent) return
  menuOpen.value = !menuOpen.value
}
function negotiate(mode: 'grace' | 'withdraw') {
  dispatch({ type: 'NEGOTIATE', playerId: state.value.pmPlayerId, mode, acceptanceId: props.id })
  menuOpen.value = false
}
</script>

<template>
  <div v-if="card" class="acc-card" :class="{ 'acc-committable': committable, 'acc-met': met }" @click="commit">
    <div class="ac-type">検収条件</div>
    <div class="acc-cond-row">
      <span>達成条件:【{{ slotDef(card.slot)?.name ?? card.slot }}】を</span>
      <span class="cube-token mini" :class="card.level === 2 ? 'gold' : 'silver'" />
      <span>Lv{{ card.level }} で納品</span>
    </div>
    <div class="acc-quote">「{{ card.name }}」</div>
    <span v-if="grace" class="acc-grace-badge">🙏 猶予中</span>
    <div class="acc-penalty">約束未達:フェーズ末ごとCS-{{ state.config.commitPenaltyCs }} ／ 最終未達:CS-{{ state.config.finalMissCs }}(Lv1妥協CS-{{ state.config.finalCompromiseCs }})</div>

    <div v-if="met" class="acc-stamp done">✅</div>
    <div v-else-if="commitment" class="acc-stamp promise" @click.stop="toggleMenu">🤝</div>

    <div v-if="menuOpen" class="acc-negotiate" @click.stop>
      <button @click="negotiate('grace')">猶予(1フェーズ)</button>
      <button @click="negotiate('withdraw')">取り下げ(CS-1)</button>
    </div>
  </div>
</template>
