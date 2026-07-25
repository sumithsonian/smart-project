<script setup lang="ts">
/** ドラッグ中のミープルの追従表示(document 直下・fixed 配置。マウント箇所は app.vue で一箇所のみ)。 */
const { drag } = useTableDrag()
const svg = computed(() => (drag.value ? meepleSvgMarkup(drag.value.color, drag.value.overtime) : ''))
</script>

<template>
  <div v-if="drag" class="piece meeple drag-ghost" :style="{ left: drag.x + 'px', top: drag.y + 'px' }" v-html="svg" />
</template>
