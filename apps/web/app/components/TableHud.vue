<script setup lang="ts">
/**
 * 上部固定HUDバー(モックの見た目に統一)。
 * 旧 TurnDirector.vue の機能(フェーズ/週ステッパー、教育ガイド文、準備完了チップ、進行ボタン)を
 * モックの薄いバー1本に集約する。
 */
const { state, dispatch, reset, eventCardOf, limitEventCardOf, playerName, phaseNames, playerColor } = useGame()

const step = computed(() => state.value.step)
const pending = computed(() => state.value.pendingEvent)
const isLimitEvent = computed(() => pending.value?.kind === 'limit')

const phaseWeekLabel = computed(() => {
  const phaseName = phaseNames[state.value.phase - 1] ?? `フェーズ${state.value.phase}`
  if (state.value.step === 'scope_meeting') return `${phaseName} 計画中`
  if (state.value.step === 'finished') return 'ゲーム終了'
  return `${phaseName} 週${state.value.week}/${state.value.config.roundsPerPhase}`
})

const pendingCardName = computed(() => {
  if (!pending.value) return null
  if (isLimitEvent.value) return limitEventCardOf(pending.value.cardId)?.name ?? pending.value.cardId
  return eventCardOf(pending.value.cardId)?.name ?? pending.value.cardId
})
const pendingTargetName = computed(() =>
  pending.value?.targetPlayerId ? playerName(pending.value.targetPlayerId) : null,
)

const guideText = computed(() => {
  if (pending.value) {
    return `⚠ 「${pendingCardName.value}」${pendingTargetName.value ? `(${pendingTargetName.value})` : ''} — 内容を確認して解決しましょう`
  }
  switch (step.value) {
    case 'scope_meeting':
      return '📋 スコープ会議 — 検収条件ボードで約束を選び、サプライからタスクをWBSに配置しましょう'
    case 'standup':
      return '🗣 朝会 — ミープルをドラッグして担当場所に置きましょう'
    case 'weekend':
      return '📦 週末 — 完成したタスクを納品しましょう(まだなら次週へ持ち越し)'
    case 'phase_end':
      return '🔍 フェーズ振り返り — 約束の達成状況を清算します'
    case 'finished':
      return '🏁 ゲーム終了 — 結果を確認しましょう'
    default:
      return ''
  }
})

type ActionSpec = { label: string; pmAction: boolean; disabledReason: string | null; onClick: () => void } | null

const action = computed<ActionSpec>(() => {
  if (pending.value) {
    return { label: 'イベントを解決', pmAction: false, disabledReason: null, onClick: () => dispatch({ type: 'RESOLVE_EVENT' }) }
  }
  switch (step.value) {
    case 'scope_meeting':
      return {
        label: '会議を締める',
        pmAction: true,
        disabledReason: null,
        onClick: () => dispatch({ type: 'FINISH_SCOPE', playerId: state.value.pmPlayerId }),
      }
    case 'weekend': {
      const suffix = state.value.week >= state.value.config.roundsPerPhase ? 'フェーズ終了へ' : '次週へ'
      const blocked = state.value.pendingLimitPlayerIds.length > 0
      return {
        label: `週末へ(${suffix})`,
        pmAction: true,
        disabledReason: blocked ? '限界イベントの処理が残っています' : null,
        onClick: () => dispatch({ type: 'END_WEEKEND', playerId: state.value.pmPlayerId }),
      }
    }
    case 'phase_end':
      return {
        label: state.value.phase >= state.value.config.phases ? '最終判定へ' : '次フェーズへ',
        pmAction: false,
        disabledReason: null,
        onClick: () => dispatch({ type: 'ADVANCE_PHASE' }),
      }
    case 'finished':
      return { label: '新しいゲーム', pmAction: false, disabledReason: null, onClick: reset }
    default:
      return null
  }
})
</script>

<template>
  <div id="hud">
    <h1>{{ phaseWeekLabel }}</h1>
    <div class="hud-sep" />
    <div class="hud-guide">{{ guideText }}</div>
    <div class="hud-spacer" />
    <div class="ready-chips">
      <span
        v-for="(p, i) in state.players"
        :key="p.id"
        class="ready-chip"
        :class="{ ready: state.readyPlayerIds.includes(p.id) }"
        :style="{ '--pc': playerColor(p.id) }"
        :title="p.name"
      >
        <span v-if="p.id === state.pmPlayerId" class="pm-mark">👑</span>
      </span>
    </div>
    <button v-if="action" :disabled="!!action.disabledReason" :title="action.disabledReason ?? ''" @click="action.onClick">
      <span v-if="action.pmAction">👑</span>
      {{ action.label }}
    </button>
    <button class="hud-reset" title="新規ゲーム" @click="reset">🔄</button>
  </div>
</template>
