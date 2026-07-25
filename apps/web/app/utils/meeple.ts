/**
 * ミープル(プレイヤーコマ)の SVG マークアップ生成(モック mock-table-ui.html 準拠)。
 * v-html で挿入する(色はプレイヤーカラーパレット由来の固定値のみを受け取るため安全)。
 */
const MEEPLE_PATH =
  'M32,26 C22,26 14,34 12,44 C10,50 10,54 14,56 C18,58 22,54 24,48 C25,45 27,43 29,42 L29,58 ' +
  'C29,58 26,62 22,68 C18,74 16,78 16,84 L26,84 C26,84 27,78 29,72 C30,69 31,67 32,67 C33,67 34,69 35,72 ' +
  'C37,78 38,84 38,84 L48,84 C48,78 46,74 42,68 C38,62 35,58 35,58 L35,42 C37,43 39,45 40,48 ' +
  'C42,54 46,58 50,56 C54,54 54,50 52,44 C50,34 42,26 32,26 Z'

/** ミープル SVG(通常/残業の2種。残業は白抜き+破線縁取り) */
export function meepleSvgMarkup(hex: string, overtime = false): string {
  const fill = overtime ? '#ffffff' : hex
  const strokeStyle = overtime ? `stroke:${hex};stroke-width:5;stroke-dasharray:6 4;` : ''
  const style = `fill:${fill};${strokeStyle}`
  return (
    `<svg class="meeple-svg" viewBox="0 0 64 84" width="28" height="37" xmlns="http://www.w3.org/2000/svg">` +
    `<circle cx="32" cy="14" r="11" style="${style}"></circle>` +
    `<path d="${MEEPLE_PATH}" style="${style}"></path>` +
    `</svg>`
  )
}
