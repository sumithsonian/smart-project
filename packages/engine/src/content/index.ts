/**
 * プレイテスト用コンテンツ一式(v4)
 */
import type { GameContent } from '../types/content'
import { SLOTS } from './slots'
import { TASKS } from './tasks'
import { ACCEPTANCE, EVENTS, FIRES, LIMIT_EVENTS, MEMBERS, PROJECT_SHEETS } from './cards'

export { SLOTS } from './slots'
export { TASKS } from './tasks'
export { ACCEPTANCE, EVENTS, FIRES, LIMIT_EVENTS, MEMBERS, PROJECT_SHEETS } from './cards'

/** デフォルトのコンテンツバンドル(SETUP_GAME 時に state へ取り込まれる) */
export const DEFAULT_CONTENT: GameContent = {
  slots: SLOTS,
  tasks: TASKS,
  acceptance: ACCEPTANCE,
  events: EVENTS,
  fires: FIRES,
  limitEvents: LIMIT_EVENTS,
  members: MEMBERS,
  projectSheets: PROJECT_SHEETS,
}
