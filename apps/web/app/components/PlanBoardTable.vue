<script setup lang="ts">
/**
 * ローリング計画ボード(RULES.md §5)。
 * Backlog / 第1週 / …(roundsPerPhase) の列にタスクを置き、週ごとの
 * 系統別「予定工数 / 供給能力」を表示する。過負荷は警告するが配置は許可する。
 *
 * 再計画(MOVE_TASK / DROP_TASK)ができるのはスコープ会議中と週末のみ(RULES.md §5-3)。
 */
const { state, loadOfWeek, plannedTasks, skillIcons, skillColors, skillLabels } = useGame()

const weeks = computed(() =>
  Array.from({ length: state.value.config.roundsPerPhase }, (_, i) => i + 1),
)
const canReplan = computed(
  () =>
    (state.value.step === 'scope_meeting' || state.value.step === 'weekend') &&
    !state.value.pendingEvent,
)
const skills = ['direction', 'design', 'engineering'] as const
</script>

<template>
  <div class="plan-board">
    <div class="plan-header">
      <span class="plan-title">3週間のローリング計画</span>
      <span class="plan-hint">
        朝会で座れるのは<b>今週の予定</b>だけ。再計画は<b>スコープ会議と週末</b>にできます
      </span>
      <span v-if="canReplan" class="plan-flag open">再計画できます</span>
      <span v-else class="plan-flag locked">今週の計画は確定しています</span>
    </div>

    <div class="plan-columns">
      <!-- Backlog -->
      <div class="plan-col backlog">
        <div class="plan-col-head">
          <span class="plan-col-name">Backlog</span>
          <span class="plan-col-sub">週を決めていない</span>
        </div>
        <div class="plan-col-body">
          <TaskCardTable v-for="t in plannedTasks(null)" :key="t.cardId" :card-id="t.cardId" />
          <div v-if="plannedTasks(null).length === 0" class="card-slot-empty">
            まだ週を決めていない{{ '\n' }}タスクの置き場
          </div>
        </div>
      </div>

      <!-- 各週 -->
      <div
        v-for="w in weeks"
        :key="w"
        class="plan-col week"
        :class="{ current: w === state.week, past: state.week > w }"
      >
        <div class="plan-col-head">
          <span class="plan-col-name">第{{ w }}週</span>
          <span v-if="w === state.week" class="plan-col-badge">今週</span>
        </div>

        <div class="plan-capacity">
          <div
            v-for="skill in skills"
            :key="skill"
            class="cap-row"
            :class="{ over: loadOfWeek(w).planned[skill] > loadOfWeek(w).capacity[skill] }"
            :title="`${skillLabels[skill]}:予定${loadOfWeek(w).planned[skill]}人日 / 能力${loadOfWeek(w).capacity[skill]}人日`"
          >
            <span class="cap-icon" :style="{ color: skillColors[skill] }">{{ skillIcons[skill] }}</span>
            <span class="cap-nums">
              予定{{ loadOfWeek(w).planned[skill] }} / 能力{{ loadOfWeek(w).capacity[skill] }}
            </span>
            <span
              v-if="loadOfWeek(w).planned[skill] > loadOfWeek(w).capacity[skill]"
              class="cap-warn"
              >⚠過負荷</span
            >
          </div>
        </div>

        <div class="plan-col-body">
          <TaskCardTable v-for="t in plannedTasks(w)" :key="t.cardId" :card-id="t.cardId" />
          <div v-if="plannedTasks(w).length === 0" class="card-slot-empty">
            この週にやるタスクを{{ '\n' }}ここに置く
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
