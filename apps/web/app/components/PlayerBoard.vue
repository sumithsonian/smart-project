<script setup lang="ts">
/** 個人ボード:ロール・疲労・スキル・トークン・個人目標(ホットシートなので全公開)+ 操作ボタン */
import { computed, ref } from 'vue'
import type { PlayerState, SkillKind } from '@smart-project/engine'

const props = defineProps<{ player: PlayerState }>()
const { state, dispatch, selectedTaskId, personalGoal, roleName, playerColor } = useGame()

const learningSkill = ref<SkillKind>('direction')
const skillLabels: Record<SkillKind, string> = {
  direction: 'ディレクション',
  design: 'デザイン',
  engineering: 'エンジニアリング',
}

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
    <div v-if="isPlanning && !isReady" class="player-actions">
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
  </div>
</template>
