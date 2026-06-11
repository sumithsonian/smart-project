/**
 * プレイテスト用コンテンツ一式
 */
import type { GameContent } from '../types/content'
import { TASKS } from './tasks'
import {
  CLIENTS,
  EVENTS,
  LIMIT_EVENTS,
  MILESTONES,
  PERSONAL_GOALS,
  PROJECTS,
  PROJECT_SHEETS,
  REQUIREMENTS,
  ROLES,
} from './cards'

export { TASKS } from './tasks'
export {
  CLIENTS,
  EVENTS,
  LIMIT_EVENTS,
  MILESTONES,
  PERSONAL_GOALS,
  PROJECTS,
  PROJECT_SHEETS,
  REQUIREMENTS,
  ROLES,
} from './cards'

/** デフォルトのコンテンツバンドル(SETUP_GAME 時に state へ取り込まれる) */
export const DEFAULT_CONTENT: GameContent = {
  tasks: TASKS,
  events: EVENTS,
  requirements: REQUIREMENTS,
  limitEvents: LIMIT_EVENTS,
  personalGoals: PERSONAL_GOALS,
  milestones: MILESTONES,
  clients: CLIENTS,
  projects: PROJECTS,
  projectSheets: PROJECT_SHEETS,
  roles: ROLES,
}
