/**
 * 卓面のミープル ドラッグ&ドロップ(rules-v4-core.md §1-2-3「朝会」)。
 * モック(mock-table-ui.html)のポインタードラッグ実装を Vue 向けに一般化したもの。
 * - ドラッグ中は module-level の drag state を更新し、実体の駒要素は動かさない
 *   (Vue の仮想DOM管理と衝突しないよう、追従表示は DragGhost.vue が担当)
 * - ドロップ先は data-dropzone-key 属性を持つ要素を hit-test して特定する
 *   (盤面の各要素:タスクの担当行・消火アイコン・改修可能スロット・休憩/学習デスク)
 */
import { ref } from 'vue'
import type { SkillKind, WorkerTarget } from '@smart-project/engine'

export interface DragState {
  playerId: string
  overtime: boolean
  color: string
  x: number
  y: number
}

const drag = ref<DragState | null>(null)
const hoverZoneKey = ref<string | null>(null)

/** WorkerTarget → dropzone キー文字列(要素の data-dropzone-key と対応) */
export function zoneKeyFor(target: WorkerTarget): string {
  switch (target.kind) {
    case 'task':
      return `task:${target.cardId}`
    case 'extinguish':
      return `extinguish:${target.cardId}`
    case 'slot':
      return `slot:${target.slotId}`
    case 'rest':
      return 'rest'
    case 'learn':
      return `learn:${target.skill}`
  }
}

function parseZoneKey(key: string): WorkerTarget | null {
  const sep = key.indexOf(':')
  const kind = sep === -1 ? key : key.slice(0, sep)
  const rest = sep === -1 ? '' : key.slice(sep + 1)
  switch (kind) {
    case 'task':
      return rest ? { kind: 'task', cardId: rest } : null
    case 'extinguish':
      return rest ? { kind: 'extinguish', cardId: rest } : null
    case 'slot':
      return rest ? { kind: 'slot', slotId: rest } : null
    case 'rest':
      return { kind: 'rest' }
    case 'learn':
      return rest ? { kind: 'learn', skill: rest as SkillKind } : null
    default:
      return null
  }
}

function hitTest(x: number, y: number): string | null {
  const els = document.querySelectorAll<HTMLElement>('[data-dropzone-key]')
  for (const el of els) {
    const r = el.getBoundingClientRect()
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
      return el.dataset.dropzoneKey ?? null
    }
  }
  return null
}

export function useTableDrag() {
  const { dispatch, assignmentOf } = useGame()

  function onMove(e: PointerEvent) {
    if (!drag.value) return
    drag.value.x = e.clientX
    drag.value.y = e.clientY
    hoverZoneKey.value = hitTest(e.clientX, e.clientY)
  }

  function onUp() {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    const d = drag.value
    const zoneKey = hoverZoneKey.value
    drag.value = null
    hoverZoneKey.value = null
    if (!d) return
    const existing = assignmentOf(d.playerId, d.overtime)
    if (zoneKey) {
      const target = parseZoneKey(zoneKey)
      if (target) {
        if (existing) dispatch({ type: 'UNASSIGN_WORKER', playerId: d.playerId, overtime: d.overtime })
        dispatch({ type: 'ASSIGN_WORKER', playerId: d.playerId, target, overtime: d.overtime })
        return
      }
    }
    if (existing) {
      dispatch({ type: 'UNASSIGN_WORKER', playerId: d.playerId, overtime: d.overtime })
    }
  }

  /** ミープルの pointerdown ハンドラから呼ぶ(駒のドラッグを開始する) */
  function beginDrag(e: PointerEvent, opts: { playerId: string; overtime: boolean; color: string }) {
    e.preventDefault()
    e.stopPropagation()
    drag.value = { ...opts, x: e.clientX, y: e.clientY }
    hoverZoneKey.value = null
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  return { drag, hoverZoneKey, beginDrag }
}
