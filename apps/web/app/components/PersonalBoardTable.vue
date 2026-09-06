<script setup lang="ts">
/**
 * 個人ボード(メンバーカード。RULES.md §9-1)。
 * スキル3系統+疲労トラック。ホームスロットのミープルは
 *  - クリックで選択 → 盤面の光った場所をクリックで配置(RULES.md §10-1)
 *  - ドラッグ&ドロップでも配置できる
 * 未配属のままでは準備完了できず、全員が揃う前なら解除できる(RULES.md §10-4)。
 */
import type { PlayerState } from '@smart-project/engine'

const props = defineProps<{ player: PlayerState }>()
const {
  state,
  dispatch,
  dryRun,
  memberCard,
  playerColor,
  skillLabels,
  skillIcons,
  assignmentOf,
  targetLabel,
  selectedMeeple,
  selectMeeple,
} = useGame()

const member = computed(() => memberCard(props.player.memberId))
const isReady = computed(() => state.value.readyPlayerIds.includes(props.player.id))
const isPm = computed(() => state.value.pmPlayerId === props.player.id)
const color = computed(() => playerColor(props.player.id))

const canAssign = computed(
  () => state.value.step === 'standup' && !state.value.pendingEvent && !isReady.value,
)
const primary = computed(() => assignmentOf(props.player.id, false))
const overtime = computed(() => assignmentOf(props.player.id, true))

const canOvertime = computed(() => {
  if (!primary.value) return false
  if (props.player.fatigue >= state.value.config.noOvertimeAtFatigue) return false
  if (props.player.overtimeBanPhase === state.value.phase) return false
  return true
})
const overtimeBlockedReason = computed(() => {
  if (!primary.value) return '主担当を配属してから残業できます'
  if (props.player.overtimeBanPhase === state.value.phase) {
    return '体調不良のため今フェーズは残業できません'
  }
  if (props.player.fatigue >= state.value.config.noOvertimeAtFatigue) {
    return `疲労${props.player.fatigue}のため残業できません`
  }
  return ''
})

/** 他案件ヘルプによるキャパシティ減(RULES.md §7-3) */
const capacityDown = computed(
  () =>
    props.player.capacityDownUntilWeek >= state.value.week &&
    props.player.capacityDownUntilWeek > 0,
)

const abilityUsed = computed(() => props.player.abilityUsedPhase === state.value.phase)
function useExpedite() {
  dispatch({ type: 'USE_ABILITY', playerId: props.player.id })
}

/** 準備完了できない理由(未配属チェック。RULES.md §10-4) */
const readyBlock = computed(() => {
  const violation = dryRun({ type: 'DECLARE_READY', playerId: props.player.id })
  return violation ? violation.message : null
})
function declareReady() {
  dispatch({ type: 'DECLARE_READY', playerId: props.player.id })
}
function cancelReady() {
  dispatch({ type: 'CANCEL_READY', playerId: props.player.id })
}

const isSelected = (ot: boolean) =>
  selectedMeeple.value?.playerId === props.player.id && selectedMeeple.value?.overtime === ot

function pick(ot: boolean) {
  if (!canAssign.value) return
  if (ot && !canOvertime.value) return
  selectMeeple(props.player.id, ot)
}

const skillKinds = ['direction', 'design', 'engineering'] as const
</script>

<template>
  <div class="board personal-board" :class="{ ready: isReady }" :style="{ '--pc': color }">
    <div class="pb-header">
      <div class="pb-name">{{ player.name }}</div>
      <div class="pb-flavor">
        {{ member?.name }}<template v-if="member"> — {{ member.flavor }}</template>
      </div>
      <span v-if="isPm" class="pb-pmhat" title="PM 帽子">🎩</span>
      <span v-if="isReady" class="pb-ready-badge">Ready</span>
    </div>

    <div v-if="capacityDown" class="pb-capacity-down">
      🙋 他案件ヘルプ中:今週は積む人日 -{{ state.config.capacityDownCubes }}
    </div>

    <div class="pb-section-label">スキル(窪みの人日キューブ=1週に積める人日)</div>
    <div
      v-for="skill in skillKinds"
      :key="skill"
      class="skill-row"
      :title="`${skillLabels[skill]}:1週に${player.skills[skill]}人日`"
    >
      <span class="sk-icon">{{ skillIcons[skill] }}</span>
      <div class="recess-row">
        <span v-for="i in state.config.skillMax + 1" :key="i - 1" class="recess-cell">
          <span v-if="i - 1 === player.skills[skill]" class="token-cube wood" />
          <template v-else>{{ i - 1 }}</template>
        </span>
      </div>
      <span v-if="player.pendingLearn === skill" class="muted pb-pending">(来週+1)</span>
    </div>

    <div class="pb-section-label">
      疲労(0〜{{ state.config.fatigueMax }}・{{ state.config.noOvertimeAtFatigue }}で残業不可)
    </div>
    <div class="fatigue-row">
      <span
        v-for="i in state.config.fatigueMax + 1"
        :key="i - 1"
        class="recess-cell"
        :class="{ ban: i - 1 === state.config.noOvertimeAtFatigue }"
      >
        <span v-if="i - 1 === player.fatigue" class="token-cube black" />
        <template v-else>{{ i - 1 === state.config.fatigueMax ? '☠' : i - 1 }}</template>
      </span>
    </div>

    <div class="pb-section-label">個人能力(フェーズ1回・行動枠を使わない)</div>
    <div class="pb-ability">
      <template v-if="member?.ability === 'multitask'">
        <b>⚡ マルチタスク</b>(パッシブ):残業の追加疲労なし
      </template>
      <template v-else-if="member?.ability === 'expedite'">
        <b>⚡ 段取り</b>:今週自分の積む人日 +1
        <button :disabled="abilityUsed || state.step !== 'standup'" @click="useExpedite">
          {{ abilityUsed ? '使用済み' : '朝会で宣言する' }}
        </button>
      </template>
      <template v-else-if="member?.ability === 'polish'">
        <b>💎 磨き込み</b>:週末に納品済み Lv1 を Lv2 に(品質リスクも解消)。{{
          abilityUsed ? '(使用済み)' : 'プロダクトボードの💎から'
        }}
      </template>
      <template v-else-if="member?.ability === 'automate'">
        <b>🤖 自動化</b>:未納品タスク1つの必要人日 -1。{{
          abilityUsed ? '(使用済み)' : '盤上タスクの🤖から'
        }}
      </template>
    </div>

    <div class="pb-section-label">今週の自分(クリックで選んで盤面に置く)</div>
    <div class="pb-home">
      <div class="home-slot" :class="{ selected: isSelected(false) }" @click="pick(false)">
        <MeepleToken
          v-if="!primary"
          :player-id="player.id"
          :color="color"
          :draggable="canAssign"
          :overtime="false"
        />
        <span v-else class="home-assigned">{{ targetLabel(primary.target) }}</span>
        <span class="home-label">本業</span>
      </div>
      <div
        class="home-slot"
        :class="{ blocked: !canOvertime && !overtime, selected: isSelected(true) }"
        :title="overtimeBlockedReason"
        @click="pick(true)"
      >
        <MeepleToken
          v-if="!overtime"
          :player-id="player.id"
          :color="color"
          :draggable="canAssign && canOvertime"
          :overtime="true"
        />
        <span v-else class="home-assigned">{{ targetLabel(overtime.target) }}</span>
        <span class="home-label">残業</span>
      </div>
    </div>

    <button
      v-if="canAssign"
      class="primary pb-ready-btn"
      :disabled="!!readyBlock"
      :title="readyBlock ?? '今週の配属を確定する'"
      @click="declareReady"
    >
      準備完了
    </button>
    <div v-else-if="state.step === 'standup' && isReady" class="pb-ready-done">
      <span>準備完了ずみ</span>
      <button class="pb-cancel-ready" title="全員が揃う前なら解除できます" @click="cancelReady">
        解除する
      </button>
    </div>
  </div>
</template>
