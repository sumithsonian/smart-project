<script setup lang="ts">
/**
 * ミープル(プレイヤーコマ)。draggable=true の間だけ pointerdown でドラッグ開始できる
 * (useTableDrag.ts。ドロップ先は data-dropzone-key を持つ要素との当たり判定)。
 * ドラッグ中は自身を非表示にし、DragGhost.vue が追従表示を担当する。
 */
const props = withDefaults(
  defineProps<{
    playerId: string
    color: string
    overtime?: boolean
    draggable?: boolean
    size?: 'normal' | 'small'
  }>(),
  { overtime: false, draggable: false, size: 'normal' },
)

const { drag, beginDrag } = useTableDrag()

const isDragging = computed(
  () => drag.value?.playerId === props.playerId && drag.value?.overtime === props.overtime,
)
const svg = computed(() => meepleSvgMarkup(props.color, props.overtime))

function onPointerDown(e: PointerEvent) {
  if (!props.draggable) return
  beginDrag(e, { playerId: props.playerId, overtime: props.overtime, color: props.color })
}
</script>

<template>
  <div
    class="piece meeple"
    :class="[{ draggable, dragging: isDragging }, size === 'small' ? 'small' : '']"
    :style="{ visibility: isDragging ? 'hidden' : 'visible' }"
    :title="draggable ? 'ドラッグして配属先へ' : ''"
    @pointerdown="onPointerDown"
    v-html="svg"
  />
</template>
