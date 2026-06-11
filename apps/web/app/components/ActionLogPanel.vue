<script setup lang="ts">
/** アクションログ:全履歴表示・undo・JSONエクスポート(バランス分析の入口) */
import { ref } from 'vue'
import type { GameAction } from '@smart-project/engine'

const { actions, state, undo, reset, exportLogJson } = useGame()
const copied = ref(false)

function describe(action: GameAction): string {
  const name = (id: string) => state.value.players.find((p) => p.id === id)?.name ?? id
  switch (action.type) {
    case 'SETUP_GAME':
      return `セットアップ(seed=${action.seed})`
    case 'PLACE_TOKEN':
      return `${name(action.playerId)}: 配置 → ${action.target.kind === 'task' ? action.target.taskTileId : `学習(${action.target.skill})`}`
    case 'RETRIEVE_TOKEN':
      return `${name(action.playerId)}: 回収 ← ${action.target.kind === 'task' ? action.target.taskTileId : `学習(${action.target.skill})`}`
    case 'REST':
      return `${name(action.playerId)}: 休憩`
    case 'EXTRA_BILLING':
      return `${name(action.playerId)}: 追加請求`
    case 'DECLARE_READY':
      return `${name(action.playerId)}: 準備完了`
    case 'DECLARE_TASK_ORDER':
      return `${name(action.playerId)}: 処理順宣言 [${action.order.join(' → ')}]`
    case 'RESOLVE_NEXT_TASK':
      return '次のタスクを解決'
    case 'SELECT_REQUIREMENT_CARD':
      return `要件カード選択(${action.choiceIndex + 1}枚目)`
    case 'RESOLVE_EVENT':
      return 'イベント解決'
    case 'ADVANCE_PHASE':
      return 'フェーズ進行'
    case 'SELECT_PERSONAL_GOAL':
      return `${name(action.playerId)}: 個人目標を選択`
    case 'EXTINGUISH_FIRE':
      return `${name(action.playerId)}: 🧯消火 → ${action.taskTileId}`
    case 'SELECT_EPIDEMIC_TARGET':
      return `${name(action.playerId)}: 🌋大炎上ターゲット → ${action.taskTileId}`
  }
}

async function copyJson() {
  await navigator.clipboard.writeText(exportLogJson())
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}

function downloadJson() {
  const blob = new Blob([exportLogJson()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `smart-project-log-${actions.value.length}actions.json`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <section class="panel">
    <h2>アクションログ({{ actions.length }})</h2>
    <div class="row">
      <button :disabled="actions.length === 0" @click="undo">↩ Undo</button>
      <button :disabled="actions.length === 0" @click="copyJson">
        {{ copied ? 'コピーしました' : 'JSON コピー' }}
      </button>
      <button :disabled="actions.length === 0" @click="downloadJson">JSON ダウンロード</button>
      <button class="danger" @click="reset">リセット</button>
    </div>
    <ol class="action-log">
      <li v-for="(a, i) in [...actions].reverse()" :key="actions.length - i">
        {{ describe(a) }}
      </li>
    </ol>
  </section>
</template>
