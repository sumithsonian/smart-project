<script setup lang="ts">
/**
 * 進行バー(TurnDirector):ゲームを「次に進める」導線をここ一箇所に集約する。
 * これまでステップごとに別コンポーネント・別の縦位置に散らばっていた
 * 「イベントを解決」「会議を締める」「週末を締める」「次フェーズへ」を統合する。
 * ヘッダー直下・started 後は常時表示(sticky で上部固定)。
 * 個別の対象への操作(約束/配置/納品/配属/準備完了/交渉/請求)は各パネルに残したまま、
 * 「ステップ全体を次に進める」操作だけをここに置く。
 *
 * 教育目的も兼ねる(未経験者がプロジェクトの進め方を追体験):
 * 上段=プロジェクト進行ステッパー(今どのフェーズ・何週目か)、
 * 中段=工程名+実務の意味(教育) / 具体的な操作導線、下段=進捗チェックと主要アクション。
 */
import { computed } from 'vue'

const {
  state,
  dispatch,
  reset,
  eventCardOf,
  limitEventCardOf,
  playerName,
  requiredCubesOf,
  phaseNames,
} = useGame()

const step = computed(() => state.value.step)
const pending = computed(() => state.value.pendingEvent)
const isLimitEvent = computed(() => pending.value?.kind === 'limit')

/** ── プロジェクト進行ステッパー(フェーズ) ── */
const phaseCount = computed(() => state.value.config.phases)
const phaseSteps = computed(() =>
  Array.from({ length: phaseCount.value }, (_, i) => {
    const n = i + 1
    return {
      n,
      name: phaseNames[i] ?? `フェーズ${n}`,
      status: n < state.value.phase ? 'done' : n === state.value.phase ? 'current' : 'future',
    } as const
  }),
)
/** 現在フェーズ内の週ドット(スコープ会議中は「計画中」表示) */
const roundsPerPhase = computed(() => state.value.config.roundsPerPhase)
const weekDots = computed(() =>
  Array.from({ length: roundsPerPhase.value }, (_, i) => i + 1 <= state.value.week),
)

/** イベント対応中のカード名(週初トラブル/限界イベント) */
const pendingCardName = computed(() => {
  if (!pending.value) return null
  if (isLimitEvent.value) return limitEventCardOf(pending.value.cardId)?.name ?? pending.value.cardId
  return eventCardOf(pending.value.cardId)?.name ?? pending.value.cardId
})
const pendingTargetName = computed(() =>
  pending.value?.targetPlayerId ? playerName(pending.value.targetPlayerId) : null,
)

/** 上段:工程名 + 実務の意味(教育目的の解説) */
const meaningText = computed(() => {
  if (pending.value) {
    return '⚠ 想定外の出来事 — プロジェクトにはつきもの。内容を確認して対応します。'
  }
  switch (step.value) {
    case 'scope_meeting':
      return '📋 スコープ会議 — お客様の要求(検収条件)から今フェーズで"やると約束"するものを選び、作業をWBSに並べます。実務のキックオフ/計画づくりに当たります。'
    case 'standup':
      return '🗣 朝会 — 今週、誰がどの作業を担当するか割り振ります。得意な人ほど速く進みます。'
    case 'weekend':
      return '📦 週末の納品 — 完成した成果物を納品してプロダクトに反映します。まだなら次週へ持ち越し。'
    case 'phase_end':
      return '🔍 フェーズ振り返り — お客様との約束の達成状況を清算します。'
    case 'finished':
      return '🏁 ゲーム終了 — 最終検収の結果を振り返りましょう。'
    default:
      return ''
  }
})

/** 下段:今の具体的な操作導線(どのパネルで何を押すか) */
const actionGuideText = computed(() => {
  if (pending.value) {
    return `「${pendingCardName.value}」${pendingTargetName.value ? `(${pendingTargetName.value})` : ''} の内容を確認して『イベントを解決』`
  }
  switch (step.value) {
    case 'scope_meeting':
      return '約束する条件(検収条件ボード)と、置くタスク(スコープ会議)を選ぶ →『会議を締める』'
    case 'standup':
      return '各プレイヤーの配属を決めて『準備完了』(下のプレイヤーボード)。全員決まると自動で週末へ'
    case 'weekend':
      return '納品できるタスクをWBSボードで納品し、PMが『週末を締める』'
    case 'phase_end':
      return '清算ログを確認して『次フェーズへ』'
    case 'finished':
      return '結果を確認して『新しいゲーム』へ'
    default:
      return ''
  }
})

/** 進捗チェック */
const readyCount = computed(() => state.value.readyPlayerIds.length)
const totalPlayers = computed(() => state.value.players.length)
const notReadyNames = computed(() =>
  state.value.players.filter((p) => !state.value.readyPlayerIds.includes(p.id)).map((p) => p.name),
)
const deliverableWaitingCount = computed(
  () => state.value.board.filter((t) => t.cubes >= requiredCubesOf(t)).length,
)
const placedTaskCount = computed(() => state.value.board.filter((t) => !t.interrupt).length)

const progressText = computed(() => {
  if (pending.value) return null
  switch (step.value) {
    case 'scope_meeting':
      return `約束 ${state.value.commitments.length} / 配置 ${placedTaskCount.value}`
    case 'standup':
      return notReadyNames.value.length > 0
        ? `準備完了 ${readyCount.value}/${totalPlayers.value}(残り: ${notReadyNames.value.join('、')})`
        : `準備完了 ${readyCount.value}/${totalPlayers.value}`
    case 'weekend':
      return `納品待ち(必要工数達成・未納品)${deliverableWaitingCount.value}件`
    default:
      return null
  }
})

/** 主要アクション(唯一の"進める"ボタン) */
type ActionSpec = { label: string; pmAction: boolean; disabledReason: string | null; onClick: () => void } | null

const action = computed<ActionSpec>(() => {
  if (pending.value) {
    return { label: 'イベントを解決', pmAction: false, disabledReason: null, onClick: resolveEvent }
  }
  switch (step.value) {
    case 'scope_meeting':
      return { label: '会議を締める', pmAction: true, disabledReason: null, onClick: finishScope }
    case 'weekend': {
      const suffix = state.value.week >= state.value.config.roundsPerPhase ? 'フェーズ終了へ' : '次週へ'
      const blocked = state.value.pendingLimitPlayerIds.length > 0
      return {
        label: `週末を締める(${suffix})`,
        pmAction: true,
        disabledReason: blocked ? '限界イベントの処理が残っています' : null,
        onClick: endWeekend,
      }
    }
    case 'phase_end':
      return {
        label: state.value.phase >= state.value.config.phases ? '最終判定へ' : '次フェーズへ',
        pmAction: false,
        disabledReason: null,
        onClick: advancePhase,
      }
    case 'finished':
      return { label: '新しいゲーム', pmAction: false, disabledReason: null, onClick: reset }
    default:
      return null
  }
})

function resolveEvent() {
  dispatch({ type: 'RESOLVE_EVENT' })
}
function finishScope() {
  dispatch({ type: 'FINISH_SCOPE', playerId: state.value.pmPlayerId })
}
function endWeekend() {
  dispatch({ type: 'END_WEEKEND', playerId: state.value.pmPlayerId })
}
function advancePhase() {
  dispatch({ type: 'ADVANCE_PHASE' })
}
</script>

<template>
  <section class="turn-director" :class="{ 'turn-director--warn': !!pending }">
    <!-- 上段:プロジェクト進行ステッパー -->
    <div class="td-stepper-row">
      <ol class="td-stepper">
        <li
          v-for="p in phaseSteps"
          :key="p.n"
          class="td-phase"
          :class="p.status"
        >
          <span class="td-phase-num">{{ p.status === 'done' ? '✓' : p.n }}</span>
          <span class="td-phase-name">{{ p.name }}</span>
        </li>
      </ol>
      <div class="td-week">
        <span v-if="step === 'scope_meeting'" class="td-week-status">計画中</span>
        <template v-else>
          <span class="td-week-label">第{{ state.week }}週 / {{ roundsPerPhase }}週</span>
          <span class="td-week-dots">
            <span v-for="(filled, i) in weekDots" :key="i" class="td-week-dot" :class="{ filled }" />
          </span>
        </template>
      </div>
    </div>

    <!-- 中段:工程の意味(教育) + 操作導線 -->
    <div class="td-guide">
      <p class="td-meaning">{{ meaningText }}</p>
      <p class="td-action-guide">{{ actionGuideText }}</p>
    </div>

    <!-- 下段:進捗チェック + 主要アクション -->
    <div class="td-bottom-row">
      <span v-if="progressText" class="td-progress">{{ progressText }}</span>
      <span v-else-if="step === 'standup' && !pending" class="td-progress">
        全員が準備完了すると週末へ進みます
      </span>
      <div class="td-action">
        <template v-if="action">
          <button
            class="primary"
            :disabled="!!action.disabledReason"
            :title="action.disabledReason ?? ''"
            @click="action.onClick"
          >
            <span v-if="action.pmAction" title="PM 帽子の権限">👑</span>
            {{ action.label }}
          </button>
          <span v-if="action.disabledReason" class="td-blocked muted">{{ action.disabledReason }}</span>
        </template>
      </div>
    </div>
  </section>
</template>
