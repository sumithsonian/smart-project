<script setup lang="ts">
/**
 * タスクエリア:依存の深さごとのレーンにタイルを並べる(ボードに置いていくイメージ)。
 * 各タイルは不足要件(トークン/スキル/協業/依存/予算)をツールチップで表示する。
 */
import { computed } from 'vue'
import type { TaskInstance, TaskTile } from '@smart-project/engine'

const { state, dispatch, tile, selectedTaskId, requirementCard, playerColor } = useGame()

/** 外注の実行(チームアクション。便宜上 PM を実行者にする) */
function outsource(tileId: string) {
  const pm = state.value.players.find((p) => p.role === 'pm')
  if (!pm) return
  dispatch({ type: 'OUTSOURCE_TASK', playerId: pm.id, taskTileId: tileId })
}

/** タスクに専門席(スキル条件 or 秘匿要件)があり、外注できるか */
function canOutsource(t: TaskInstance): boolean {
  const def = tile(t.tileId)
  if (!def || t.resolved || t.outsourced) return false
  if (!state.value.config.outsourceEnabled) return false
  if (state.value.step !== 'planning') return false
  if (state.value.outsourceCountThisPhase >= state.value.config.outsourcePerPhase) return false
  return def.skillRequirement !== null || def.hiddenRequirement
}

const skillLabels: Record<string, string> = {
  direction: 'ディレクション',
  design: 'デザイン',
  engineering: 'エンジニアリング',
}

function tokenSum(t: TaskInstance): number {
  return Object.values(t.tokens).reduce((a, b) => a + b, 0)
}

function placers(t: TaskInstance): Array<{ id: string; count: number }> {
  return Object.entries(t.tokens)
    .filter(([, count]) => count > 0)
    .map(([id, count]) => ({ id, count }))
}

function playerName(id: string): string {
  return state.value.players.find((p) => p.id === id)?.name ?? id
}

/** 依存の深さ(盤面に残っている親のみ数える。解決済み・回収済みの親は深さ0扱い) */
function depthOf(tileId: string, seen: Set<string> = new Set()): number {
  if (seen.has(tileId)) return 0
  seen.add(tileId)
  const def = tile(tileId)
  if (!def) return 0
  const parentsOnBoard = def.dependsOn.filter((d) =>
    state.value.taskArea.some((x) => x.tileId === d),
  )
  if (parentsOnBoard.length === 0) return 0
  return 1 + Math.max(...parentsOnBoard.map((p) => depthOf(p, seen)))
}

/** レーン(深さ)ごとにタイルをまとめる */
const lanes = computed(() => {
  const map = new Map<number, TaskInstance[]>()
  for (const t of state.value.taskArea) {
    const d = depthOf(t.tileId)
    if (!map.has(d)) map.set(d, [])
    map.get(d)!.push(t)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([d, tasks]) => ({
      depth: d,
      tasks: tasks.sort(
        (a, b) => (tile(a.tileId)?.phase ?? 0) - (tile(b.tileId)?.phase ?? 0),
      ),
    }))
})

/** 🔥込みの必要トークン数 */
function requiredOf(t: TaskInstance): number {
  return (tile(t.tileId)?.requiredTokens ?? 0) + t.fire
}

/** 解決を妨げている不足要件の一覧(プランニング時点のプレビュー) */
function shortfalls(t: TaskInstance): string[] {
  const def = tile(t.tileId)
  if (!def || t.resolved) return []
  const result: string[] = []

  const sum = tokenSum(t)
  if (sum < requiredOf(t)) {
    result.push(
      `🪙 トークン不足(${sum}/${requiredOf(t)}${t.fire > 0 ? `、🔥で+${t.fire}` : ''})`,
    )
  }
  for (const dep of def.dependsOn) {
    const parent = state.value.taskArea.find((x) => x.tileId === dep)
    if (parent && !parent.resolved) {
      result.push(`⬆ 親タスク「${tile(dep)?.name}」が未解決`)
    }
  }
  if (def.collaboration && placers(t).length < 2) {
    result.push('🤝 協業:2人以上のトークンが必要')
  }
  const ids = placers(t).map((p) => p.id)
  const meets = (skill: string, level: number) =>
    ids.some((id) => {
      const player = state.value.players.find((p) => p.id === id)
      return player !== undefined && player.skills[skill as keyof typeof player.skills] >= level
    })
  // 外注済みは専門席が充足扱い(スキル不足を表示しない)
  const mismatch = state.value.config.mismatchEnabled
  const yarra = '→ やっつけ可(成果物ダウン+疲労+CS債務)'
  if (def.skillRequirement && !t.outsourced) {
    const req = def.skillRequirement
    if (!meets(req.skill, req.level)) {
      result.push(
        `🎓 ${skillLabels[req.skill]} Lv${req.level} 未達${mismatch ? ` ${yarra}` : 'を満たす参加者がいない'}`,
      )
    }
  }
  const applied = t.appliedRequirementId ? requirementCard(t.appliedRequirementId) : null
  if (applied?.effect.type === 'EXTRA_SKILL' && !t.outsourced) {
    const req = applied.effect.requirement
    if (!meets(req.skill, req.level)) {
      result.push(
        `📋 要件「${applied.name}」:${skillLabels[req.skill]} Lv${req.level} 未達${mismatch ? ` ${yarra}` : 'が必要'}`,
      )
    }
  }
  const cost = Math.max(0, def.cost + state.value.nextTaskCostModifier)
  if (cost > state.value.budget) {
    result.push(`💰 予算不足の見込み(コスト${cost} > 予算${state.value.budget})`)
  }
  return result
}

function statusOf(t: TaskInstance): { label: string; kind: 'done' | 'ok' | 'warn' } {
  if (t.resolved) return { label: '解決済', kind: 'done' }
  const list = shortfalls(t)
  if (list.length === 0) return { label: '実行可', kind: 'ok' }
  return { label: `不足 ${list.length}`, kind: 'warn' }
}

function tileDef(t: TaskInstance): TaskTile | undefined {
  return tile(t.tileId)
}
</script>

<template>
  <section class="panel">
    <h2>タスクエリア <span class="muted">依存レーン(左の親 → 右の子)</span></h2>
    <div class="lanes">
      <div v-for="lane in lanes" :key="lane.depth" class="lane">
        <div class="lane-head">{{ lane.depth === 0 ? '起点' : `依存 ${lane.depth}` }}</div>
        <div
          v-for="t in lane.tasks"
          :key="t.tileId"
          class="tile"
          :class="{
            resolved: t.resolved,
            selected: selectedTaskId === t.tileId,
            carried: (tileDef(t)?.phase ?? 0) < state.phase,
          }"
          @click="selectedTaskId = selectedTaskId === t.tileId ? null : t.tileId"
        >
          <div class="tile-head">
            <strong>{{ tileDef(t)?.name }}</strong>
            <span class="tile-status" :class="statusOf(t).kind">
              {{ statusOf(t).label }}
              <span v-if="!t.resolved" class="tooltip">
                <template v-if="shortfalls(t).length">
                  <div v-for="(s, i) in shortfalls(t)" :key="i" class="tooltip-line">{{ s }}</div>
                </template>
                <div v-else class="tooltip-line">✅ 現在の配置で解決できます</div>
                <div v-if="tileDef(t)?.hiddenRequirement && !t.appliedRequirementId" class="tooltip-line muted-line">
                  ❓ 実行時に秘匿要件カードを適用(追加条件が出る可能性あり)
                </div>
              </span>
            </span>
          </div>

          <div class="tile-cost-row">
            <span class="pip-row" title="必要トークン(🔥で増加)">
              <span
                v-for="i in requiredOf(t)"
                :key="i"
                class="pip"
                :class="{ filled: i <= tokenSum(t), burning: i > (tileDef(t)?.requiredTokens ?? 0) }"
              />
            </span>
            <span class="muted">{{ tokenSum(t) }}/{{ requiredOf(t) }}</span>
            <span v-if="t.fire > 0" class="fire-badge">🔥×{{ t.fire }}</span>
          </div>

          <div class="tile-meta">
            <span class="badge">💰{{ tileDef(t)?.cost }}</span>
            <span class="badge">😓+{{ tileDef(t)?.fatigue }}</span>
            <span v-if="tileDef(t)?.skillRequirement" class="badge skill">
              🎓{{ skillLabels[tileDef(t)!.skillRequirement!.skill]?.slice(0, 4) }}Lv{{ tileDef(t)!.skillRequirement!.level }}
            </span>
            <span v-if="tileDef(t)?.hiddenRequirement" class="badge secret">❓秘匿</span>
            <span v-if="tileDef(t)?.collaboration" class="badge">🤝協業</span>
            <span v-if="tileDef(t)?.eventMark" class="badge event">⚡</span>
            <span v-if="tileDef(t)?.specialEffect" class="badge special">✨次-{{ tileDef(t)!.specialEffect!.amount }}</span>
            <span v-if="(tileDef(t)?.phase ?? 0) < state.phase" class="badge warn">持ち越し</span>
            <span v-if="t.outsourced" class="badge outsourced">🏷️外注済</span>
          </div>

          <div v-if="canOutsource(t)" class="tile-outsource">
            <button
              class="outsource-btn"
              :disabled="state.budget < state.config.outsourceBudgetCost"
              :title="`予算-${state.config.outsourceBudgetCost} / CS-${state.config.outsourceCsCost}(C重み)で専門席を充足`"
              @click.stop="outsource(t.tileId)"
            >
              🏷️ 外注(予算-{{ state.config.outsourceBudgetCost }}/CS-{{ state.config.outsourceCsCost }})
            </button>
          </div>

          <div v-if="tileDef(t)?.deliverables.length" class="tile-deliverables">
            <span
              v-for="(lv, i) in tileDef(t)!.deliverables"
              :key="i"
              class="deliverable"
              :class="`lv${lv}`"
            >Lv{{ lv }}</span>
            <span class="muted">成果物</span>
          </div>

          <div v-if="placers(t).length" class="tile-tokens">
            <span v-for="p in placers(t)" :key="p.id" class="token-chip" :style="{ background: playerColor(p.id) }">
              {{ playerName(p.id).slice(0, 6) }}×{{ p.count }}
            </span>
          </div>

          <div v-if="t.appliedRequirementId" class="tile-requirement">
            📋 {{ requirementCard(t.appliedRequirementId)?.name }}
          </div>
        </div>
      </div>
    </div>
    <p class="muted">
      タイルをクリックで選択 → 個人ボードの「配置」「回収」。ステータス(実行可/不足)にカーソルを乗せると詳細が見えます。
    </p>
  </section>
</template>
