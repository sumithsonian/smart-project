<script setup lang="ts">
/** 個人ボード:ロール・疲労・スキル・トークン・個人目標(ホットシートなので全公開)+ 操作ボタン */
import { computed, ref } from 'vue'
import type { PlayerState, SkillKind } from '@smart-project/engine'

const props = defineProps<{ player: PlayerState }>()
const { state, dispatch, selectedTaskId, personalGoal, roleName } = useGame()

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
  <div class="player-board" :class="{ ready: isReady }">
    <div class="player-head">
      <strong>{{ player.name }}</strong>
      <span class="badge">{{ roleName(player.role) }}</span>
      <span v-if="player.role === 'pm'" class="badge pm">PM</span>
      <span v-if="isReady" class="badge ok">Ready</span>
    </div>
    <div class="player-stats">
      <span>🪙 {{ player.tokens }}</span>
      <span>{{ fatigueFace }} 疲労Lv{{ player.fatigue }}</span>
      <span v-if="player.nextPhaseTokenPenalty > 0" class="danger-text">次補充-{{ player.nextPhaseTokenPenalty }}</span>
    </div>
    <div class="player-skills muted">
      <span v-for="(label, skill) in skillLabels" :key="skill">
        {{ label.slice(0, 2) }} Lv{{ player.skills[skill] }}<template v-if="player.learningProgress[skill] > 0">(+{{ player.learningProgress[skill] }}🪙)</template>
      </span>
    </div>
    <div class="player-goal secret-bg">
      🎯 {{ goal?.name }}<span class="muted">:{{ goal?.description }}</span>
    </div>
    <div v-if="isPlanning && !isReady" class="player-actions">
      <button :disabled="!selectedTaskId" @click="place">配置</button>
      <button :disabled="!selectedTaskId" @click="retrieve">回収</button>
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
