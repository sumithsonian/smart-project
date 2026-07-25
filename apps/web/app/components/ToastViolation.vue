<script setup lang="ts">
/** ルール違反(RuleViolation)のトースト表示。数秒で自動的に消える。 */
const { lastViolation } = useGame()
const visible = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

watch(
  () => lastViolation.value,
  (v) => {
    if (!v) {
      visible.value = false
      return
    }
    visible.value = true
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      visible.value = false
    }, 4000)
  },
)
</script>

<template>
  <div v-if="visible && lastViolation" class="violation-toast">
    ⚠ {{ lastViolation.message }}
    <span class="vt-code">[{{ lastViolation.code }}]</span>
  </div>
</template>
