<script setup lang="ts">
/**
 * メインボード(WBS & スコア一体。rules-v4-core.md §0・§1)。
 * CS/予算トラック、フェーズ・週トラック、起点/中盤/仕上げレーン、差込レーン、休憩/学習デスク。
 */
const { state, dispatch, boardByLane } = useGame()
const { hoverZoneKey } = useTableDrag()

const CS_MAX = 10
const BUDGET_MAX = 20
const CS_PITCH = 23
const BUDGET_PITCH = 22

const csClamped = computed(() => Math.max(0, Math.min(CS_MAX, state.value.cs)))
const csMarkerLeft = computed(() => (csClamped.value + 1) * CS_PITCH + CS_PITCH / 2)
const budgetClamped = computed(() => Math.max(0, Math.min(BUDGET_MAX, state.value.budget)))
const budgetMarkerTop = computed(() => budgetClamped.value * BUDGET_PITCH + BUDGET_PITCH / 2)

const lanes = ['start', 'middle', 'finish'] as const
const interruptTasks = computed(() => boardByLane('interrupt'))
const interruptEmptyCount = computed(() =>
  Math.max(0, state.value.config.interruptCapacity - interruptTasks.value.length),
)

const canAssignNow = computed(() => state.value.step === 'standup' && !state.value.pendingEvent)

function amenityGlow(zoneKey: string) {
  return hoverZoneKey.value === zoneKey
}

const extraBillingLeft = computed(
  () => state.value.config.extraBillingPerPhase - state.value.extraBillingUsedThisPhase,
)
function extraBilling() {
  dispatch({ type: 'EXTRA_BILLING', playerId: state.value.pmPlayerId })
}

const { assignmentsForTarget, playerColor, playerName } = useGame()
</script>

<template>
  <div class="board main-board">
    <div class="board-title">
      メインボード — WBS &amp; スコア
      <span class="board-sub">列の文法:起点 → 中盤 → 仕上げ(差込は列外)</span>
    </div>

    <div class="main-cs-strip">
      <div class="rail-label"><span>CS(顧客満足)トラック</span><span>CS {{ state.cs }}</span></div>
      <div class="track-row">
        <span class="tcell skull">☠</span>
        <span v-for="i in CS_MAX + 1" :key="i - 1" class="tcell">{{ i - 1 }}</span>
        <div class="marker cs" :style="{ left: csMarkerLeft + 'px' }" />
      </div>
    </div>

    <div class="main-body">
      <div class="main-content">
        <div class="lane-headers">
          <div class="lane-h">起点</div>
          <span class="lane-arrow">▶</span>
          <div class="lane-h">中盤</div>
          <span class="lane-arrow">▶</span>
          <div class="lane-h">仕上げ</div>
        </div>
        <div class="lane-subcaption">前の列にタスクが1枚以上あれば配置可(カードは動かない=計画表)</div>
        <div class="lanes">
          <div v-for="lane in lanes" :key="lane" class="lane-col" :class="lane">
            <TaskCardTable v-for="t in boardByLane(lane)" :key="t.cardId" :card-id="t.cardId" />
            <div class="card-slot-empty">タスクカードを{{ '\n' }}ここに置く</div>
          </div>
        </div>

        <div class="interrupt-strip">
          <span class="interrupt-label">差込レーン{{ '\n' }}(列文法の外・{{ state.config.interruptCapacity }}枠)</span>
          <div class="interrupt-cards-row">
            <TaskCardTable v-for="t in interruptTasks" :key="t.cardId" :card-id="t.cardId" />
            <div v-for="i in interruptEmptyCount" :key="'empty' + i" class="card-slot-empty interrupt small">
              差込カードを{{ '\n' }}ここに置く
            </div>
          </div>
        </div>

        <div class="rest-study-row">
          <div
            class="amenity"
            :class="{ 'dropzone-active': canAssignNow, 'dz-glow': amenityGlow('rest') }"
            :data-dropzone-key="canAssignNow ? 'rest' : undefined"
          >
            <span class="amenity-icon">🛋</span>
            <div class="amenity-title">休憩ラウンジ<span class="muted" style="font-size:9px;font-weight:600"> 疲労-{{ state.config.restRecovery }}</span></div>
            <div class="footprint-row">
              <MeepleToken
                v-for="a in assignmentsForTarget({ kind: 'rest' })"
                :key="a.playerId"
                :player-id="a.playerId"
                :color="playerColor(a.playerId)"
                :draggable="canAssignNow && !state.readyPlayerIds.includes(a.playerId)"
                :title="playerName(a.playerId)"
              />
              <span v-if="assignmentsForTarget({ kind: 'rest' }).length === 0" class="footprint"><span class="fp-mark">👣</span></span>
            </div>
          </div>
          <div
            v-for="skill in (['direction', 'design', 'engineering'] as const)"
            :key="skill"
            class="amenity"
            :class="{ 'dropzone-active': canAssignNow, 'dz-glow': amenityGlow('learn:' + skill) }"
            :data-dropzone-key="canAssignNow ? 'learn:' + skill : undefined"
          >
            <span class="amenity-icon">{{ skill === 'direction' ? '📋' : skill === 'design' ? '🎨' : '⚙' }}</span>
            <div class="amenity-title" :style="{ color: `var(--${skill === 'direction' ? 'dir' : skill === 'design' ? 'des' : 'eng'})` }">
              学習デスク・{{ skill === 'direction' ? 'ディレクション' : skill === 'design' ? 'デザイン' : 'エンジニアリング' }}
            </div>
            <div class="footprint-row">
              <MeepleToken
                v-for="a in assignmentsForTarget({ kind: 'learn', skill })"
                :key="a.playerId"
                :player-id="a.playerId"
                :color="playerColor(a.playerId)"
                :draggable="canAssignNow && !state.readyPlayerIds.includes(a.playerId)"
                :title="playerName(a.playerId)"
              />
              <span v-if="assignmentsForTarget({ kind: 'learn', skill }).length === 0" class="footprint"><span class="fp-mark">👣</span></span>
            </div>
          </div>
        </div>
      </div>

      <div class="main-rail">
        <div class="rail-block rail-phaseweek">
          <div class="rail-label">フェーズ</div>
          <div class="pw-cells">
            <span v-for="i in state.config.phases" :key="i" class="pw-cell recess-cell">
              <span v-if="i === state.phase" class="token-cube black" />
              <template v-else>{{ i }}</template>
            </span>
          </div>
          <div class="rail-label">週</div>
          <div class="pw-cells">
            <span v-for="i in state.config.roundsPerPhase" :key="i" class="pw-cell recess-cell">
              <span v-if="i === state.week" class="token-cube black" />
              <template v-else>{{ i }}</template>
            </span>
          </div>
        </div>
        <div class="rail-block rail-budget">
          <div class="rail-label">予算({{ state.budget }})</div>
          <div id="budget-track">
            <span v-for="i in BUDGET_MAX + 1" :key="i - 1" class="tcell">{{ i - 1 }}</span>
            <div class="marker budget" :style="{ top: budgetMarkerTop + 'px' }" />
          </div>
          <button
            class="rail-extra-billing"
            :disabled="extraBillingLeft <= 0 || !!state.pendingEvent"
            :title="`追加請求(PM・フェーズ${state.config.extraBillingPerPhase}回まで)`"
            @click="extraBilling"
          >
            💴 追加請求(予算+{{ state.config.extraBillingBudget }}/CS-{{ state.config.extraBillingCsCost }})
          </button>
        </div>
        <div class="rail-block rail-legend">
          <div class="rail-label">凡例</div>
          <div class="legend-list">
            <div>🔥 = 必要人日+1</div>
            <div>👣 = コマを置く</div>
            <div>□ = 人日キューブ置き場</div>
            <div>🤝約束 / ✅達成</div>
            <div>🔁 = 手戻り中</div>
            <div>🥈銀=Lv1 ／ 🥇金=Lv2</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
