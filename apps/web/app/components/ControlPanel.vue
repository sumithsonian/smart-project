<script setup lang="ts">
/** 進行コントロール:イベント解決・要件カード選択・タスク処理順宣言・タスク解決・フェーズ進行 */
import { computed, ref, watch } from 'vue'

const { state, dispatch, tile, eventCard, limitEventCard, requirementCard, content } = useGame()

// ── イベント表示 ──
const pendingCard = computed(() => {
  const p = state.value.pendingEvent
  if (!p) return null
  if (p.kind === 'limit') {
    const card = limitEventCard(p.cardId)
    const target = state.value.players.find((pl) => pl.id === p.targetPlayerId)
    return card ? { title: `🔥 限界イベント(${target?.name})`, card } : null
  }
  const card = eventCard(p.cardId)
  const kindLabel = p.kind === 'phase_start' ? 'フェーズ開始イベント' : 'タスクイベント'
  return card ? { title: `⚡ ${kindLabel}`, card } : null
})

// ── PM のタスク処理順宣言 ──
const order = ref<string[]>([])
const pm = computed(() => state.value.players.find((p) => p.role === 'pm'))
const unresolved = computed(() => state.value.taskArea.filter((t) => !t.resolved))
const needsOrder = computed(
  () => state.value.step === 'execution' && state.value.resolutionQueue === null,
)
watch(needsOrder, () => {
  order.value = []
})

function toggleOrder(tileId: string) {
  order.value = order.value.includes(tileId)
    ? order.value.filter((id) => id !== tileId)
    : [...order.value, tileId]
}
function autoOrder() {
  // コンテンツ定義順(親→子に並んでいる)× フェーズ昇順を推奨順とする
  const indexOf = (id: string) => content.value.tasks.findIndex((t) => t.id === id)
  order.value = unresolved.value
    .map((t) => t.tileId)
    .sort((a, b) => (tile(a)!.phase - tile(b)!.phase) || (indexOf(a) - indexOf(b)))
}
function declareOrder() {
  if (!pm.value) return
  if (dispatch({ type: 'DECLARE_TASK_ORDER', playerId: pm.value.id, order: [...order.value] })) {
    order.value = []
  }
}

const nextTask = computed(() => {
  const queue = state.value.resolutionQueue
  return queue && queue.length > 0 ? tile(queue[0]!) : null
})

const requirementOptions = computed(() => {
  const c = state.value.pendingRequirementChoice
  if (!c) return null
  return {
    task: tile(c.taskTileId),
    cards: c.optionIds.map((id) => requirementCard(id)),
  }
})
</script>

<template>
  <section class="panel control-panel">
    <h2>進行</h2>

    <!-- ゲーム終了 -->
    <div v-if="state.result" class="result-box" :class="state.result.outcome">
      <h3>{{ state.result.outcome === 'win' ? '🎉 チーム勝利!' : '💀 チーム敗北' }}</h3>
      <p>{{ state.result.reason }}</p>
      <ul>
        <li v-for="p in state.players" :key="p.id">
          {{ p.name }}:個人目標 {{ state.result.personalResults[p.id] ? '達成 🏆' : '未達成' }}
        </li>
      </ul>
    </div>

    <!-- イベント解決 -->
    <div v-else-if="pendingCard" class="event-box">
      <h3>{{ pendingCard.title }}</h3>
      <p><strong>{{ pendingCard.card.name }}</strong></p>
      <p class="muted">{{ pendingCard.card.description }}</p>
      <button class="primary" @click="dispatch({ type: 'RESOLVE_EVENT' })">イベントを解決</button>
    </div>

    <!-- 要件カード選択 -->
    <div v-else-if="requirementOptions" class="event-box">
      <h3>❓ 秘匿要件:「{{ requirementOptions.task?.name }}」</h3>
      <p class="muted">要件カードを1枚選んで適用してください。</p>
      <div class="requirement-choices">
        <button
          v-for="(card, i) in requirementOptions.cards"
          :key="card?.id ?? i"
          class="requirement-card"
          @click="dispatch({ type: 'SELECT_REQUIREMENT_CARD', choiceIndex: i as 0 | 1 })"
        >
          <strong>{{ card?.name }}</strong>
          <span class="muted">{{ card?.description }}</span>
        </button>
      </div>
    </div>

    <!-- プランニング中 -->
    <div v-else-if="state.step === 'planning'">
      <p class="muted">
        全員で相談しながらトークンを配置し、各自「準備完了」を押してください
        ({{ state.readyPlayerIds.length }}/{{ state.players.length }})。
      </p>
    </div>

    <!-- 実行:処理順宣言 -->
    <div v-else-if="needsOrder">
      <h3>🧭 タスク処理順の宣言(PM: {{ pm?.name }})</h3>
      <p class="muted">未解決タスクを処理する順にクリック(依存の親→子順が必須)。</p>
      <div class="order-builder">
        <button
          v-for="t in unresolved"
          :key="t.tileId"
          :class="{ selected: order.includes(t.tileId) }"
          @click="toggleOrder(t.tileId)"
        >
          <template v-if="order.includes(t.tileId)">{{ order.indexOf(t.tileId) + 1 }}. </template>
          {{ tile(t.tileId)?.name }}
        </button>
      </div>
      <div class="row">
        <button @click="autoOrder">自動(依存順)</button>
        <button @click="order = []">クリア</button>
        <button class="primary" :disabled="order.length !== unresolved.length" @click="declareOrder">
          この順で宣言
        </button>
      </div>
    </div>

    <!-- 実行:逐次解決 -->
    <div v-else-if="state.step === 'execution'">
      <h3>▶ 実行中</h3>
      <p v-if="nextTask">次のタスク:<strong>{{ nextTask.name }}</strong></p>
      <ol class="queue muted">
        <li v-for="id in state.resolutionQueue" :key="id">{{ tile(id)?.name }}</li>
      </ol>
      <button class="primary" @click="dispatch({ type: 'RESOLVE_NEXT_TASK' })">
        次のタスクを解決
      </button>
    </div>

    <!-- フェーズ終了 -->
    <div v-else-if="state.step === 'phase_end'">
      <h3>🏁 フェーズ{{ state.phase }}終了</h3>
      <button class="primary" @click="dispatch({ type: 'ADVANCE_PHASE' })">
        {{ state.phase >= state.config.phases ? '最終判定へ' : '次のフェーズへ' }}
      </button>
    </div>

    <!-- 解決ログ -->
    <div v-if="state.resolutionLog.length" class="resolution-log">
      <h3>タスク解決ログ(フェーズ{{ state.phase }})</h3>
      <ul>
        <li v-for="(e, i) in state.resolutionLog" :key="i" :class="e.resolved ? 'ok-text' : 'danger-text'">
          {{ e.message }}
        </li>
      </ul>
    </div>
  </section>
</template>
