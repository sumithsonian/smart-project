<script setup lang="ts">
/**
 * 個人ボード(メンバーカード。rules-v4-core.md §0・§3)。
 * スキル3系統+疲労トラックを彫り込み+人日キューブで表現。
 * ホームスロットのミープルはドラッグ&ドロップで盤上の配属先へ運ぶ(ASSIGN_WORKER)。
 */
import type { PlayerState } from '@smart-project/engine'

const props = defineProps<{ player: PlayerState }>()
const { state, dispatch, memberCard, playerColor, skillLabels, skillShortLabels, assignmentOf } = useGame()

const member = computed(() => memberCard(props.player.memberId))
const isReady = computed(() => state.value.readyPlayerIds.includes(props.player.id))
const isPm = computed(() => state.value.pmPlayerId === props.player.id)
const color = computed(() => playerColor(props.player.id))

const canAssign = computed(() => state.value.step === 'standup' && !state.value.pendingEvent && !isReady.value)
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
  if (props.player.overtimeBanPhase === state.value.phase) return '体調不良のため今フェーズは残業できません'
  if (props.player.fatigue >= state.value.config.noOvertimeAtFatigue) return `疲労${props.player.fatigue}のため残業できません`
  return ''
})

const abilityUsed = computed(() => props.player.abilityUsedPhase === state.value.phase)
function useExpedite() {
  dispatch({ type: 'USE_ABILITY', playerId: props.player.id })
}
function declareReady() {
  dispatch({ type: 'DECLARE_READY', playerId: props.player.id })
}

const skillKinds = ['direction', 'design', 'engineering'] as const
</script>

<template>
  <div class="board personal-board" :class="{ ready: isReady }" :style="{ '--pc': color }">
    <div class="pb-header">
      <div class="pb-name">{{ player.name }}</div>
      <div class="pb-flavor">{{ member?.name }}<template v-if="member"> — {{ member.flavor }}</template></div>
      <span v-if="isPm" class="pb-pmhat" title="PM 帽子">🎩</span>
      <span v-if="isReady" class="pb-ready-badge">Ready</span>
    </div>

    <div class="pb-section-label">スキル(窪みに人日キューブ=現在値)</div>
    <div v-for="skill in skillKinds" :key="skill" class="skill-row" :title="`${skillLabels[skill]}:1週に${player.skills[skill]}人日`">
      <span class="sk-icon">{{ skill === 'direction' ? '📋' : skill === 'design' ? '🎨' : '⚙' }}</span>
      <div class="recess-row">
        <span v-for="i in state.config.skillMax + 1" :key="i - 1" class="recess-cell">
          <span v-if="i - 1 === player.skills[skill]" class="token-cube wood" />
          <template v-else>{{ i - 1 }}</template>
        </span>
      </div>
      <span v-if="player.pendingLearn === skill" class="muted" style="font-size: 10px">(+1予定)</span>
    </div>

    <div class="pb-section-label">疲労(0〜{{ state.config.fatigueMax }}・{{ state.config.noOvertimeAtFatigue }}に残業不可線)</div>
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
        <b>⚡ 段取り</b>:今週自分の積むキューブ+1
        <button :disabled="abilityUsed || state.step !== 'standup'" @click="useExpedite">
          {{ abilityUsed ? '使用済み' : '朝会で宣言する' }}
        </button>
      </template>
      <template v-else-if="member?.ability === 'polish'">
        <b>💎 磨き込み</b>:週末に、納品済みLv1スロット1つをLv2に。{{ abilityUsed ? '(使用済み)' : 'プロダクトボードの💎アイコンから' }}
      </template>
      <template v-else-if="member?.ability === 'automate'">
        <b>🤖 自動化</b>:未納品タスク1つの必要人日-1。{{ abilityUsed ? '(使用済み)' : '盤上タスクの🤖アイコンから' }}
      </template>
    </div>

    <div class="pb-section-label">コマ置き場</div>
    <div class="pb-home">
      <div class="home-slot">
        <MeepleToken
          v-if="!primary"
          :player-id="player.id"
          :color="color"
          :draggable="canAssign"
          :overtime="false"
        />
        <span class="home-label">本業</span>
      </div>
      <div class="home-slot" :class="{ blocked: !canOvertime && !overtime }" :title="overtimeBlockedReason">
        <MeepleToken
          v-if="!overtime"
          :player-id="player.id"
          :color="color"
          :draggable="canAssign && canOvertime"
          :overtime="true"
        />
        <span class="home-label">残業</span>
      </div>
    </div>

    <button v-if="canAssign" class="primary pb-ready-btn" @click="declareReady">準備完了</button>
    <div v-else-if="state.step === 'standup' && isReady" class="muted" style="margin-top: 16px">準備完了ずみ(配属は変更できません)</div>
  </div>
</template>
