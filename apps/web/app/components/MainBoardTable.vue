<script setup lang="ts">
/**
 * メインボード(計画ボード & スコア。RULES.md §5・§8)。
 * CS/予算トラック、フェーズ・週トラック、3週ローリング計画ボード、割り込みレーン、休憩/学習デスク。
 * v4 の「起点・中盤・仕上げ」レーンは廃止し、計画ボード(PlanBoardTable)+ 依存関係に置き換えた。
 */
const {
  state,
  dispatch,
  interruptTasks,
  assignmentsForTarget,
  playerColor,
  playerName,
  skillIcons,
  skillLabels,
  selectedMeeple,
  canPlaceAt,
  placeSelectedAt,
  previewForSelected,
} = useGame()
const { hoverZoneKey } = useTableDrag()

const CS_MAX = 10
const BUDGET_MAX = 20
const CS_PITCH = 23
const BUDGET_PITCH = 22

const csClamped = computed(() => Math.max(0, Math.min(CS_MAX, state.value.cs)))
const csMarkerLeft = computed(() => (csClamped.value + 1) * CS_PITCH + CS_PITCH / 2)
const budgetClamped = computed(() => Math.max(0, Math.min(BUDGET_MAX, state.value.budget)))
const budgetMarkerTop = computed(() => budgetClamped.value * BUDGET_PITCH + BUDGET_PITCH / 2)

const interruptEmptyCount = computed(() =>
  Math.max(0, state.value.config.interruptCapacity - interruptTasks.value.length),
)

const canAssignNow = computed(() => state.value.step === 'standup' && !state.value.pendingEvent)

const extraBillingLeft = computed(
  () => state.value.config.extraBillingPerPhase - state.value.extraBillingUsedThisPhase,
)
function extraBilling() {
  dispatch({ type: 'EXTRA_BILLING', playerId: state.value.pmPlayerId })
}

const skills = ['direction', 'design', 'engineering'] as const

const restTarget = { kind: 'rest' } as const
function learnTarget(skill: (typeof skills)[number]) {
  return { kind: 'learn', skill } as const
}
</script>

<template>
  <div class="board main-board">
    <div class="board-title">
      メインボード — 計画 &amp; スコア
      <span class="board-sub">工程の順序は依存関係、時期の組み立ては計画ボードが担います</span>
    </div>

    <div class="main-cs-strip">
      <div class="rail-label">
        <span>CS(顧客満足)トラック</span><span>CS {{ state.cs }}</span>
      </div>
      <div class="track-row">
        <span class="tcell skull">☠</span>
        <span v-for="i in CS_MAX + 1" :key="i - 1" class="tcell">{{ i - 1 }}</span>
        <div class="marker cs" :style="{ left: csMarkerLeft + 'px' }" />
      </div>
    </div>

    <div class="main-body">
      <div class="main-content">
        <PlanBoardTable />

        <div class="interrupt-strip">
          <span class="interrupt-label">
            割り込みレーン{{ '\n' }}({{ state.config.interruptCapacity }}枠・満杯であふれると CS-{{
              state.config.overflowCs
            }})
          </span>
          <div class="interrupt-cards-row">
            <TaskCardTable v-for="t in interruptTasks" :key="t.cardId" :card-id="t.cardId" />
            <div
              v-for="i in interruptEmptyCount"
              :key="'empty' + i"
              class="card-slot-empty interrupt small"
            >
              割り込みカードを{{ '\n' }}ここに置く
            </div>
          </div>
        </div>

        <div class="rest-study-row">
          <div
            class="amenity"
            :class="{
              'dropzone-active': canAssignNow,
              'dz-glow': hoverZoneKey === 'rest',
              'dz-clickable': !!selectedMeeple && canPlaceAt(restTarget).ok,
            }"
            :data-dropzone-key="canAssignNow ? 'rest' : undefined"
            @click="selectedMeeple && placeSelectedAt(restTarget)"
          >
            <span class="amenity-icon">🛋</span>
            <div class="amenity-title">
              休憩ラウンジ<span class="muted amenity-note"> 疲労-{{ state.config.restRecovery }}</span>
            </div>
            <div class="footprint-row">
              <MeepleToken
                v-for="a in assignmentsForTarget(restTarget)"
                :key="a.playerId"
                :player-id="a.playerId"
                :color="playerColor(a.playerId)"
                :draggable="canAssignNow && !state.readyPlayerIds.includes(a.playerId)"
                :title="playerName(a.playerId)"
              />
              <span v-if="assignmentsForTarget(restTarget).length === 0" class="footprint">
                <span class="fp-mark">👣</span>
              </span>
            </div>
            <PreviewChip
              v-if="selectedMeeple && canPlaceAt(restTarget).ok"
              :preview="previewForSelected(restTarget)!"
            />
          </div>

          <div
            v-for="skill in skills"
            :key="skill"
            class="amenity"
            :class="{
              'dropzone-active': canAssignNow,
              'dz-glow': hoverZoneKey === 'learn:' + skill,
              'dz-clickable': !!selectedMeeple && canPlaceAt(learnTarget(skill)).ok,
            }"
            :data-dropzone-key="canAssignNow ? 'learn:' + skill : undefined"
            @click="selectedMeeple && placeSelectedAt(learnTarget(skill))"
          >
            <span class="amenity-icon">{{ skillIcons[skill] }}</span>
            <div class="amenity-title">学習デスク・{{ skillLabels[skill] }}</div>
            <div class="footprint-row">
              <MeepleToken
                v-for="a in assignmentsForTarget(learnTarget(skill))"
                :key="a.playerId"
                :player-id="a.playerId"
                :color="playerColor(a.playerId)"
                :draggable="canAssignNow && !state.readyPlayerIds.includes(a.playerId)"
                :title="playerName(a.playerId)"
              />
              <span v-if="assignmentsForTarget(learnTarget(skill)).length === 0" class="footprint">
                <span class="fp-mark">👣</span>
              </span>
            </div>
            <PreviewChip
              v-if="selectedMeeple && canPlaceAt(learnTarget(skill)).ok"
              :preview="previewForSelected(learnTarget(skill))!"
            />
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
            💴 追加請求(予算+{{ state.config.extraBillingBudget }}/CS-{{
              state.config.extraBillingCsCost
            }})
          </button>
        </div>
        <div class="rail-block rail-legend">
          <div class="rail-label">凡例</div>
          <div class="legend-list">
            <div>🔥 = 必要人日+1</div>
            <div>🔒 = 前提未達でブロック中</div>
            <div>👣 = コマを置く</div>
            <div>□ = 人日キューブ置き場</div>
            <div>⚠ = 品質リスクあり(Lv1)</div>
            <div>🥈銀=Lv1 ／ 🥇金=Lv2</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
