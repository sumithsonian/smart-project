<script setup lang="ts">
/** 個人ボード:ロール・疲労・スキル・トークン・個人目標(ホットシートなので全公開)+ 操作ボタン */
import { computed, ref } from 'vue'
import type { PlayerState, SkillKind, WorkerTarget } from '@smart-project/engine'

const props = defineProps<{ player: PlayerState }>()
const {
  state,
  dispatch,
  selectedTaskId,
  tile,
  personalGoal,
  roleName,
  playerColor,
  skillLabels,
  workerMode,
  openSeatIndices,
  supportCountOf,
  extinguishPledgeCountOf,
  assignmentOf,
  targetLabel,
} = useGame()

const learningSkill = ref<SkillKind>('direction')

const isReady = computed(() => state.value.readyPlayerIds.includes(props.player.id))
const isPlanning = computed(() => state.value.step === 'planning')
const goal = computed(() => personalGoal(props.player.personalGoalId))
const fatigueFace = computed(() => ['😀', '🙂', '😩', '🥵'][props.player.fatigue] ?? '🥵')
const selectedHasFire = computed(() => {
  if (!selectedTaskId.value) return false
  return (state.value.taskArea.find((t) => t.tileId === selectedTaskId.value)?.fire ?? 0) > 0
})
const myMilestones = computed(() =>
  state.value.milestones.filter((m) => m.achievedBy === props.player.id),
)

// ── v3.0 週次ワーカーコミット:配属UI ──
const primaryAssignment = computed(() => assignmentOf(props.player.id, false))
const overtimeAssignment = computed(() => assignmentOf(props.player.id, true))
/** 残業できるか(疲労Lv・体調不良フェーズ・主担当未配属をチェック。上限は engine 側の判定に委ねる) */
const canOvertime = computed(() => {
  if (!primaryAssignment.value) return false
  if (props.player.fatigue >= state.value.config.noOvertimeAtFatigueLv) return false
  if (props.player.overtimeBanPhase === state.value.phase) return false
  return true
})
const overtimeBlockedReason = computed(() => {
  if (!primaryAssignment.value) return '主担当を決めてから配属できます'
  if (props.player.overtimeBanPhase === state.value.phase) return '体調不良のため今フェーズは残業できません'
  if (props.player.fatigue >= state.value.config.noOvertimeAtFatigueLv) return `疲労Lv${props.player.fatigue}のため残業できません`
  return ''
})

/** 選択中タスクの空席オプション(選択肢ラベル付き) */
const seatOptions = computed(() => {
  if (!selectedTaskId.value) return []
  const t = tile(selectedTaskId.value)
  if (!t) return []
  return openSeatIndices(selectedTaskId.value).map((i) => {
    const seat = t.seats[i]!
    const label = seat.skill ? `${skillLabels[seat.skill]}Lv${seat.level}` : '人手'
    return { value: `seat:${i}`, label: `席#${i}:${label}` }
  })
})
/** 選択中タスクへ応援できるか(🔥ぶんの需要が埋まっていない) */
const supportAvailable = computed(() => {
  if (!selectedTaskId.value) return false
  const instance = state.value.taskArea.find((t) => t.tileId === selectedTaskId.value)
  return !!instance && instance.fire > supportCountOf(selectedTaskId.value)
})
/** 選択中タスクへ消火できるか(🔥ぶんの消火宣言が埋まっていない) */
const extinguishAvailable = computed(() => {
  if (!selectedTaskId.value) return false
  const instance = state.value.taskArea.find((t) => t.tileId === selectedTaskId.value)
  return !!instance && instance.fire > extinguishPledgeCountOf(selectedTaskId.value)
})

/** 配属先の選択肢(残業枠は席/応援/消火のみ) */
function targetOptions(forOvertime: boolean): Array<{ value: string; label: string }> {
  const opts: Array<{ value: string; label: string }> = []
  if (!forOvertime) {
    opts.push({ value: 'rest', label: '休憩' })
    opts.push({ value: 'learning', label: '学習(下の系統選択と併用)' })
  }
  opts.push(...seatOptions.value)
  if (supportAvailable.value) opts.push({ value: 'support', label: '応援' })
  if (extinguishAvailable.value) opts.push({ value: 'extinguish', label: '消火' })
  return opts
}
const primaryOptions = computed(() => targetOptions(false))
const overtimeOptions = computed(() => targetOptions(true))
const primaryChoice = ref('')
const overtimeChoice = ref('')

/** 選択肢文字列から WorkerTarget を組み立てる */
function buildTarget(choice: string): WorkerTarget | null {
  if (choice === 'rest') return { kind: 'rest' }
  if (choice === 'learning') return { kind: 'learning', skill: learningSkill.value }
  if (choice === 'support') return selectedTaskId.value ? { kind: 'support', taskTileId: selectedTaskId.value } : null
  if (choice === 'extinguish') return selectedTaskId.value ? { kind: 'extinguish', taskTileId: selectedTaskId.value } : null
  if (choice.startsWith('seat:') && selectedTaskId.value) {
    return { kind: 'seat', taskTileId: selectedTaskId.value, seatIndex: Number(choice.slice(5)) }
  }
  return null
}

function assignPrimary() {
  const target = buildTarget(primaryChoice.value)
  if (!target) return
  if (dispatch({ type: 'ASSIGN_WORKER', playerId: props.player.id, target })) {
    primaryChoice.value = ''
  }
}
function assignOvertime() {
  const target = buildTarget(overtimeChoice.value)
  if (!target) return
  if (dispatch({ type: 'ASSIGN_WORKER', playerId: props.player.id, target, overtime: true })) {
    overtimeChoice.value = ''
  }
}
function unassignPrimary() {
  dispatch({ type: 'UNASSIGN_WORKER', playerId: props.player.id })
}
function unassignOvertime() {
  dispatch({ type: 'UNASSIGN_WORKER', playerId: props.player.id, overtime: true })
}

function extinguish() {
  if (!selectedTaskId.value) return
  dispatch({
    type: 'EXTINGUISH_FIRE',
    playerId: props.player.id,
    taskTileId: selectedTaskId.value,
  })
}

function place() {
  if (!selectedTaskId.value) return
  dispatch({
    type: 'PLACE_TOKEN',
    playerId: props.player.id,
    target: { kind: 'task', taskTileId: selectedTaskId.value },
  })
}
function retrieve() {
  if (!selectedTaskId.value) return
  dispatch({
    type: 'RETRIEVE_TOKEN',
    playerId: props.player.id,
    target: { kind: 'task', taskTileId: selectedTaskId.value },
  })
}
function learn() {
  dispatch({
    type: 'PLACE_TOKEN',
    playerId: props.player.id,
    target: { kind: 'learning', skill: learningSkill.value },
  })
}
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
      <span class="badge">{{ roleName(player.role) }}</span>
      <span v-if="player.role === 'pm'" class="badge pm">PM</span>
      <span v-if="isReady" class="badge ok">Ready</span>
    </div>
    <div class="player-stats">
      <span>🪙 {{ player.tokens }}</span>
      <span>{{ fatigueFace }} 疲労Lv{{ player.fatigue }}</span>
      <span v-if="state.config.epEnabled" title="EP:自分の仕事が他人に使われた回数">🤝 EP {{ player.ep }}</span>
      <span v-if="player.nextPhaseTokenPenalty > 0" class="danger-text">次補充-{{ player.nextPhaseTokenPenalty }}</span>
    </div>
    <div v-if="myMilestones.length" class="player-milestones">
      <span v-for="m in myMilestones" :key="m.cardId" class="badge milestone">
        🏅 {{ state.content.milestones.find((c) => c.id === m.cardId)?.name }}
      </span>
    </div>
    <div class="player-skills muted">
      <span v-for="(label, skill) in skillLabels" :key="skill">
        {{ label.slice(0, 2) }} Lv{{ player.skills[skill] }}<template v-if="player.learningProgress[skill] > 0">(+{{ player.learningProgress[skill] }}🪙)</template>
      </span>
    </div>
    <div v-if="goal" class="player-goal secret-bg">
      🎯 {{ goal.name }}<span class="muted">:{{ goal.description }}</span>
    </div>
    <div v-else class="player-goal secret-bg muted">🎯 個人目標を選択中…</div>
    <div v-if="isPlanning && !isReady && !workerMode" class="player-actions">
      <button :disabled="!selectedTaskId" @click="place">配置</button>
      <button :disabled="!selectedTaskId" @click="retrieve">回収</button>
      <button
        v-if="state.config.fireEnabled"
        :disabled="!selectedHasFire"
        title="選択中タスクの🔥を1個除去"
        @click="extinguish"
      >
        🧯消火
      </button>
      <button @click="dispatch({ type: 'REST', playerId: player.id })">休憩</button>
      <button @click="dispatch({ type: 'EXTRA_BILLING', playerId: player.id })">追加請求</button>
      <span class="learn-group">
        <select v-model="learningSkill">
          <option v-for="(label, skill) in skillLabels" :key="skill" :value="skill">{{ label }}</option>
        </select>
        <button @click="learn">学習</button>
      </span>
      <button class="primary" @click="dispatch({ type: 'DECLARE_READY', playerId: player.id })">
        準備完了
      </button>
    </div>

    <!-- v3.0 週次ワーカーコミット:配属UI(主担当1 + 任意の残業1枠) -->
    <div v-if="isPlanning && !isReady && workerMode" class="player-actions worker-actions">
      <p v-if="!selectedTaskId" class="muted hint">
        タスクの席・応援・消火へ配属するには、先にタスクエリアでタイルをクリックして選択してください。
      </p>

      <div class="assign-row">
        <span class="assign-label">主担当</span>
        <template v-if="primaryAssignment">
          <span class="badge ok">{{ targetLabel(primaryAssignment.target) }}</span>
          <button @click="unassignPrimary">取消</button>
        </template>
        <template v-else>
          <select v-model="primaryChoice">
            <option value="">配属先を選択…</option>
            <option v-for="o in primaryOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
          <select v-if="primaryChoice === 'learning'" v-model="learningSkill">
            <option v-for="(label, skill) in skillLabels" :key="skill" :value="skill">{{ label }}</option>
          </select>
          <button class="primary" :disabled="!primaryChoice" @click="assignPrimary">配属</button>
        </template>
      </div>

      <div class="assign-row">
        <span class="assign-label">残業</span>
        <template v-if="overtimeAssignment">
          <span class="badge warn">{{ targetLabel(overtimeAssignment.target) }}</span>
          <button @click="unassignOvertime">取消</button>
        </template>
        <template v-else-if="!canOvertime">
          <span class="muted">{{ overtimeBlockedReason }}</span>
        </template>
        <template v-else>
          <select v-model="overtimeChoice">
            <option value="">配属先を選択…</option>
            <option v-for="o in overtimeOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
          <button class="primary" :disabled="!overtimeChoice" @click="assignOvertime">配属</button>
        </template>
      </div>

      <button
        v-if="player.role === 'pm'"
        :disabled="state.extraBillingUsedThisPhase >= state.config.extraBillingPerPhase"
        :title="'フェーズ内の残り回数'"
        @click="dispatch({ type: 'EXTRA_BILLING', playerId: player.id })"
      >
        追加請求(残{{ Math.max(0, state.config.extraBillingPerPhase - state.extraBillingUsedThisPhase) }}回)
      </button>

      <button class="primary" @click="dispatch({ type: 'DECLARE_READY', playerId: player.id })">
        準備完了
      </button>
    </div>
  </div>
</template>
