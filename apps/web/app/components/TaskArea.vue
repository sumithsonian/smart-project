<script setup lang="ts">
/**
 * タスクエリア:依存の深さごとのレーンにタイルを並べる(ボードに置いていくイメージ)。
 * 各タイルは不足要件(トークン/スキル/協業/依存/予算)をツールチップで表示する。
 */
import { computed } from 'vue'
import type { TaskInstance, TaskTile } from '@smart-project/engine'

const {
  state,
  dispatch,
  tile,
  selectedTaskId,
  requirementCard,
  playerColor,
  skillLabels,
  workerMode,
  seatOccupant,
  supportCountOf,
  supportWorkerIds,
  extinguishPledgeCountOf,
} = useGame()

/** 外注が自動充足する専門席のインデックス(未充足の専門席のうち先頭。engine の resolveTask と同じ規則) */
function outsourceSeatIndex(t: TaskInstance): number {
  if (!t.outsourced) return -1
  const def = tile(t.tileId)
  if (!def) return -1
  return def.seats.findIndex((s, i) => s.skill !== null && !seatOccupant(t.tileId, i))
}

/** 席の占有者がスキル条件を満たしているか(専門席のみ意味を持つ) */
function seatMismatch(t: TaskInstance, seatIndex: number): boolean {
  const def = tile(t.tileId)
  const seat = def?.seats[seatIndex]
  if (!seat || seat.skill === null) return false
  const occupantId = seatOccupant(t.tileId, seatIndex)
  if (!occupantId) return false
  const occupant = state.value.players.find((p) => p.id === occupantId)
  return !occupant || occupant.skills[seat.skill] < seat.level
}

/** v3.0 ワーカーモード時の不足要件(トークン数の代わりに席の空き・応援・スキル不足を見る) */
function workerShortfalls(t: TaskInstance): string[] {
  const def = tile(t.tileId)
  if (!def || t.resolved) return []
  const result: string[] = []
  const mismatch = state.value.config.mismatchEnabled
  const yarra = '→ やっつけ可(成果物ダウン+疲労+CS債務)'

  const openCount = def.seats.filter(
    (_, i) => !seatOccupant(t.tileId, i) && i !== outsourceSeatIndex(t),
  ).length
  if (openCount > 0) {
    result.push(`🪑 空席 ${def.seats.length - openCount}/${def.seats.length}`)
  }
  if (t.fire > 0 && supportCountOf(t.tileId) < t.fire) {
    result.push(`🆘 応援不足(${supportCountOf(t.tileId)}/${t.fire})`)
  }
  for (let i = 0; i < def.seats.length; i++) {
    if (seatMismatch(t, i)) {
      const seat = def.seats[i]!
      result.push(
        `🎓 ${skillLabels[seat.skill!]} Lv${seat.level} 未達${mismatch ? ` ${yarra}` : 'を満たしていません'}`,
      )
    }
  }
  for (const dep of def.dependsOn) {
    const parent = state.value.taskArea.find((x) => x.tileId === dep)
    if (parent && !parent.resolved) {
      result.push(`⬆ 親タスク「${tile(dep)?.name}」が未解決`)
    }
  }
  const cost = Math.max(0, def.cost + state.value.nextTaskCostModifier)
  if (cost > state.value.budget) {
    result.push(`💰 予算不足の見込み(コスト${cost} > 予算${state.value.budget})`)
  }
  return result
}

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

/** 現在のモードに応じた不足要件一覧(v3.0 ワーカーモードでは席/応援基準) */
function shortfallsOf(t: TaskInstance): string[] {
  return workerMode.value ? workerShortfalls(t) : shortfalls(t)
}

function statusOf(t: TaskInstance): { label: string; kind: 'done' | 'ok' | 'warn' } {
  if (t.resolved) return { label: '解決済', kind: 'done' }
  const list = shortfallsOf(t)
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
                <template v-if="shortfallsOf(t).length">
                  <div v-for="(s, i) in shortfallsOf(t)" :key="i" class="tooltip-line">{{ s }}</div>
                </template>
                <div v-else class="tooltip-line">✅ 現在の配置で解決できます</div>
                <div v-if="tileDef(t)?.hiddenRequirement && !t.appliedRequirementId" class="tooltip-line muted-line">
                  ❓ 実行時に秘匿要件カードを適用(追加条件が出る可能性あり)
                </div>
              </span>
            </span>
          </div>

          <div v-if="!workerMode" class="tile-cost-row">
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

          <!-- v3.0 ワーカーモード:席(専門席/人手席)+ 応援 -->
          <div v-else class="seat-row">
            <span v-if="t.fire > 0" class="fire-badge">🔥×{{ t.fire }}</span>
            <span
              v-for="(seat, i) in tileDef(t)?.seats ?? []"
              :key="i"
              class="seat-chip"
              :class="{
                filled: !!seatOccupant(t.tileId, i),
                outsourced: outsourceSeatIndex(t) === i,
                mismatch: seatMismatch(t, i),
              }"
              :style="
                seatOccupant(t.tileId, i)
                  ? { background: playerColor(seatOccupant(t.tileId, i)!), borderColor: playerColor(seatOccupant(t.tileId, i)!) }
                  : {}
              "
              :title="seat.skill ? `専門席:${skillLabels[seat.skill]}Lv${seat.level}` : '人手席(誰でも可)'"
            >
              <span class="seat-label">{{ seat.skill ? `${skillLabels[seat.skill].slice(0, 2)}Lv${seat.level}` : '人手' }}</span>
              <span v-if="seatOccupant(t.tileId, i)" class="seat-occupant">{{ playerName(seatOccupant(t.tileId, i)!).slice(0, 6) }}</span>
              <span v-else-if="outsourceSeatIndex(t) === i" class="seat-occupant">🏷️外注</span>
              <span v-else class="seat-empty">空席</span>
            </span>
            <span v-if="t.fire > 0" class="support-chip" :class="{ short: supportCountOf(t.tileId) < t.fire }">
              🆘応援 {{ supportCountOf(t.tileId) }}/{{ t.fire }}
              <template v-if="supportWorkerIds(t.tileId).length">
                :
                <span
                  v-for="id in supportWorkerIds(t.tileId)"
                  :key="id"
                  class="token-chip"
                  :style="{ background: playerColor(id) }"
                >{{ playerName(id).slice(0, 6) }}</span>
              </template>
            </span>
            <span v-if="t.fire > 0 && extinguishPledgeCountOf(t.tileId) > 0" class="badge">
              🧯消火予定×{{ extinguishPledgeCountOf(t.tileId) }}
            </span>
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

          <div v-if="!workerMode && placers(t).length" class="tile-tokens">
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
    <p v-if="!workerMode" class="muted">
      タイルをクリックで選択 → 個人ボードの「配置」「回収」。ステータス(実行可/不足)にカーソルを乗せると詳細が見えます。
    </p>
    <p v-else class="muted">
      タイルをクリックで選択 → 個人ボードの配属UIで席・応援・消火を選んで「配属」。ステータス(実行可/不足)にカーソルを乗せると詳細が見えます。
    </p>
  </section>
</template>
