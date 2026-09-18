import { computed, shallowRef } from 'vue'
import {
  allocateV7Learning,
  allocateV7Workdays,
  assignV7Lead,
  assignV7Support,
  createV7State,
  extinguishV7Fire,
  investigateV7Incident,
  isRuleViolation,
  planV7Task,
  resolveV7Incident,
  resolveV7Week,
  scheduleV7Handoff,
  triggerV7Event,
  urgentV7Handoff,
  type V7EventDefinition,
  type RuleViolation,
  type V7State,
  type V7TaskDefinition,
} from '@smart-project/engine'

const tasks: V7TaskDefinition[] = [
  { id: 'interview', name: 'ユーザーインタビュー', slotId: 'requirements', skill: 'direction', effort: 4, prerequisiteSlotIds: [], quality: 2 },
  { id: 'survey', name: '短期アンケート', slotId: 'requirements', skill: 'direction', effort: 3, prerequisiteSlotIds: [], quality: 1 },
  { id: 'prototype', name: '検証プロトタイプ', slotId: 'design', skill: 'design', effort: 5, prerequisiteSlotIds: ['requirements'], quality: 2 },
  { id: 'quick-design', name: 'クイックデザイン', slotId: 'design', skill: 'design', effort: 3, prerequisiteSlotIds: ['requirements'], quality: 1 },
  { id: 'components', name: '共通コンポーネント', slotId: 'build', skill: 'engineering', effort: 5, prerequisiteSlotIds: ['design'], quality: 2 },
  { id: 'direct-build', name: '直接実装', slotId: 'build', skill: 'engineering', effort: 3, prerequisiteSlotIds: ['design'], quality: 1 },
]

const events: V7EventDefinition[] = [
  { id: 'sick', name: '担当者が体調不良', source: 'personal', tone: 'bad', fire: 1, investigationRequired: 1, resolutionRequired: 1, spreadTarget: 'same_lead' },
  { id: 'server', name: '検証サーバー障害', source: 'personal', tone: 'bad', fire: 1, investigationRequired: 1, resolutionRequired: 2, spreadTarget: 'dependents' },
  { id: 'thanks', name: '顧客から感謝', source: 'personal', tone: 'good', capacityDelta: 1 },
  { id: 'change', name: '全体仕様変更', source: 'project', tone: 'bad', fire: 2, investigationRequired: 2, resolutionRequired: 2, spreadTarget: 'same_skill' },
]

function initial(): V7State {
  return createV7State({
    players: [
      { id: 'a', name: '青木', skills: { direction: 2, design: 1, engineering: 1 } },
      { id: 'b', name: '星野', skills: { direction: 1, design: 2, engineering: 1 } },
      { id: 'c', name: '工藤', skills: { direction: 1, design: 1, engineering: 2 } },
      { id: 'd', name: '森', skills: { direction: 1, design: 1, engineering: 1 } },
    ],
    slots: [
      { id: 'requirements', name: '要件合意' },
      { id: 'design', name: '体験設計' },
      { id: 'build', name: '動く成果物' },
    ],
    tasks,
  })
}

const state = shallowRef(initial())
const notice = shallowRef('タスク候補から各成果物の作り方を選んでください。')
let eventIndex = 0

export function useV7Game() {
  function commit(result: V7State | RuleViolation): boolean {
    if (isRuleViolation(result)) {
      notice.value = `⚠ ${result.message}`
      return false
    }
    state.value = result
    notice.value = '反映しました。'
    return true
  }
  const taskOf = (id: string) => tasks.find((task) => task.id === id)
  const usedDays = (playerId: string) => state.value.allocations.filter((a) => a.playerId === playerId).reduce((sum, a) => sum + a.days, 0)
  const candidatesFor = (slotId: string) => tasks.filter((task) => task.slotId === slotId)
  const boardTask = (id: string) => state.value.board.find((task) => task.taskId === id)
  function plan(taskId: string) { commit(planV7Task(state.value, taskId)) }
  function lead(playerId: string, taskId: string) { commit(assignV7Lead(state.value, playerId, taskId)) }
  function support(playerId: string, taskId: string) { commit(assignV7Support(state.value, playerId, taskId)) }
  function work(playerId: string, taskId: string) { commit(allocateV7Workdays(state.value, playerId, taskId, 1)) }
  function learn(playerId: string) { commit(allocateV7Learning(state.value, playerId, 1)) }
  function urgent(playerId: string, taskId: string) { commit(urgentV7Handoff(state.value, { taskId, role: 'lead', toPlayerId: playerId })) }
  function handoff(playerId: string, taskId: string) {
    const fromPlayerId = boardTask(taskId)?.leadPlayerId
    if (!fromPlayerId) { notice.value = '⚠ 主担当が未定です。'; return }
    commit(scheduleV7Handoff(state.value, { taskId, role: 'lead', fromPlayerId, toPlayerId: playerId }))
  }
  function investigate(incidentId: string, playerId: string) { commit(investigateV7Incident(state.value, incidentId, playerId)) }
  function resolveIncident(incidentId: string, playerId: string) { commit(resolveV7Incident(state.value, incidentId, playerId)) }
  function extinguish(taskId: string, playerId: string) { commit(extinguishV7Fire(state.value, taskId, playerId)) }
  function drawEvent(source: 'personal' | 'project', playerId?: string) {
    const pool = events.filter((event) => event.source === source)
    const event = pool[eventIndex++ % pool.length]!
    const target = state.value.board.find((task) => task.status !== 'completed')
    commit(triggerV7Event(state.value, event, { taskId: target?.taskId, playerId }))
  }
  function nextWeek() {
    state.value = resolveV7Week(state.value)
    notice.value = state.value.phase > 2 ? '2フェーズの試作が終了しました。ログと指標を確認してください。' : '週末処理を行いました。'
  }
  function reset() { state.value = initial(); notice.value = 'ゲームをリセットしました。'; eventIndex = 0 }
  return {
    state, notice, tasks, events, taskOf, usedDays, candidatesFor, boardTask,
    remainingDays: (playerId: string) => state.value.players.find((p) => p.id === playerId)!.workdayCapacity - usedDays(playerId),
    gameFinished: computed(() => state.value.phase > 2),
    plan, lead, support, work, learn, handoff, urgent, investigate, resolveIncident, extinguish, drawEvent, nextWeek, reset,
  }
}
