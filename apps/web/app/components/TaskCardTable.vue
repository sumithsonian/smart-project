<script setup lang="ts">
/**
 * 卓上のタスクカード(計画ボード or 割り込みレーンに配置済み)。
 * v5 の表示要素:
 *  - 見積工数とリスク、実工数が公開されたらその値(RULES.md §2-2)
 *  - 前提成果物とブロック表示 🔒(RULES.md §6-2)
 *  - 必要系統(割り込みは専門スキル。RULES.md §8-4)
 *  - 担当行はクリック配置とドラッグ&ドロップの両方を受け付ける(RULES.md §10-1)
 *  - 配置前のプレビュー(進捗・疲労・納品見込み・予算。RULES.md §10-2)
 */
const props = defineProps<{ cardId: string }>()

const {
  state,
  dispatch,
  taskCard,
  slotName,
  displayTaskName,
  requiredCubesOf,
  estimatedCubesOf,
  isEffortRevealed,
  requiredSkillOf,
  isBlocked,
  blockReason,
  deliveryPreview,
  boardTask,
  playerColor,
  playerName,
  skillColors,
  skillIcons,
  skillLabels,
  riskLabels,
  riskColors,
  assignmentsForTarget,
  selectedMeeple,
  canPlaceAt,
  placeSelectedAt,
  previewForSelected,
} = useGame()
const { hoverZoneKey } = useTableDrag()

const task = computed(() => boardTask(props.cardId))
const isInterrupt = computed(() => !!task.value?.interrupt)
const card = computed(() =>
  task.value && !task.value.interrupt ? taskCard(task.value.cardId) : undefined,
)
const skill = computed(() => (task.value ? requiredSkillOf(task.value) : null))
const skillColor = computed(() => (skill.value ? skillColors[skill.value] : '#64748b'))
const needed = computed(() => (task.value ? requiredCubesOf(task.value) : 0))
const estimated = computed(() => (task.value ? estimatedCubesOf(task.value) : 0))
const revealed = computed(() => (task.value ? isEffortRevealed(task.value) : false))
const overshootCells = computed(() => Math.max(0, (task.value?.cubes ?? 0) - needed.value))
const blocked = computed(() => (task.value ? isBlocked(task.value) : false))
const blockedWhy = computed(() => (task.value ? blockReason(task.value) : null))

const assignZoneKey = 'task:' + props.cardId
const extinguishZoneKey = 'extinguish:' + props.cardId
const canAssignNow = computed(() => state.value.step === 'standup' && !state.value.pendingEvent)
const assignGlow = computed(() => hoverZoneKey.value === assignZoneKey)
const assignees = computed(() =>
  task.value ? assignmentsForTarget({ kind: 'task', cardId: task.value.cardId }) : [],
)

// ── クリック配置(選択中のミープルを置けるか) ──
const assignTarget = computed(() => ({ kind: 'task' as const, cardId: props.cardId }))
const extinguishTarget = computed(() => ({ kind: 'extinguish' as const, cardId: props.cardId }))
const assignable = computed(() => canPlaceAt(assignTarget.value))
const extinguishable = computed(() => canPlaceAt(extinguishTarget.value))
const preview = computed(() => previewForSelected(assignTarget.value))

function clickAssign() {
  if (!selectedMeeple.value) return
  placeSelectedAt(assignTarget.value)
}
function clickExtinguish() {
  if (!selectedMeeple.value) return
  placeSelectedAt(extinguishTarget.value)
}

const isReadyGlow = computed(
  () => state.value.step === 'weekend' && !!task.value && task.value.cubes >= needed.value,
)

const deliverBlock = computed<string | null>(() => {
  if (state.value.step !== 'weekend' || !task.value) return '週末にだけ納品できます'
  if (task.value.cubes < needed.value) return `人日が足りません(残り${needed.value - task.value.cubes})`
  if (!task.value.interrupt) {
    const c = taskCard(task.value.cardId)
    if (!c) return '不明なカードです'
    if (state.value.budget < c.cost) return `実行コスト${c.cost}に予算が足りません`
  }
  return null
})

function deliver() {
  dispatch({ type: 'DELIVER_TASK', cardId: props.cardId })
}
function declineInterrupt() {
  dispatch({
    type: 'DECLINE_INTERRUPT',
    playerId: state.value.pmPlayerId,
    cardId: props.cardId,
  })
}

// ── 再計画(スコープ会議・週末のみ) ──
const canReplan = computed(
  () =>
    !isInterrupt.value &&
    (state.value.step === 'scope_meeting' || state.value.step === 'weekend') &&
    !state.value.pendingEvent,
)
const weeks = computed(() =>
  Array.from({ length: state.value.config.roundsPerPhase }, (_, i) => i + 1),
)
function moveTo(week: number | null) {
  dispatch({ type: 'MOVE_TASK', playerId: state.value.pmPlayerId, cardId: props.cardId, week })
}
function dropTask() {
  dispatch({ type: 'DROP_TASK', playerId: state.value.pmPlayerId, cardId: props.cardId })
}
</script>

<template>
  <div
    v-if="task"
    class="task-card"
    :class="{
      'card-interrupt': isInterrupt,
      ready: isReadyGlow,
      blocked,
    }"
    :style="{ '--skill': skillColor }"
  >
    <div v-if="task.fire > 0" class="tc-fire-corner">
      <span
        v-for="i in task.fire"
        :key="i"
        class="fire-disc"
        :class="{
          'tc-extinguish-zone': i === 1,
          'dz-clickable': i === 1 && !!selectedMeeple && extinguishable.ok,
        }"
        :data-dropzone-key="i === 1 && canAssignNow ? extinguishZoneKey : undefined"
        :title="i === 1 ? '🧯 ここに置いて消火(クリック or ドロップ)' : ''"
        @click="i === 1 ? clickExtinguish() : undefined"
        >🔥</span
      >
    </div>

    <div class="tc-body">
      <div class="tc-corner-row">
        <span v-if="skill" class="tc-chip skill" :style="{ background: skillColors[skill] }">
          {{ skillIcons[skill] }} {{ skillLabels[skill] }}
        </span>
        <span v-else class="tc-chip">系統不問</span>
        <template v-if="!isInterrupt && card">
          <span class="tc-chip" :title="`納品時の実行コスト(予算)`">💰{{ card.cost }}</span>
          <span class="tc-chip" :title="`座った週の疲労`">😓{{ card.fatigue }}</span>
        </template>
      </div>

      <div class="tc-name">{{ displayTaskName(task) }}</div>

      <div v-if="blocked" class="tc-blocked">🔒 {{ blockedWhy }}</div>

      <div v-if="!isInterrupt && card && card.prerequisiteSlots.length > 0" class="tc-prereq">
        前提:{{ card.prerequisiteSlots.map(slotName).join('・') }}
      </div>

      <!-- 見積 / 実工数(RULES.md §2-2) -->
      <div class="tc-effort-row">
        <template v-if="isInterrupt">
          <span class="tc-label">解消人日</span>
          <span class="tc-effort-value">{{ needed }}</span>
        </template>
        <template v-else-if="revealed">
          <span class="tc-label">実工数</span>
          <span class="tc-effort-value revealed">{{ needed }}</span>
          <span class="tc-effort-est">(見積 {{ card?.estimate }})</span>
        </template>
        <template v-else>
          <span class="tc-label">見積</span>
          <span class="tc-effort-value">{{ estimated }}</span>
          <span
            v-if="card"
            class="tc-risk"
            :style="{ color: riskColors[card.risk] }"
            :title="'着手するまで実工数はわかりません'"
            >{{ riskLabels[card.risk] }}</span
          >
        </template>
      </div>

      <div class="tc-row">
        <span class="tc-label">進捗</span>
        <div class="cube-track">
          <span
            v-for="i in needed"
            :key="'n' + i"
            class="ccell"
            :class="{ burning: task.fire > 0 && i > needed - task.fire && i > task.cubes }"
          >
            <span v-if="i <= task.cubes" class="token-cube wood" />
          </span>
          <span
            v-for="i in overshootCells"
            :key="'o' + i"
            class="ccell"
            style="border-color: var(--gold)"
          >
            <span class="token-cube wood" />
          </span>
        </div>
        <span class="tc-progress-num">{{ task.cubes }}/{{ needed }}</span>
      </div>

      <div
        class="tc-row tc-assign"
        :class="{
          'dz-active': canAssignNow,
          'dz-glow': assignGlow,
          'dz-clickable': !!selectedMeeple && assignable.ok,
          'dz-forbidden': !!selectedMeeple && !assignable.ok,
        }"
        :data-dropzone-key="canAssignNow ? assignZoneKey : undefined"
        :title="selectedMeeple && !assignable.ok ? (assignable.reason ?? '') : '担当する'"
        @click="clickAssign"
      >
        <span class="tc-label">担当</span>
        <div class="footprint-row">
          <MeepleToken
            v-for="a in assignees"
            :key="a.playerId + String(a.overtime)"
            :player-id="a.playerId"
            :overtime="a.overtime"
            :color="playerColor(a.playerId)"
            :draggable="canAssignNow && !state.readyPlayerIds.includes(a.playerId)"
            :title="playerName(a.playerId)"
          />
          <span v-if="assignees.length === 0" class="footprint"><span class="fp-mark">👣</span></span>
        </div>
      </div>

      <!-- 配置プレビュー(RULES.md §10-2) -->
      <PreviewChip v-if="preview && assignable.ok" :preview="preview" />

      <AbilityPicker
        v-if="!isInterrupt && (state.step === 'standup' || state.step === 'weekend')"
        ability="automate"
        :card-id="task.cardId"
      />
    </div>

    <div class="tc-reward">
      <template v-if="isInterrupt">
        <span class="tc-reward-slot">{{ displayTaskName(task) }}</span>
        <div class="tc-reward-line">
          <span v-if="task.interrupt === 'bug'">放置:フェーズ末ごとに CS-1</span>
          <span v-else-if="task.interrupt === 'rework'">解消するまで要件は未達扱い</span>
          <span v-else>完了:予算+{{ task.rewardBudget }} / フェーズ末に自然消滅</span>
        </div>
        <div v-if="task.csOnFulfill > 0" class="tc-reward-line">
          <span>🎁 やり切ると CS+{{ task.csOnFulfill }}</span>
        </div>
      </template>
      <template v-else-if="card">
        <span class="tc-reward-slot">{{ slotName(card.slot) }}</span>
        <div class="tc-reward-line">
          <span>納品 □×{{ needed }} →</span>
          <span class="cube-token mini silver" />
          <span>Lv1(⚠品質リスク)</span>
        </div>
        <div v-if="card.maxLevel === 2" class="tc-reward-line">
          <span>積増 □×{{ needed + state.config.qualityOvershoot }} →</span>
          <span class="cube-token mini gold" />
          <span>Lv2(リスクなし)</span>
        </div>
      </template>
    </div>

    <div v-if="state.step === 'weekend'" class="tc-deliver-row">
      <span v-if="deliveryPreview(task)" class="lv-badge" :class="`lv${deliveryPreview(task)}`">
        予告 Lv{{ deliveryPreview(task) }}
      </span>
      <button
        class="deliver-btn"
        :disabled="!!deliverBlock"
        :title="deliverBlock ?? '納品する'"
        @click="deliver"
      >
        📦 納品
      </button>
    </div>

    <div v-if="canReplan" class="tc-replan-row">
      <span class="tc-label">予定</span>
      <button
        :class="{ on: task.plannedWeek === null }"
        title="Backlog に戻す"
        @click="moveTo(null)"
      >
        BL
      </button>
      <button
        v-for="w in weeks"
        :key="w"
        :class="{ on: task.plannedWeek === w }"
        :title="`第${w}週に予定する`"
        @click="moveTo(w)"
      >
        {{ w }}
      </button>
      <button class="tc-drop-btn" title="このタスクを見送る(積んだ人日は失われます)" @click="dropTask">
        🗑
      </button>
    </div>

    <div v-if="isInterrupt" class="tc-decline-row">
      <button
        class="decline-btn"
        :disabled="!!state.pendingEvent"
        :title="`謝絶:即時 CS-${state.config.declineCs}(あふれ CS-${state.config.overflowCs} より安く、選んで断れます)`"
        @click="declineInterrupt"
      >
        🙇 PM 謝絶(CS-{{ state.config.declineCs }})
      </button>
    </div>
  </div>
</template>
