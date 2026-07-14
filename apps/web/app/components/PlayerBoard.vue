<script setup lang="ts">
/**
 * 個人ボード(rules-v4-core.md §0・§3):スキル3系統・疲労ゲージ・メンバーカード・PM帽子・
 * 朝会の配属UI(座る/改修・手戻り/学習/休憩/消火 + 残業枠)・個人能力ボタン・準備完了。
 */
import { computed, ref } from 'vue'
import type { PlayerState, SkillKind, WorkerTarget } from '@smart-project/engine'

const props = defineProps<{ player: PlayerState }>()
const {
  state,
  dispatch,
  selectedTarget,
  memberCard,
  playerColor,
  skillLabels,
  assignmentOf,
  targetLabel,
  boardTask,
  slotState,
} = useGame()

const member = computed(() => memberCard(props.player.memberId))
const isReady = computed(() => state.value.readyPlayerIds.includes(props.player.id))
const isPm = computed(() => state.value.pmPlayerId === props.player.id)
const canAssign = computed(
  () => state.value.step === 'standup' && !state.value.pendingEvent && !isReady.value,
)

const learnSkill = ref<SkillKind>('direction')

const primary = computed(() => assignmentOf(props.player.id, false))
const overtime = computed(() => assignmentOf(props.player.id, true))

const selectedTaskFire = computed(() => {
  if (selectedTarget.value?.kind !== 'task') return 0
  return boardTask(selectedTarget.value.cardId)?.fire ?? 0
})
const selectedIsTask = computed(() => selectedTarget.value?.kind === 'task')
const selectedIsSlot = computed(() => selectedTarget.value?.kind === 'slot')
const canOvertime = computed(() => {
  if (!primary.value) return false
  if (props.player.fatigue >= state.value.config.noOvertimeAtFatigue) return false
  if (props.player.overtimeBanPhase === state.value.phase) return false
  return true
})
const overtimeBlockedReason = computed(() => {
  if (!primary.value) return '主担当を決めてから配属できます'
  if (props.player.overtimeBanPhase === state.value.phase) return '体調不良のため今フェーズは残業できません'
  if (props.player.fatigue >= state.value.config.noOvertimeAtFatigue) return `疲労${props.player.fatigue}のため残業できません`
  return ''
})

function assignSelectedTask(overtimeFlag: boolean) {
  if (selectedTarget.value?.kind !== 'task') return
  dispatch({
    type: 'ASSIGN_WORKER',
    playerId: props.player.id,
    target: { kind: 'task', cardId: selectedTarget.value.cardId },
    overtime: overtimeFlag,
  })
}
function assignSelectedSlot() {
  if (selectedTarget.value?.kind !== 'slot') return
  dispatch({
    type: 'ASSIGN_WORKER',
    playerId: props.player.id,
    target: { kind: 'slot', slotId: selectedTarget.value.slotId },
  })
}
function assignExtinguish(overtimeFlag: boolean) {
  if (selectedTarget.value?.kind !== 'task') return
  dispatch({
    type: 'ASSIGN_WORKER',
    playerId: props.player.id,
    target: { kind: 'extinguish', cardId: selectedTarget.value.cardId },
    overtime: overtimeFlag,
  })
}
function assignRest() {
  dispatch({ type: 'ASSIGN_WORKER', playerId: props.player.id, target: { kind: 'rest' } })
}
function assignLearn() {
  const target: WorkerTarget = { kind: 'learn', skill: learnSkill.value }
  dispatch({ type: 'ASSIGN_WORKER', playerId: props.player.id, target })
}
function unassign(overtimeFlag: boolean) {
  dispatch({ type: 'UNASSIGN_WORKER', playerId: props.player.id, overtime: overtimeFlag })
}
function declareReady() {
  dispatch({ type: 'DECLARE_READY', playerId: props.player.id })
}

// ── 個人能力(フェーズ1回・行動枠を使わない) ──
const abilityUsed = computed(() => props.player.abilityUsedPhase === state.value.phase)
function useExpedite() {
  dispatch({ type: 'USE_ABILITY', playerId: props.player.id })
}
function usePolish() {
  if (selectedTarget.value?.kind !== 'slot') return
  dispatch({ type: 'USE_ABILITY', playerId: props.player.id, slotId: selectedTarget.value.slotId })
}
function useAutomate() {
  if (selectedTarget.value?.kind !== 'task') return
  dispatch({ type: 'USE_ABILITY', playerId: props.player.id, cardId: selectedTarget.value.cardId })
}
const canPolish = computed(() => {
  if (state.value.step !== 'weekend' || selectedTarget.value?.kind !== 'slot') return false
  const slot = slotState(selectedTarget.value.slotId)
  return !!slot && slot.level === 1 && slot.reworkCubes === 0
})
</script>

<template>
  <div
    class="player-board"
    :class="{ ready: isReady }"
    :style="{ borderTop: `3px solid ${playerColor(player.id)}` }"
  >
    <div class="player-head">
      <span class="player-dot" :style="{ background: playerColor(player.id) }" />
      <strong>{{ player.name }}</strong>
      <span v-if="isPm" class="badge pm">👑 PM</span>
      <span v-if="isReady" class="badge ok">Ready</span>
    </div>
    <p class="member-flavor">{{ member?.name }}<template v-if="member"> — {{ member.flavor }}</template></p>
    <div class="player-stats">
      <span>😓 疲労
        <span class="fatigue-gauge">
          <span v-for="i in state.config.fatigueMax" :key="i" class="fatigue-dot" :class="{ filled: i <= player.fatigue }" />
        </span>
        {{ player.fatigue }}/{{ state.config.fatigueMax }}
      </span>
    </div>
    <div class="player-skills muted">
      <span v-for="(label, skill) in skillLabels" :key="skill">
        {{ label.slice(0, 2) }} Lv{{ player.skills[skill] }}<template v-if="player.pendingLearn === skill"> (+1予定)</template>
      </span>
    </div>

    <!-- 個人能力 -->
    <div class="row">
      <span v-if="member?.ability === 'multitask'" class="badge">🔀マルチタスク(残業疲労なし・パッシブ)</span>
      <button v-else-if="member?.ability === 'expedite'" :disabled="abilityUsed || state.step !== 'standup'" @click="useExpedite">
        ⚡段取り(今週+1キューブ)
      </button>
      <button v-else-if="member?.ability === 'polish'" :disabled="abilityUsed || !canPolish" @click="usePolish">
        💎磨き込み(選択スロットをLv2に)
      </button>
      <button
        v-else-if="member?.ability === 'automate'"
        :disabled="abilityUsed || !selectedIsTask || (state.step !== 'standup' && state.step !== 'weekend')"
        @click="useAutomate"
      >
        🤖自動化(選択タスクの工数-1)
      </button>
    </div>

    <div v-if="canAssign" class="player-actions worker-actions">
      <p v-if="!selectedIsTask && !selectedIsSlot" class="muted hint">
        WBSボードでタスク、またはプロダクトボードでスロットをクリックして選択すると、座る/改修・手戻り/消火の対象になります。
      </p>

      <div class="assign-row">
        <span class="assign-label">主担当</span>
        <template v-if="primary">
          <span class="badge ok">{{ targetLabel(primary.target) }}</span>
          <button @click="unassign(false)">取消</button>
        </template>
        <template v-else>
          <button :disabled="!selectedIsTask" @click="assignSelectedTask(false)">座る</button>
          <button :disabled="!selectedIsSlot" @click="assignSelectedSlot">改修/手戻り対応</button>
          <button :disabled="!selectedIsTask || selectedTaskFire === 0" @click="assignExtinguish(false)">消火</button>
          <button @click="assignRest">休憩</button>
          <span class="learn-group">
            <select v-model="learnSkill">
              <option v-for="(label, skill) in skillLabels" :key="skill" :value="skill">{{ label }}</option>
            </select>
            <button @click="assignLearn">学習</button>
          </span>
        </template>
      </div>

      <div class="assign-row">
        <span class="assign-label">残業</span>
        <template v-if="overtime">
          <span class="badge warn">{{ targetLabel(overtime.target) }}</span>
          <button @click="unassign(true)">取消</button>
        </template>
        <template v-else-if="!canOvertime">
          <span class="muted">{{ overtimeBlockedReason }}</span>
        </template>
        <template v-else>
          <button :disabled="!selectedIsTask" @click="assignSelectedTask(true)">座る(残業)</button>
          <button :disabled="!selectedIsTask || selectedTaskFire === 0" @click="assignExtinguish(true)">消火(残業)</button>
        </template>
      </div>

      <button class="primary" @click="declareReady">準備完了</button>
    </div>
    <div v-else-if="state.step === 'standup' && isReady" class="muted">準備完了ずみ(配属は変更できません)</div>
  </div>
</template>
