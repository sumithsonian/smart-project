<script setup lang="ts">
/**
 * 卓のパン&ズームステージ。ドラッグで平行移動、ホイール/±ボタンで拡大縮小。
 * 初期カメラは卓全体が見渡せるフィット表示(1440×900 相当のビューポートを想定)。
 */
const stageEl = ref<HTMLElement | null>(null)
const wrapEl = ref<HTMLElement | null>(null)
const panning = ref(false)

const view = reactive({ x: 0, y: 0, scale: 1 })

function applyView() {
  if (wrapEl.value) {
    wrapEl.value.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`
  }
}

function naturalSize() {
  if (!wrapEl.value) return { w: 1800, h: 1400 }
  return { w: wrapEl.value.scrollWidth || 1800, h: wrapEl.value.scrollHeight || 1400 }
}

function fitAllScale(): number {
  if (!stageEl.value) return 1
  const pad = 30
  const sw = stageEl.value.clientWidth - pad * 2
  const sh = stageEl.value.clientHeight - pad * 2
  const { w, h } = naturalSize()
  const scale = Math.min(sw / w, sh / h)
  return Math.max(0.15, Math.min(scale, 1.6))
}

function fitAll() {
  if (!stageEl.value) return
  const scale = fitAllScale()
  const { w, h } = naturalSize()
  view.scale = scale
  view.x = (stageEl.value.clientWidth - w * scale) / 2
  view.y = (stageEl.value.clientHeight - h * scale) / 2
  applyView()
}

function clampScale(s: number) {
  return Math.max(0.15, Math.min(2.6, s))
}

function zoomAt(clientX: number, clientY: number, factor: number) {
  if (!stageEl.value) return
  const rect = stageEl.value.getBoundingClientRect()
  const mx = clientX - rect.left
  const my = clientY - rect.top
  const newScale = clampScale(view.scale * factor)
  const wx = (mx - view.x) / view.scale
  const wy = (my - view.y) / view.scale
  view.scale = newScale
  view.x = mx - wx * newScale
  view.y = my - wy * newScale
  applyView()
}

let panStart = { x: 0, y: 0 }
let viewStart = { x: 0, y: 0 }
const NON_PAN_SELECTOR = '.board, .piece, button, input, select, a, .card-slot-empty'

function onPointerDown(e: PointerEvent) {
  const target = e.target as HTMLElement
  if (target.closest(NON_PAN_SELECTOR)) return
  panning.value = true
  panStart = { x: e.clientX, y: e.clientY }
  viewStart = { x: view.x, y: view.y }
  stageEl.value?.setPointerCapture(e.pointerId)
}
function onPointerMove(e: PointerEvent) {
  if (!panning.value) return
  view.x = viewStart.x + (e.clientX - panStart.x)
  view.y = viewStart.y + (e.clientY - panStart.y)
  applyView()
}
function onPointerUp() {
  panning.value = false
}
function onWheel(e: WheelEvent) {
  e.preventDefault()
  const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
  zoomAt(e.clientX, e.clientY, factor)
}

function onResize() {
  fitAll()
}

let resizeObserver: ResizeObserver | null = null

onMounted(async () => {
  await nextTick()
  fitAll()
  window.addEventListener('resize', onResize)
  if (wrapEl.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      // 内容量が変わってもユーザーの視点は保つ(自動リフィットはしない)
    })
    resizeObserver.observe(wrapEl.value)
  }
})
onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  resizeObserver?.disconnect()
})

defineExpose({ fitAll, zoomAt })
</script>

<template>
  <div
    id="table-stage"
    ref="stageEl"
    :class="{ panning }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @wheel="onWheel"
  >
    <div id="table-surface-wrap" ref="wrapEl">
      <TableSurface />
    </div>
  </div>

  <div class="zoom-controls">
    <button title="拡大" @click="zoomAt(stageEl!.clientWidth / 2, stageEl!.clientHeight / 2, 1.2)">+</button>
    <button title="縮小" @click="zoomAt(stageEl!.clientWidth / 2, stageEl!.clientHeight / 2, 1 / 1.2)">−</button>
    <button title="全体表示" @click="fitAll">⤢</button>
  </div>

  <DragGhost />
</template>
