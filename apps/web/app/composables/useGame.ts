/**
 * ホットシートUIのゲーム状態管理。
 * イベントソーシング:アクションログが正で、状態は replay で導出する。
 * undo は「最後のアクションを除いてリプレイ」。
 */
import { ref, shallowRef, computed } from 'vue'
import {
  applyAction,
  createInitialState,
  isRuleViolation,
  replay,
  DEFAULT_CONTENT,
} from '@smart-project/engine'
import type { GameAction, GameState, RuleViolation } from '@smart-project/engine'

const actions = ref<GameAction[]>([])
const state = shallowRef<GameState>(createInitialState())
const lastViolation = ref<RuleViolation | null>(null)
/** UI 上で選択中のタスク(配置・回収の対象) */
const selectedTaskId = ref<string | null>(null)

export function useGame() {
  function dispatch(action: GameAction): boolean {
    const next = applyAction(state.value, action)
    if (isRuleViolation(next)) {
      lastViolation.value = next
      return false
    }
    actions.value = [...actions.value, action]
    state.value = next
    lastViolation.value = null
    return true
  }

  function undo(): void {
    if (actions.value.length === 0) return
    actions.value = actions.value.slice(0, -1)
    state.value = replay(actions.value)
    lastViolation.value = null
  }

  function reset(): void {
    actions.value = []
    state.value = createInitialState()
    lastViolation.value = null
    selectedTaskId.value = null
  }

  function exportLogJson(): string {
    return JSON.stringify(actions.value, null, 2)
  }

  const started = computed(() => state.value.phase > 0)

  // ── コンテンツ参照ヘルパ(UI 表示用) ──
  const content = computed(() => (started.value ? state.value.content : DEFAULT_CONTENT))
  function tile(tileId: string) {
    return content.value.tasks.find((t) => t.id === tileId)
  }
  function eventCard(cardId: string) {
    return content.value.events.find((c) => c.id === cardId)
  }
  function limitEventCard(cardId: string) {
    return content.value.limitEvents.find((c) => c.id === cardId)
  }
  function requirementCard(cardId: string) {
    return content.value.requirements.find((c) => c.id === cardId)
  }
  function personalGoal(cardId: string) {
    return content.value.personalGoals.find((c) => c.id === cardId)
  }
  function roleName(role: string) {
    return content.value.roles.find((r) => r.role === role)?.name ?? role
  }

  return {
    actions,
    state,
    lastViolation,
    selectedTaskId,
    started,
    content,
    dispatch,
    undo,
    reset,
    exportLogJson,
    tile,
    eventCard,
    limitEventCard,
    requirementCard,
    personalGoal,
    roleName,
  }
}
