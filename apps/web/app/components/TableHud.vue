<script setup lang="ts">
/**
 * 上部固定HUD(RULES.md §10-3)。
 * ズームしても常に画面内に残るもの:CS・予算・フェーズ・週、今週の目標、進行ボタン、
 * 選択中プレイヤーの情報。
 */
const {
  state,
  dispatch,
  reset,
  eventCardOf,
  limitEventCardOf,
  playerName,
  playerColor,
  phaseNames,
  requirementCard,
  slotName,
  urgentMusts,
  openBetters,
  interruptTasks,
  selectedMeeple,
  clearSelection,
  memberCard,
  skillIcons,
  skillLabels,
} = useGame()

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
  if (isLimitEvent.value) {
    return limitEventCardOf(pending.value.cardId)?.name ?? pending.value.cardId
  }
  return eventCardOf(pending.value.cardId)?.name ?? pending.value.cardId
})
const pendingTargetName = computed(() =>
  pending.value?.targetPlayerId ? playerName(pending.value.targetPlayerId) : null,
)

const guideText = computed(() => {
  if (pending.value) {
    const who = pendingTargetName.value ? `(${pendingTargetName.value})` : ''
    return `⚠ 「${pendingCardName.value}」${who} — 内容を確認して選びましょう`
  }
  if (selectedMeeple.value) {
    const who = playerName(selectedMeeple.value.playerId)
    const kind = selectedMeeple.value.overtime ? '残業枠' : '本業'
    return `👆 ${who}の${kind}を選択中 — 光っている場所をクリックして配置します`
  }
  switch (step.value) {
    case 'scope_meeting':
      return '📋 スコープ会議 — 要件の区分を確かめ、候補タスクを3週間に配置しましょう'
    case 'standup':
      return '🗣 朝会 — ミープルをクリック(またはドラッグ)して今週の担当を決めましょう'
    case 'weekend':
      return state.value.pendingWeekendEventDraw
        ? '📦 週末 — 完成したタスクを納品したら「週末のできごと」へ'
        : '🔁 再計画 — 来週以降の予定を組み直してから次の週へ'
    case 'phase_end':
      return '🔍 フェーズ振り返り — 要件の清算結果を確認します'
    case 'finished':
      return '🏁 ゲーム終了 — 結果を確認しましょう'
    default:
      return ''
  }
})

/** 今週の目標(RULES.md §10-3) */
const goals = computed(() => {
  const items: Array<{ icon: string; text: string; cls: string }> = []
  for (const r of urgentMusts.value.slice(0, 2)) {
    const card = requirementCard(r.requirementId)
    if (!card) continue
    const overdue = r.deadlinePhase <= state.value.phase
    items.push({
      icon: '🎯',
      text: `Must「${slotName(card.slot)} Lv${card.level}」期限F${r.deadlinePhase}`,
      cls: overdue ? 'urgent' : 'normal',
    })
  }
  const better = openBetters.value[0]
  if (better) {
    const card = requirementCard(better.requirementId)
    if (card) {
      items.push({
        icon: '✨',
        text: `Better「${slotName(card.slot)} Lv${card.level}」達成で CS+${state.value.config.betterMeetCs}`,
        cls: 'normal',
      })
    }
  }
  const bugs = interruptTasks.value.filter((t) => t.interrupt === 'bug').length
  const reworks = interruptTasks.value.filter((t) => t.interrupt === 'rework').length
  if (bugs > 0) {
    items.push({ icon: '🐛', text: `未対応のバグ ${bugs}件(フェーズ末に CS-${bugs})`, cls: 'urgent' })
  }
  if (reworks > 0) {
    items.push({ icon: '🔁', text: `手戻り ${reworks}件(要件を塞いでいます)`, cls: 'urgent' })
  }
  const free = state.value.config.interruptCapacity - interruptTasks.value.length
  if (free <= 1) {
    items.push({
      icon: '🌊',
      text: `割り込み残り${free}枠(あふれると CS-${state.value.config.overflowCs})`,
      cls: 'urgent',
    })
  }
  return items
})

/** 選択中プレイヤーの情報(残り行動・得意スキル。RULES.md §10-3) */
const selectedInfo = computed(() => {
  const sel = selectedMeeple.value
  if (!sel) return null
  const player = state.value.players.find((p) => p.id === sel.playerId)
  if (!player) return null
  const best = (['direction', 'design', 'engineering'] as const).reduce((a, b) =>
    player.skills[a] >= player.skills[b] ? a : b,
  )
  const assigned = state.value.assignments.filter((a) => a.playerId === player.id).length
  return {
    name: player.name,
    color: playerColor(player.id),
    overtime: sel.overtime,
    fatigue: player.fatigue,
    best,
    bestValue: player.skills[best],
    remaining: Math.max(0, 2 - assigned),
    ability: memberCard(player.memberId)?.ability,
  }
})

type ActionSpec = {
  label: string
  pmAction: boolean
  disabledReason: string | null
  onClick: () => void
} | null

const action = computed<ActionSpec>(() => {
  if (pending.value) return null // 解決はモーダル側
  switch (step.value) {
    case 'scope_meeting':
      return {
        label: '会議を締めて第1週へ',
        pmAction: true,
        disabledReason: null,
        onClick: () => dispatch({ type: 'FINISH_SCOPE', playerId: state.value.pmPlayerId }),
      }
    case 'weekend': {
      const blocked = state.value.pendingLimitPlayerIds.length > 0
      if (state.value.pendingWeekendEventDraw) {
        return {
          label: '週末のできごとへ',
          pmAction: true,
          disabledReason: blocked ? '限界イベントの処理が残っています' : null,
          onClick: () => dispatch({ type: 'END_WEEKEND', playerId: state.value.pmPlayerId }),
        }
      }
      const last = state.value.week >= state.value.config.roundsPerPhase
      return {
        label: last ? 'フェーズ終了へ' : '次の週へ',
        pmAction: true,
        disabledReason: blocked ? '限界イベントの処理が残っています' : null,
        onClick: () => dispatch({ type: 'END_WEEKEND', playerId: state.value.pmPlayerId }),
      }
    }
    case 'phase_end':
      return {
        label: state.value.phase >= state.value.config.phases ? '最終検収へ' : '次フェーズへ',
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
    <div class="hud-row hud-row-main">
      <h1>{{ phaseWeekLabel }}</h1>

      <div class="hud-tracks">
        <span class="hud-track cs" :class="{ danger: state.cs <= 1 }" title="顧客満足度">
          💚 CS {{ state.cs }}
        </span>
        <span class="hud-track budget" title="予算">💴 予算 {{ state.budget }}</span>
      </div>

      <div class="hud-sep" />
      <div class="hud-guide">{{ guideText }}</div>
      <div class="hud-spacer" />

      <div class="ready-chips">
        <span
          v-for="p in state.players"
          :key="p.id"
          class="ready-chip"
          :class="{ ready: state.readyPlayerIds.includes(p.id) }"
          :style="{ '--pc': playerColor(p.id) }"
          :title="`${p.name}${state.readyPlayerIds.includes(p.id) ? '(準備完了)' : ''}`"
        >
          <span v-if="p.id === state.pmPlayerId" class="pm-mark">👑</span>
        </span>
      </div>

      <button
        v-if="action"
        class="primary"
        :disabled="!!action.disabledReason"
        :title="action.disabledReason ?? ''"
        @click="action.onClick"
      >
        <span v-if="action.pmAction">👑</span>
        {{ action.label }}
      </button>
      <button class="hud-reset" title="新規ゲーム" @click="reset">🔄</button>
    </div>

    <div class="hud-row hud-row-sub">
      <div class="hud-goals">
        <span class="hud-goals-label">今週の目標</span>
        <span v-for="(g, i) in goals" :key="i" class="hud-goal" :class="g.cls">
          {{ g.icon }} {{ g.text }}
        </span>
        <span v-if="goals.length === 0" class="hud-goal normal">いまは急ぎの案件はありません</span>
      </div>

      <div v-if="selectedInfo" class="hud-selected" :style="{ '--pc': selectedInfo.color }">
        <span class="hud-selected-name">
          {{ selectedInfo.name }}{{ selectedInfo.overtime ? '(残業枠)' : '' }}
        </span>
        <span class="hud-selected-item">
          得意:{{ skillIcons[selectedInfo.best] }}{{ skillLabels[selectedInfo.best] }}
          {{ selectedInfo.bestValue }}
        </span>
        <span class="hud-selected-item">
          疲労 {{ selectedInfo.fatigue }}/{{ state.config.fatigueMax }}
        </span>
        <span class="hud-selected-item">残り行動 {{ selectedInfo.remaining }}</span>
        <button class="hud-selected-cancel" @click="clearSelection">選択を解除</button>
      </div>
    </div>
  </div>
</template>
