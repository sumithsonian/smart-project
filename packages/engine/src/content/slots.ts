/**
 * プロダクトボードのスロット定義(rules-v4-core.md §2)
 * 作っている Web サイトの完成図。納品した成果物が Lv 付きではまっていく。
 */
import type { SlotDef } from '../types/content'

export const SLOTS: SlotDef[] = [
  { id: 'requirements', name: '要件定義書', skill: 'direction' },
  { id: 'sitemap', name: 'サイトマップ', skill: 'direction' },
  { id: 'wireframe', name: 'ワイヤーフレーム', skill: 'design' },
  { id: 'design-comp', name: 'デザインカンプ', skill: 'design' },
  { id: 'styleguide', name: 'スタイルガイド', skill: 'design' },
  { id: 'top-page', name: 'トップページ', skill: 'engineering' },
  { id: 'sub-pages', name: '下層ページ', skill: 'engineering' },
  { id: 'cms', name: 'CMS', skill: 'engineering' },
  { id: 'launch', name: 'テスト・公開', skill: 'engineering' },
]
