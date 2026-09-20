<script setup lang="ts">
import type { V7BoardTask, V7DeliverableSlot, V7Player, V7TaskDefinition, V7WorkAllocation } from '@smart-project/engine'

const props = defineProps<{
  task: V7TaskDefinition
  boardTask?: V7BoardTask
  players: V7Player[]
  slots: V7DeliverableSlot[]
  allocations: V7WorkAllocation[]
  selectedPlayerId: string
  remainingDays: number
}>()

const emit = defineEmits<{
  plan: [taskId: string]
  unplan: [taskId: string]
  lead: [playerId: string, taskId: string]
  support: [playerId: string, taskId: string]
  allocate: [playerId: string, taskId: string, days: number]
}>()

const assignDays = ref(1)
const skillIcon = { direction: '📋', design: '🎨', engineering: '⚙' }
const skillName = { direction: 'ディレクション', design: 'デザイン', engineering: 'エンジニアリング' }
const colors: Record<string, string> = { a: '#3478b9', b: '#d49a2e', c: '#bd4f4f', d: '#5b9b65' }
const selectedPlayer = computed(() => props.players.find((player) => player.id === props.selectedPlayerId))
const selectedHasRole = computed(() =>
  props.boardTask?.leadPlayerId === props.selectedPlayerId || props.boardTask?.supportPlayerId === props.selectedPlayerId,
)
const selectedCanLead = computed(() =>
  (selectedPlayer.value?.skills[props.task.skill] ?? 0) >= (props.task.requiredSkillLevel ?? 1),
)
const prerequisitesMet = computed(() => props.task.prerequisiteSlotIds.every(
  (id) => props.slots.find((slot) => slot.id === id)?.completedByTaskId,
))
const prerequisiteNames = computed(() => props.task.prerequisiteSlotIds.map(
  (id) => props.slots.find((slot) => slot.id === id)?.name ?? id,
))
const currentAllocations = computed(() => props.allocations.filter(
  (allocation) => allocation.taskId === props.task.id && allocation.kind === 'work',
))
const effortTokens = computed(() => {
  const tokens: Array<{ color: string; label: string }> = []
  for (let index = 0; index < (props.boardTask?.progress ?? 0); index++) tokens.push({ color: '#68736d', label: '済' })
  for (const allocation of currentAllocations.value) {
    const player = props.players.find((candidate) => candidate.id === allocation.playerId)
    for (let index = 0; index < allocation.days; index++) {
      tokens.push({ color: colors[allocation.playerId] ?? '#555', label: player?.name.slice(0, 1) ?? '' })
    }
  }
  return Array.from({ length: props.task.effort }, (_, index) => tokens[index] ?? null)
})
const maxAssignable = computed(() => Math.max(0, Math.min(props.remainingDays, props.task.effort)))
watch(maxAssignable, (value) => { if (assignDays.value > value) assignDays.value = Math.max(1, value) })
</script>

<template>
  <article :class="['task-tile', { planned: boardTask, locked: boardTask && !prerequisitesMet, complete: boardTask?.status === 'completed' }]">
    <header>
      <span class="discipline">{{ skillIcon[task.skill] }}</span>
      <div><strong>{{ task.name }}</strong><small>{{ slots.find(slot => slot.id === task.slotId)?.name }}</small></div>
      <b>Lv{{ task.quality ?? 1 }}</b>
    </header>

    <div class="requirements">
      <span :title="skillName[task.skill]">{{ skillIcon[task.skill] }} Lv{{ task.requiredSkillLevel ?? 1 }}</span>
      <span>💴 {{ task.cost ?? 0 }}</span><span>😓 {{ task.fatigue ?? 1 }}</span>
    </div>

    <div class="prerequisites">
      <b>前提</b>
      <span v-if="prerequisiteNames.length === 0" class="open">なし・すぐ着手可</span>
      <span v-for="name in prerequisiteNames" v-else :key="name" :class="{ met: prerequisitesMet }">{{ prerequisitesMet ? '✓' : '🔒' }} {{ name }}</span>
    </div>

    <div class="effort">
      <div><b>{{ task.effort }}人日</b><small>1枠＝1人日</small></div>
      <div class="effort-slots">
        <i v-for="(token, index) in effortTokens" :key="index" :class="{ filled: token }" :style="token ? { background: token.color } : undefined">{{ token?.label }}</i>
      </div>
    </div>

    <template v-if="!boardTask">
      <button class="plan-button" @click="emit('plan', task.id)">＋ 計画へ採用</button>
    </template>
    <template v-else>
      <div class="roles"><span>主：{{ players.find(player => player.id === boardTask?.leadPlayerId)?.name ?? '未定' }}</span><span>副：{{ players.find(player => player.id === boardTask?.supportPlayerId)?.name ?? '未定' }}</span></div>
      <button v-if="!boardTask.leadPlayerId" class="lead-button" :disabled="!selectedCanLead" @click="emit('lead', selectedPlayerId, task.id)">{{ selectedPlayer?.name }}を主担当にする<span v-if="!selectedCanLead">（スキル不足）</span></button>
      <div v-else-if="boardTask.status !== 'completed'" class="assignment-controls">
        <template v-if="selectedHasRole">
          <div class="day-choice"><button v-for="day in maxAssignable" :key="day" :class="{ active: assignDays === day }" @click="assignDays = day">{{ day }}</button></div>
          <button class="assign-button" :disabled="!prerequisitesMet || maxAssignable === 0 || boardTask.fire > 0" @click="emit('allocate', selectedPlayerId, task.id, assignDays)">{{ selectedPlayer?.name }}を{{ assignDays }}人日アサイン</button>
        </template>
        <button v-else-if="!boardTask.supportPlayerId" class="support-button" @click="emit('support', selectedPlayerId, task.id)">{{ selectedPlayer?.name }}を副担当にする</button>
        <small v-if="!prerequisitesMet">🔒 前提成果物の完成後に着手できます</small>
      </div>
      <button v-if="!boardTask.leadPlayerId && boardTask.progress === 0" class="return-button" @click="emit('unplan', task.id)">市場へ戻す</button>
      <div v-if="boardTask.status === 'completed'" class="complete-label">✓ 完成</div>
    </template>
  </article>
</template>

<style scoped>
.task-tile{background:#eee6d3;color:#292820;border:2px solid #9b8f76;border-radius:5px;box-shadow:3px 4px 0 #0003;padding:9px;display:grid;gap:7px;min-width:0;position:relative}.task-tile:before{content:'';position:absolute;inset:3px;border:1px solid #c9bfa9;pointer-events:none}.task-tile.planned{background:#f8f2e4;border-color:#c3942c}.task-tile.locked{background:#ddd8cc;border-color:#877f72}.task-tile.complete{background:#dce9db;border-color:#628269}.task-tile header{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:7px;border-bottom:1px solid #bdb29d;padding-bottom:6px;z-index:1}.discipline{width:28px;height:28px;display:grid;place-items:center;background:#283e35;border-radius:3px}.task-tile header div{display:grid}.task-tile header strong{font-size:12px}.task-tile header small{font-size:8px;color:#706b60}.task-tile header>b{font-size:9px;border:1px solid #9c8c69;border-radius:50%;width:28px;height:28px;display:grid;place-items:center}.requirements{display:flex;gap:5px}.requirements span{font-size:9px;background:#d8cfbc;border-radius:3px;padding:3px 5px;font-weight:700}.prerequisites{display:flex;align-items:center;gap:4px;min-height:19px}.prerequisites b{font-size:8px}.prerequisites span{font-size:8px;background:#b9afa0;color:#4b4740;padding:3px 5px;border-radius:3px}.prerequisites span.open,.prerequisites span.met{background:#c9dfcc;color:#315b3b}.effort{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:8px}.effort>div:first-child{display:grid}.effort b{font-size:12px}.effort small{font-size:7px;color:#777}.effort-slots{display:flex;gap:4px;flex-wrap:wrap}.effort-slots i{width:22px;height:22px;border:2px inset #c5bba6;background:#ded6c5;display:grid;place-items:center;font-style:normal;font-size:8px;color:white;text-shadow:0 1px #0008}.effort-slots i.filled{border-style:outset;box-shadow:1px 2px 2px #0004}.roles{display:flex;justify-content:space-between;font-size:8px;background:#ded5c2;padding:4px 6px}.task-tile button{position:relative;border:1px solid #837864;border-radius:4px;padding:6px;background:#fffaf0;color:#292820;font-size:9px;cursor:pointer}.plan-button,.lead-button,.assign-button{background:#315c49!important;color:white!important;font-weight:800}.assignment-controls{display:grid;gap:5px}.day-choice{display:flex;gap:3px}.day-choice button{flex:1;padding:4px}.day-choice button.active{background:#d3a434;color:#251c09;font-weight:900}.assignment-controls small{font-size:8px;color:#854137}.return-button{border:0!important;background:transparent!important;text-decoration:underline}.complete-label{text-align:center;background:#4f805c;color:white;padding:6px;font-size:10px;font-weight:900}
.task-tile button:disabled{opacity:.45;cursor:not-allowed}.lead-button span{display:block;font-size:7px}
</style>
