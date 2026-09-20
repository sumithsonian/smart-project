import { computed, ref, shallowRef } from 'vue'
import {
  allocateV7Learning,
  allocateV7Rest,
  allocateV7Workdays,
  assignV7Lead,
  assignV7Support,
  createV7State,
  extinguishV7Fire,
  investigateV7Incident,
  isRuleViolation,
  planV7Task,
  unplanV7Task,
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
  { id: 'interview', name: 'ユーザーインタビュー', slotId: 'requirements', skill: 'direction', requiredSkillLevel: 2, effort: 4, prerequisiteSlotIds: [], quality: 2, cost: 2, fatigue: 1 },
  { id: 'analytics', name: 'アクセス解析', slotId: 'requirements', skill: 'direction', requiredSkillLevel: 1, effort: 3, prerequisiteSlotIds: [], quality: 1, cost: 1, fatigue: 1 },
  { id: 'stakeholder', name: '関係者ヒアリング', slotId: 'requirements', skill: 'direction', requiredSkillLevel: 2, effort: 3, prerequisiteSlotIds: [], quality: 2, cost: 1, fatigue: 2 },
  { id: 'inventory', name: 'コンテンツ棚卸し', slotId: 'requirements', skill: 'direction', requiredSkillLevel: 1, effort: 2, prerequisiteSlotIds: [], quality: 1, cost: 0, fatigue: 1 },
  { id: 'wireframe', name: 'ワイヤーフレーム', slotId: 'design', skill: 'design', requiredSkillLevel: 1, effort: 4, prerequisiteSlotIds: ['requirements'], quality: 1, cost: 1, fatigue: 1 },
  { id: 'prototype', name: '検証プロトタイプ', slotId: 'design', skill: 'design', requiredSkillLevel: 2, effort: 5, prerequisiteSlotIds: ['requirements'], quality: 2, cost: 3, fatigue: 2 },
  { id: 'design-system', name: 'デザインシステム', slotId: 'design', skill: 'design', requiredSkillLevel: 2, effort: 5, prerequisiteSlotIds: [], quality: 2, cost: 2, fatigue: 2 },
  { id: 'content-model', name: 'コンテンツモデル', slotId: 'design', skill: 'design', requiredSkillLevel: 1, effort: 3, prerequisiteSlotIds: ['requirements'], quality: 2, cost: 1, fatigue: 1 },
  { id: 'tech-spike', name: '技術検証', slotId: 'build', skill: 'engineering', requiredSkillLevel: 2, effort: 3, prerequisiteSlotIds: [], quality: 2, cost: 1, fatigue: 1 },
  { id: 'components', name: '共通コンポーネント', slotId: 'build', skill: 'engineering', requiredSkillLevel: 2, effort: 5, prerequisiteSlotIds: ['design'], quality: 2, cost: 3, fatigue: 2 },
  { id: 'direct-build', name: '直接実装', slotId: 'build', skill: 'engineering', requiredSkillLevel: 1, effort: 4, prerequisiteSlotIds: ['design'], quality: 1, cost: 1, fatigue: 2 },
  { id: 'cms-modeling', name: 'CMSモデリング', slotId: 'build', skill: 'engineering', requiredSkillLevel: 1, effort: 3, prerequisiteSlotIds: ['requirements'], quality: 2, cost: 2, fatigue: 1 },
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
const personalEventsDrawn = ref<string[]>([])
const projectEventDrawnPhases = ref<number[]>([])
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
  function unplan(taskId: string) { commit(unplanV7Task(state.value, taskId)) }
  function lead(playerId: string, taskId: string) { commit(assignV7Lead(state.value, playerId, taskId)) }
  function support(playerId: string, taskId: string) { commit(assignV7Support(state.value, playerId, taskId)) }
  function work(playerId: string, taskId: string, days = 1) { commit(allocateV7Workdays(state.value, playerId, taskId, days)) }
  function learn(playerId: string) { commit(allocateV7Learning(state.value, playerId, 1)) }
  function rest(playerId: string) { commit(allocateV7Rest(state.value, playerId)) }
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
    if (source === 'personal' && playerId && personalEventsDrawn.value.includes(playerId)) {
      notice.value = '⚠ このメンバーは今週すでに個人イベントを引いています。'
      return
    }
    if (source === 'project' && projectEventDrawnPhases.value.includes(state.value.phase)) {
      notice.value = '⚠ このフェーズのプロジェクトイベントは解決済みです。'
      return
    }
    const pool = events.filter((event) => event.source === source)
    const event = pool[eventIndex++ % pool.length]!
    const target = state.value.board.find((task) => task.status !== 'completed')
    if (!commit(triggerV7Event(state.value, event, { taskId: target?.taskId, playerId }))) return
    if (source === 'personal' && playerId) personalEventsDrawn.value = [...personalEventsDrawn.value, playerId]
    if (source === 'project') projectEventDrawnPhases.value = [...projectEventDrawnPhases.value, state.value.phase]
  }
  function nextWeek() {
    if (!canEndWeek.value) {
      notice.value = `⚠ 週末へ進む前に「${guide.value.title}」を完了してください。`
      return
    }
    state.value = resolveV7Week(state.value)
    personalEventsDrawn.value = []
    notice.value = state.value.phase > 2 ? '2フェーズの試作が終了しました。ログと指標を確認してください。' : '週末処理を行いました。'
  }
  function reset() {
    state.value = initial()
    notice.value = 'タスク候補から各成果物の作り方を選んでください。'
    personalEventsDrawn.value = []
    projectEventDrawnPhases.value = []
    eventIndex = 0
  }
  const marketTasks = computed(() => tasks.filter((task) => !state.value.board.some((board) => board.taskId === task.id)))
  const planningReady = computed(() => state.value.board.filter((task) => task.status !== 'completed').length >= state.value.config.activeTaskLimit)
  const tasksWithoutLead = computed(() =>
    state.value.board.filter((task) => task.status !== 'completed' && !task.leadPlayerId),
  )
  const pendingPersonalPlayers = computed(() =>
    state.value.players.filter((player) => !personalEventsDrawn.value.includes(player.id)),
  )
  const projectEventDue = computed(
    () => state.value.week === 1 && !projectEventDrawnPhases.value.includes(state.value.phase),
  )
  const guide = computed(() => {
    if (state.value.phase > 2) return { step: 6, title: 'プロジェクト完了', detail: '指標を確認し、もう一度遊ぶ場合はリセットします。' }
    if (!planningReady.value) return { step: 1, title: '今週のタスクを計画する', detail: `市場から${state.value.config.activeTaskLimit}枚まで採用します。すぐ着手できる仕事と将来を解放する仕事を組み合わせます。` }
    if (tasksWithoutLead.value.length > 0) return { step: 2, title: '主担当を決める', detail: `主担当未定のタスクが${tasksWithoutLead.value.length}件あります。左でメンバーを選び、タスクへ配置します。` }
    if (projectEventDue.value) return { step: 3, title: 'プロジェクトイベントを引く', detail: 'フェーズ開始時の大きな外的変化を確認します。' }
    if (pendingPersonalPlayers.value.length > 0) return { step: 4, title: '個人イベントを引く', detail: `残り${pendingPersonalPlayers.value.length}人です。各メンバーを選んで1枚ずつ引きます。` }
    return { step: 5, title: '営業日を配分する', detail: '進捗・炎上対応・学習へ営業日を置き、判断が終わったら週末処理へ進みます。' }
  })
  const canEndWeek = computed(
    () => planningReady.value && tasksWithoutLead.value.length === 0 && !projectEventDue.value && pendingPersonalPlayers.value.length === 0,
  )
  return {
    state, notice, tasks, events, taskOf, usedDays, candidatesFor, boardTask,
    remainingDays: (playerId: string) => state.value.players.find((p) => p.id === playerId)!.workdayCapacity - usedDays(playerId),
    gameFinished: computed(() => state.value.phase > 2),
    personalEventsDrawn, projectEventDue, pendingPersonalPlayers, marketTasks, planningReady, guide, canEndWeek,
    plan, unplan, lead, support, work, learn, rest, handoff, urgent, investigate, resolveIncident, extinguish, drawEvent, nextWeek, reset,
  }
}
