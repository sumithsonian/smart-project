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
  // Phase 1: 企画・要件定義
  { id: 'p1-interview', name: 'ユーザーインタビュー', phase: 1, slotId: 'p1-insight', skill: 'direction', requiredSkillLevel: 2, effort: 4, prerequisiteSlotIds: [], quality: 2, cost: 2, fatigue: 1 },
  { id: 'p1-analytics', name: 'アクセス解析', phase: 1, slotId: 'p1-insight', skill: 'direction', requiredSkillLevel: 1, effort: 3, prerequisiteSlotIds: [], quality: 1, cost: 1, fatigue: 1 },
  { id: 'p1-stakeholder', name: '関係者ヒアリング', phase: 1, slotId: 'p1-scope', skill: 'direction', requiredSkillLevel: 1, effort: 3, prerequisiteSlotIds: [], quality: 2, cost: 1, fatigue: 1 },
  { id: 'p1-inventory', name: 'コンテンツ棚卸し', phase: 1, slotId: 'p1-scope', skill: 'design', requiredSkillLevel: 1, effort: 2, prerequisiteSlotIds: [], quality: 1, cost: 0, fatigue: 1 },
  { id: 'p1-workshop', name: '要件整理ワークショップ', phase: 1, slotId: 'p1-agreement', skill: 'direction', requiredSkillLevel: 2, effort: 4, prerequisiteSlotIds: ['p1-insight'], quality: 2, cost: 2, fatigue: 2 },
  { id: 'p1-priority', name: 'Must／Better整理', phase: 1, slotId: 'p1-agreement', skill: 'direction', requiredSkillLevel: 1, effort: 3, prerequisiteSlotIds: ['p1-scope'], quality: 1, cost: 0, fatigue: 1 },

  // Phase 2: 設計・デザイン
  { id: 'p2-ia', name: '情報設計', phase: 2, slotId: 'p2-structure', skill: 'design', requiredSkillLevel: 2, effort: 4, prerequisiteSlotIds: ['p1-agreement'], quality: 2, cost: 1, fatigue: 1 },
  { id: 'p2-content-model', name: 'コンテンツモデル', phase: 2, slotId: 'p2-structure', skill: 'design', requiredSkillLevel: 1, effort: 3, prerequisiteSlotIds: ['p1-scope'], quality: 2, cost: 1, fatigue: 1 },
  { id: 'p2-wireframe', name: 'ワイヤーフレーム', phase: 2, slotId: 'p2-experience', skill: 'design', requiredSkillLevel: 1, effort: 4, prerequisiteSlotIds: ['p2-structure'], quality: 1, cost: 1, fatigue: 1 },
  { id: 'p2-prototype', name: '検証プロトタイプ', phase: 2, slotId: 'p2-experience', skill: 'design', requiredSkillLevel: 2, effort: 5, prerequisiteSlotIds: ['p1-insight'], quality: 2, cost: 3, fatigue: 2 },
  { id: 'p2-design-system', name: 'デザインシステム', phase: 2, slotId: 'p2-spec', skill: 'design', requiredSkillLevel: 2, effort: 5, prerequisiteSlotIds: [], quality: 2, cost: 2, fatigue: 2 },
  { id: 'p2-ui-spec', name: 'UI仕様整理', phase: 2, slotId: 'p2-spec', skill: 'direction', requiredSkillLevel: 1, effort: 3, prerequisiteSlotIds: ['p2-experience'], quality: 1, cost: 0, fatigue: 1 },

  // Phase 3: 開発
  { id: 'p3-spike', name: '技術検証', phase: 3, slotId: 'p3-foundation', skill: 'engineering', requiredSkillLevel: 2, effort: 3, prerequisiteSlotIds: [], quality: 2, cost: 1, fatigue: 1 },
  { id: 'p3-cms', name: 'CMSモデリング', phase: 3, slotId: 'p3-foundation', skill: 'engineering', requiredSkillLevel: 1, effort: 4, prerequisiteSlotIds: ['p2-structure'], quality: 2, cost: 2, fatigue: 1 },
  { id: 'p3-components', name: '共通コンポーネント', phase: 3, slotId: 'p3-implementation', skill: 'engineering', requiredSkillLevel: 2, effort: 5, prerequisiteSlotIds: ['p2-spec'], quality: 2, cost: 3, fatigue: 2 },
  { id: 'p3-frontend', name: '画面実装', phase: 3, slotId: 'p3-implementation', skill: 'engineering', requiredSkillLevel: 1, effort: 4, prerequisiteSlotIds: ['p2-experience'], quality: 1, cost: 1, fatigue: 2 },
  { id: 'p3-api', name: '外部API連携', phase: 3, slotId: 'p3-integration', skill: 'engineering', requiredSkillLevel: 2, effort: 5, prerequisiteSlotIds: ['p3-foundation'], quality: 2, cost: 3, fatigue: 2 },
  { id: 'p3-content', name: 'コンテンツ組込', phase: 3, slotId: 'p3-integration', skill: 'direction', requiredSkillLevel: 1, effort: 3, prerequisiteSlotIds: ['p3-implementation'], quality: 1, cost: 1, fatigue: 1 },

  // Phase 4: テスト・公開
  { id: 'p4-plan', name: 'テスト計画', phase: 4, slotId: 'p4-quality', skill: 'direction', requiredSkillLevel: 1, effort: 3, prerequisiteSlotIds: [], quality: 2, cost: 0, fatigue: 1 },
  { id: 'p4-functional', name: '機能テスト', phase: 4, slotId: 'p4-quality', skill: 'engineering', requiredSkillLevel: 1, effort: 4, prerequisiteSlotIds: ['p3-integration'], quality: 1, cost: 1, fatigue: 1 },
  { id: 'p4-usability', name: 'ユーザビリティテスト', phase: 4, slotId: 'p4-acceptance', skill: 'design', requiredSkillLevel: 2, effort: 4, prerequisiteSlotIds: ['p2-experience'], quality: 2, cost: 2, fatigue: 1 },
  { id: 'p4-performance', name: '性能・負荷試験', phase: 4, slotId: 'p4-acceptance', skill: 'engineering', requiredSkillLevel: 2, effort: 4, prerequisiteSlotIds: ['p3-foundation'], quality: 2, cost: 2, fatigue: 2 },
  { id: 'p4-release', name: '公開判定', phase: 4, slotId: 'p4-release', skill: 'direction', requiredSkillLevel: 2, effort: 3, prerequisiteSlotIds: ['p4-quality', 'p4-acceptance'], quality: 2, cost: 0, fatigue: 2 },
  { id: 'p4-handoff', name: '運用引き継ぎ', phase: 4, slotId: 'p4-release', skill: 'direction', requiredSkillLevel: 1, effort: 3, prerequisiteSlotIds: ['p4-quality'], quality: 1, cost: 0, fatigue: 1 },
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
      { id: 'p1-insight', name: '顧客理解', phase: 1 },
      { id: 'p1-scope', name: 'スコープ仮説', phase: 1 },
      { id: 'p1-agreement', name: '要件合意', phase: 1 },
      { id: 'p2-structure', name: '情報構造', phase: 2 },
      { id: 'p2-experience', name: '体験設計', phase: 2 },
      { id: 'p2-spec', name: 'UI仕様', phase: 2 },
      { id: 'p3-foundation', name: '技術基盤', phase: 3 },
      { id: 'p3-implementation', name: '実装成果', phase: 3 },
      { id: 'p3-integration', name: '結合済み成果物', phase: 3 },
      { id: 'p4-quality', name: '品質確認', phase: 4 },
      { id: 'p4-acceptance', name: '受入確認', phase: 4 },
      { id: 'p4-release', name: '公開・引き継ぎ', phase: 4 },
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
    notice.value = state.value.phase > state.value.config.totalPhases ? '4フェーズのプロジェクトが終了しました。ログと指標を確認してください。' : '週末処理を行いました。'
  }
  function reset() {
    state.value = initial()
    notice.value = 'タスク候補から各成果物の作り方を選んでください。'
    personalEventsDrawn.value = []
    projectEventDrawnPhases.value = []
    eventIndex = 0
  }
  const phaseTasks = computed(() => tasks.filter((task) => (task.phase ?? 1) === state.value.phase))
  const marketTasks = computed(() => phaseTasks.value.filter((task) => !state.value.board.some((board) => board.taskId === task.id)))
  const activeTasks = computed(() => state.value.board.filter((task) => task.status !== 'completed'))
  const remainingPhaseTaskCount = computed(() => phaseTasks.value.filter(
    (task) => !state.value.board.some((board) => board.taskId === task.id && board.status === 'completed'),
  ).length)
  const planningTarget = computed(() => Math.min(state.value.config.activeTaskLimit, remainingPhaseTaskCount.value))
  const planningReady = computed(() => activeTasks.value.length >= planningTarget.value)
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
    if (state.value.phase > state.value.config.totalPhases) return { step: 6, title: 'プロジェクト完了', detail: '4フェーズの結果を確認し、もう一度遊ぶ場合はリセットします。' }
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
    gameFinished: computed(() => state.value.phase > state.value.config.totalPhases),
    personalEventsDrawn, projectEventDue, pendingPersonalPlayers, phaseTasks, marketTasks, planningReady, guide, canEndWeek,
    plan, unplan, lead, support, work, learn, rest, handoff, urgent, investigate, resolveIncident, extinguish, drawEvent, nextWeek, reset,
  }
}
