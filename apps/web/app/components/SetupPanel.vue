<script setup lang="ts">
/**
 * ゲーム開始前の設定パネル。
 * 通常はプレイヤーとシナリオだけを見せ、GameConfig(バランス調整)は
 * 「詳細設定」に折りたたむ(RULES.md §10-4)。
 */
import { computed, reactive, ref } from 'vue'
import { DEFAULT_CONFIG, DEFAULT_CONTENT } from '@smart-project/engine'
import type { GameConfig } from '@smart-project/engine'

const { dispatch, projectSheetOf } = useGame()

const seed = ref(Math.floor(Math.random() * 2 ** 31)) // UI 側でシード生成(エンジンには渡すだけ)
const config = reactive<GameConfig>({ ...DEFAULT_CONFIG })
const projectSheetId = ref<string>(DEFAULT_CONTENT.projectSheets[0]!.id)
const advancedOpen = ref(false)

interface PlayerRow {
  id: string
  name: string
  memberId: string
}
const players = reactive<PlayerRow[]>([
  { id: 'p1', name: 'プレイヤー1', memberId: '' },
  { id: 'p2', name: 'プレイヤー2', memberId: '' },
  { id: 'p3', name: 'プレイヤー3', memberId: '' },
  { id: 'p4', name: 'プレイヤー4', memberId: '' },
])
const pmPlayerId = ref('p1')

function addPlayer() {
  if (players.length >= 5) return
  const n = players.length + 1
  players.push({ id: `p${n}`, name: `プレイヤー${n}`, memberId: '' })
}
function removePlayer() {
  if (players.length <= 4) return
  players.pop()
  if (!players.some((p) => p.id === pmPlayerId.value)) {
    pmPlayerId.value = players[0]!.id
  }
}

/** GameConfig の編集可能フィールド(RULES.md §11。playerCount は人数から自動算出) */
const configGroups: Array<{ title: string; fields: Array<{ key: keyof GameConfig; label: string }> }> = [
  {
    title: '規模',
    fields: [
      { key: 'phases', label: 'フェーズ数' },
      { key: 'roundsPerPhase', label: '1フェーズの週数(=計画ボードの週数)' },
      { key: 'skillMax', label: 'スキル上限' },
      { key: 'draftPool', label: '候補プール枚数' },
    ],
  },
  {
    title: 'スコープ(Must / Better)',
    fields: [
      { key: 'mustMissCs', label: 'Must 未達の CS 減' },
      { key: 'betterMeetCs', label: 'Better 達成の CS 増' },
      { key: 'allMustBonusCs', label: '信頼ボーナス(Must 全達成)' },
      { key: 'demoteMustCs', label: 'Must → Better 化の CS' },
      { key: 'dropMustCs', label: 'Must → 見送りの CS' },
      { key: 'extendDeadlineBudget', label: '期限延長の予算' },
      { key: 'scopeChangePerPhase', label: 'スコープ交渉の回数/フェーズ' },
      { key: 'redrawPerPhase', label: '引き直しの回数/フェーズ' },
    ],
  },
  {
    title: '品質',
    fields: [
      { key: 'qualityOvershoot', label: '納品前 Lv2 積み増し量' },
      { key: 'upgradeCost', label: '納品後の改修コスト' },
      { key: 'qualityRiskEffortPenalty', label: '品質リスクの手戻り工数増' },
      { key: 'qualityRiskPrereqPenalty', label: '粗い土台による後続の工数増' },
      { key: 'finalMissCs', label: '最終検収:未達成 CS 減' },
      { key: 'finalCompromiseCs', label: '最終検収:Lv 妥協 CS 減' },
    ],
  },
  {
    title: '割り込み・炎上',
    fields: [
      { key: 'interruptCapacity', label: '割り込みレーンの枠数' },
      { key: 'overflowCs', label: 'あふれ1件の CS 減' },
      { key: 'declineCs', label: '謝絶1件の CS 減' },
      { key: 'capacityDownCubes', label: '他案件ヘルプの人日減' },
      { key: 'firePerRound', label: '炎上カード/週' },
      { key: 'fireOutbreakThreshold', label: '延焼閾値' },
    ],
  },
  {
    title: '疲労・経済',
    fields: [
      { key: 'fatigueMax', label: '疲労上限' },
      { key: 'noOvertimeAtFatigue', label: '残業禁止の疲労値' },
      { key: 'limitResetFatigue', label: '限界イベント後の疲労' },
      { key: 'overtimeFatigue', label: '残業の即時疲労' },
      { key: 'restRecovery', label: '休憩の疲労回復量' },
      { key: 'phaseEndRecovery', label: 'フェーズ末の疲労回復量' },
      { key: 'initialCs', label: '初期 CS' },
      { key: 'initialBudget', label: '初期予算' },
      { key: 'extraBillingBudget', label: '追加請求の予算回復' },
      { key: 'extraBillingCsCost', label: '追加請求の CS コスト' },
      { key: 'extraBillingPerPhase', label: '追加請求の回数/フェーズ' },
    ],
  },
]

/** リスク別の実工数補正(RULES.md §2-2)。カンマ区切りで編集する */
const riskInputs = reactive({
  low: DEFAULT_CONFIG.riskVariance.low.join(','),
  medium: DEFAULT_CONFIG.riskVariance.medium.join(','),
  high: DEFAULT_CONFIG.riskVariance.high.join(','),
})
function parseVariance(text: string, fallback: number[]): number[] {
  const values = text
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isFinite(v))
  return values.length > 0 ? values : fallback
}

const memberOptions = computed(() => DEFAULT_CONTENT.members)

function start() {
  dispatch({
    type: 'SETUP_GAME',
    seed: seed.value,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      ...(p.memberId ? { memberId: p.memberId } : {}),
    })),
    pmPlayerId: pmPlayerId.value,
    config: {
      ...config,
      playerCount: players.length,
      riskVariance: {
        low: parseVariance(riskInputs.low, DEFAULT_CONFIG.riskVariance.low),
        medium: parseVariance(riskInputs.medium, DEFAULT_CONFIG.riskVariance.medium),
        high: parseVariance(riskInputs.high, DEFAULT_CONFIG.riskVariance.high),
      },
    },
    projectSheetId: projectSheetId.value,
  })
}
</script>

<template>
  <div class="setup-screen">
    <section class="setup-panel">
      <h1>スマートプロジェクト</h1>
      <p class="setup-lede">
        Web 制作会社のチームとして、1つの案件を完遂する協力ゲームです。<br />
        <strong>全部は約束できません。</strong>どの成果を Must にし、どの手段で行き、何を見切るか —
        毎週それを決めていきます。
      </p>

      <div class="setup-grid">
        <fieldset>
          <legend>プレイヤー({{ players.length }}人)</legend>
          <div v-for="p in players" :key="p.id" class="row">
            <input v-model="p.name" />
            <select v-model="p.memberId">
              <option value="">メンバーカード:ランダム</option>
              <option v-for="m in memberOptions" :key="m.id" :value="m.id">{{ m.name }}</option>
            </select>
            <label>
              <input v-model="pmPlayerId" type="radio" :value="p.id" name="pm" /> PM 帽子
            </label>
          </div>
          <div class="row">
            <button :disabled="players.length >= 5" @click="addPlayer">+ 追加(最大5)</button>
            <button :disabled="players.length <= 4" @click="removePlayer">- 削除(最小4)</button>
          </div>
        </fieldset>

        <fieldset>
          <legend>プロジェクトシート</legend>
          <div v-for="s in DEFAULT_CONTENT.projectSheets" :key="s.id" class="row">
            <label>
              <input v-model="projectSheetId" type="radio" :value="s.id" name="sheet" />
              <strong>{{ s.name }}</strong> — CS{{ s.initialCs }} / 予算{{ s.initialBudget }}
            </label>
          </div>
          <p class="muted">{{ projectSheetOf(projectSheetId)?.description }}</p>
        </fieldset>
      </div>

      <div class="setup-advanced">
        <button class="setup-advanced-toggle" @click="advancedOpen = !advancedOpen">
          {{ advancedOpen ? '▾' : '▸' }} 詳細設定(バランス調整・シード)
        </button>
        <div v-if="advancedOpen" class="setup-advanced-body">
          <fieldset>
            <legend>乱数シード</legend>
            <div class="row">
              <label>
                シード <input v-model.number="seed" type="number" />
              </label>
              <span class="muted">同じシード・同じ操作なら、必ず同じ展開になります</span>
            </div>
          </fieldset>

          <fieldset>
            <legend>見積の振れ幅(リスク別・カンマ区切り)</legend>
            <div class="config-grid">
              <label>低リスク <input v-model="riskInputs.low" /></label>
              <label>中リスク <input v-model="riskInputs.medium" /></label>
              <label>高リスク <input v-model="riskInputs.high" /></label>
            </div>
            <p class="muted">見積工数にこの値のどれかが足されて実工数になります。</p>
          </fieldset>

          <fieldset v-for="g in configGroups" :key="g.title">
            <legend>{{ g.title }}</legend>
            <div class="config-grid">
              <label v-for="f in g.fields" :key="f.key">
                {{ f.label }}
                <input v-model.number="(config[f.key] as number)" type="number" />
              </label>
              <label v-if="g.title === '疲労・経済'">
                CS&lt;0 で即敗北
                <input v-model="config.csInstantLose" type="checkbox" />
              </label>
            </div>
          </fieldset>
        </div>
      </div>

      <button class="primary setup-start" @click="start">ゲーム開始</button>
    </section>
  </div>
</template>
