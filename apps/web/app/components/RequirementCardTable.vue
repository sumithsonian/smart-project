<script setup lang="ts">
/**
 * 要件カード(RULES.md §3)。
 * 対象成果物・要求品質・期限・区分を1枚で読み切れるようにする。
 * PM は「交渉」ボタンから Must → Better / 見送り / 期限延長などを行う(コストと回数は §3-5)。
 */
const props = defineProps<{ requirementId: string }>()

const { state, dispatch, dryRun, requirementCard, requirementState, slotName, tierLabels } =
  useGame()

const card = computed(() => requirementCard(props.requirementId))
const req = computed(() => requirementState(props.requirementId))

const menuOpen = ref(false)

/** 期限までの残りフェーズ(0 = 今フェーズが期限) */
const phasesLeft = computed(() =>
  req.value ? req.value.deadlinePhase - state.value.phase : 0,
)
const deadlineClass = computed(() => {
  if (!req.value || req.value.settled) return ''
  if (phasesLeft.value <= 0) return 'urgent'
  if (phasesLeft.value === 1) return 'soon'
  return ''
})

const outcomeLabel = computed(() => {
  const r = req.value
  if (!r) return null
  if (r.met && !r.settled) return { text: '✅ 達成', cls: 'done' }
  if (!r.settled) return null
  switch (r.settledOutcome) {
    case 'met':
      return { text: '✅ 達成(清算済み)', cls: 'done' }
    case 'failed':
      return { text: '❌ 未達で確定', cls: 'failed' }
    case 'expired':
      return { text: '〰 見送りに終わった', cls: 'expired' }
    default:
      return null
  }
})

type Mode = 'demote' | 'drop' | 'extend' | 'promote' | 'restore'

/** 交渉メニューの選択肢(実行できないものは理由つきで無効表示) */
const options = computed<Array<{ mode: Mode; label: string; reason: string | null }>>(() => {
  const r = req.value
  if (!r) return []
  const config = state.value.config
  const all: Array<{ mode: Mode; label: string }> = [
    { mode: 'demote', label: `Better にする(CS-${config.demoteMustCs})` },
    { mode: 'drop', label: `見送りにする(Must なら CS-${config.dropMustCs})` },
    { mode: 'extend', label: `期限を1フェーズ延ばす(予算-${config.extendDeadlineBudget})` },
    { mode: 'promote', label: 'Must に引き上げる(無料)' },
    { mode: 'restore', label: 'スコープに戻す(無料)' },
  ]
  return all.map((o) => {
    const violation = dryRun({
      type: 'CHANGE_SCOPE',
      playerId: state.value.pmPlayerId,
      requirementId: props.requirementId,
      mode: o.mode,
    })
    return { ...o, reason: violation ? violation.message : null }
  })
})

const canNegotiate = computed(() => options.value.some((o) => o.reason === null))

function toggleMenu() {
  if (!canNegotiate.value) return
  menuOpen.value = !menuOpen.value
}
function change(mode: Mode) {
  if (
    dispatch({
      type: 'CHANGE_SCOPE',
      playerId: state.value.pmPlayerId,
      requirementId: props.requirementId,
      mode,
    })
  ) {
    menuOpen.value = false
  }
}
</script>

<template>
  <div
    v-if="card && req"
    class="req-card"
    :class="[req.tier, { met: req.met, settled: req.settled }]"
  >
    <div class="req-head">
      <span class="tier-badge" :class="req.tier">{{ tierLabels[req.tier] }}</span>
      <span class="req-deadline" :class="deadlineClass">
        期限:フェーズ{{ req.deadlinePhase }}
        <template v-if="!req.settled && phasesLeft <= 0">(今フェーズ)</template>
      </span>
      <span v-if="req.addedByEvent" class="req-added" title="イベントで追加された要望">➕追加</span>
    </div>

    <div class="req-quote">「{{ card.name }}」</div>

    <div class="req-cond">
      <span class="req-cond-label">達成条件</span>
      <span class="req-slot">{{ slotName(card.slot) }}</span>
      <span class="cube-token mini" :class="card.level === 2 ? 'gold' : 'silver'" />
      <span>Lv{{ card.level }} で納品</span>
    </div>

    <div class="req-effect">
      <template v-if="req.tier === 'must'">
        期限までに未達 → <b class="minus">CS-{{ state.config.mustMissCs }}</b> ／
        全 Must 達成で <b class="plus">CS+{{ state.config.allMustBonusCs }}</b>
      </template>
      <template v-else-if="req.tier === 'better'">
        達成 → <b class="plus">CS+{{ state.config.betterMeetCs }}</b> ／ 未達の罰はありません
      </template>
      <template v-else>
        今回はやらない。最終検収では
        <b class="minus">CS-{{ state.config.finalMissCs }}</b> の評価対象です
      </template>
    </div>

    <div v-if="req.csOnFulfill > 0" class="req-bonus">
      🎁 引き受けた追加対応:達成で CS+{{ req.csOnFulfill }}
    </div>

    <div v-if="outcomeLabel" class="req-outcome" :class="outcomeLabel.cls">
      {{ outcomeLabel.text }}
    </div>

    <div class="req-actions">
      <button
        class="req-negotiate-btn"
        :disabled="!canNegotiate"
        :title="canNegotiate ? 'PM のスコープ交渉' : '交渉できません(清算済み・達成済み・回数上限)'"
        @click="toggleMenu"
      >
        👑 交渉
      </button>
    </div>

    <div v-if="menuOpen" class="req-menu" @click.stop>
      <button
        v-for="o in options"
        :key="o.mode"
        :disabled="!!o.reason"
        :title="o.reason ?? ''"
        @click="change(o.mode)"
      >
        {{ o.label }}
      </button>
      <button class="req-menu-close" @click="menuOpen = false">閉じる</button>
    </div>
  </div>
</template>
