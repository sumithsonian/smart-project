<script setup lang="ts">
/** 進行ログ(state.log。全履歴・最新が上)+ undo・リセット・アクションJSONエクスポート */
import { ref } from 'vue'

const { actions, state, undo, reset, exportLogJson } = useGame()
const copied = ref(false)

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
    <h2>進行ログ <span class="muted">(アクション {{ actions.length }} 件)</span></h2>
    <div class="row">
      <button :disabled="actions.length === 0" @click="undo">↩ Undo</button>
      <button :disabled="actions.length === 0" @click="copyJson">
        {{ copied ? 'コピーしました' : 'JSON コピー' }}
      </button>
      <button :disabled="actions.length === 0" @click="downloadJson">JSON ダウンロード</button>
      <button class="danger" @click="reset">リセット</button>
    </div>
    <ol class="game-log">
      <li v-for="(e, i) in [...state.log].reverse()" :key="state.log.length - i">
        <span class="log-tag">P{{ e.phase }}/W{{ e.week }}</span>{{ e.message }}
      </li>
    </ol>
  </section>
</template>
