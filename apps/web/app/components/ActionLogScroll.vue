<script setup lang="ts">
/** アクションログ(卓の脇に置いた巻物/帳面風の小窓)。折りたたみ式。Undo・リセットもここに集約。 */
const { actions, state, undo, reset } = useGame()
const open = ref(false)
</script>

<template>
  <div class="log-scroll">
    <div v-if="open" class="log-panel">
      <div class="log-panel-head">
        <span>📜 進行ログ({{ actions.length }})</span>
        <div class="log-actions">
          <button :disabled="actions.length === 0" @click="undo">↩ Undo</button>
          <button class="danger" @click="reset">リセット</button>
        </div>
      </div>
      <ol class="log-list">
        <li v-for="(e, i) in [...state.log].reverse()" :key="state.log.length - i">
          <span class="log-tag">P{{ e.phase }}/W{{ e.week }}</span>{{ e.message }}
        </li>
      </ol>
    </div>
    <button class="log-tab" @click="open = !open">📜 ログ{{ open ? 'を閉じる' : `(${actions.length})` }}</button>
  </div>
</template>
