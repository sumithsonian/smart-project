<script setup lang="ts">
/**
 * WBSボード(rules-v4-core.md §1-1・§1-2・§0):盤上タスクをレーン別に表示する。
 * - scope_meeting: 参照表示のみ
 * - standup: クリックで配属対象(座る/消火)として選択
 * - weekend: 納品可能なタスクに「納品」ボタン(予告Lv表示)
 */
import { computed } from 'vue'
import type { BoardTask, Lane } from '@smart-project/engine'

const {
  state,
  dispatch,
  taskCard,
  displayTaskName,
  requiredCubesOf,
  deliveryPreview,
  taskAssignees,
  boardByLane,
  playerColor,
  playerName,
  selectedTarget,
  laneLabels,
  skillColors,
  skillShortLabels,
} = useGame()

const lanes: Array<Lane | 'interrupt'> = ['start', 'middle', 'finish', 'interrupt']

/** 差し込みタスクの人日ドット色(系統なし=総合対応力) */
const INTERRUPT_COLOR = '#64748b'

/** タスクの系統カラー(通常タスクはカード系統、差し込みは中立色) */
function taskColor(t: BoardTask): string {
  if (!t.interrupt) {
    const card = taskCard(t.cardId)
    if (card) return skillColors[card.skill]
  }
  return INTERRUPT_COLOR
}

/** 人日ドット1個のスタイル(消化済み=系統カラー塗り / 🔥ぶん=赤 / 残り=空) */
function dayDotStyle(t: BoardTask, i: number): Record<string, string> {
  const needed = requiredCubesOf(t)
  const isFire = t.fire > 0 && i > needed - t.fire
  if (isFire) return {} // 🔥ドットは CSS(.burning)で赤表示
  if (i <= t.cubes) return { background: taskColor(t), borderColor: taskColor(t) }
  return {}
}

/** 残り人日(バーンダウン)。負にはしない */
function remainingDays(t: BoardTask): number {
  return Math.max(0, requiredCubesOf(t) - t.cubes)
}

const visibleLanes = computed(() =>
  lanes
    .map((lane) => ({ lane, tasks: boardByLane(lane) }))
    .filter((l) => l.tasks.length > 0 || l.lane !== 'interrupt'),
)

function selectable(): boolean {
  return state.value.step === 'standup'
}
function select(cardId: string) {
  if (!selectable()) return
  const cur = selectedTarget.value
  selectedTarget.value = cur && cur.kind === 'task' && cur.cardId === cardId ? null : { kind: 'task', cardId }
}

function canDeliver(task: BoardTask): boolean {
  if (state.value.step !== 'weekend') return false
  const needed = requiredCubesOf(task)
  if (task.cubes < needed) return false
  if (!task.interrupt) {
    const card = taskCard(task.cardId)
    if (!card) return false
    if (state.value.budget < card.cost) return false
  }
  return true
}
function deliver(cardId: string) {
  dispatch({ type: 'DELIVER_TASK', cardId })
}
</script>

<template>
  <section class="panel">
    <h2>WBSボード <span class="muted">列の文法:起点 → 中盤 → 仕上げ(差し込みは列外)</span></h2>
    <div class="lanes">
      <div v-for="l in visibleLanes" :key="l.lane" class="lane">
        <div class="lane-head">{{ laneLabels[l.lane] }}</div>
        <div
          v-for="t in l.tasks"
          :key="t.cardId"
          class="tile"
          :class="{
            selected: selectedTarget?.kind === 'task' && selectedTarget.cardId === t.cardId,
            'not-clickable': !selectable(),
          }"
          @click="select(t.cardId)"
        >
          <div class="tile-head">
            <strong>{{ displayTaskName(t) }}</strong>
            <span v-if="t.fire > 0" class="fire-badge">🔥×{{ t.fire }}</span>
          </div>

          <div class="tile-cost-row">
            <span class="pip-row" title="消化済み(塗り)/ 残り(空)の人日バーンダウン。🔥ぶんは赤">
              <span
                v-for="i in requiredCubesOf(t)"
                :key="i"
                class="pip"
                :class="{ filled: i <= t.cubes, burning: t.fire > 0 && i > requiredCubesOf(t) - t.fire }"
                :style="dayDotStyle(t, i)"
              />
            </span>
            <span class="muted">残り{{ remainingDays(t) }}人日 / 必要{{ requiredCubesOf(t) }}人日</span>
          </div>

          <div class="tile-meta">
            <template v-if="!t.interrupt && taskCard(t.cardId)">
              <span
                class="skill-chip"
                :style="{ background: skillColors[taskCard(t.cardId)!.skill] }"
              >{{ skillShortLabels[taskCard(t.cardId)!.skill] }}</span>
              <span class="badge">上限Lv{{ taskCard(t.cardId)!.maxLevel }}</span>
              <span class="badge">💰{{ taskCard(t.cardId)!.cost }}</span>
              <span class="badge">😓{{ taskCard(t.cardId)!.fatigue }}</span>
            </template>
            <span v-else class="badge interrupt">差し込み(人日{{ t.interruptEffort }})</span>
          </div>

          <div v-if="taskAssignees(t.cardId).length" class="tile-tokens">
            <span
              v-for="a in taskAssignees(t.cardId)"
              :key="a.playerId + String(a.overtime)"
              class="token-chip"
              :class="{ overtime: a.overtime }"
              :style="{ background: playerColor(a.playerId) }"
            >
              {{ playerName(a.playerId).slice(0, 6) }}{{ a.overtime ? '(残業)' : '' }}
            </span>
          </div>

          <div v-if="state.step === 'weekend'" class="row" style="margin-top: 6px">
            <span v-if="deliveryPreview(t)" class="deliverable" :class="`lv${deliveryPreview(t)}`">
              予告 Lv{{ deliveryPreview(t) }}
            </span>
            <button class="primary" :disabled="!canDeliver(t)" @click.stop="deliver(t.cardId)">📦 納品</button>
          </div>
        </div>
        <p v-if="l.tasks.length === 0" class="muted">(タスクなし)</p>
      </div>
    </div>
  </section>
</template>
