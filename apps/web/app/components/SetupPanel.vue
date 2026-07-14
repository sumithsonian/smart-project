<script setup lang="ts">
/** ゲーム開始前の設定パネル(プレイヤー・PM帽子・プロジェクトシート・GameConfig 編集はここでのみ可能) */
import { computed, reactive, ref } from 'vue'
import { DEFAULT_CONFIG, DEFAULT_CONTENT } from '@smart-project/engine'
import type { GameConfig } from '@smart-project/engine'

const { dispatch, projectSheetOf } = useGame()

const seed = ref(Math.floor(Math.random() * 2 ** 31)) // UI 側でシード生成(エンジンには渡すだけ)
const config = reactive<GameConfig>({ ...DEFAULT_CONFIG })
const projectSheetId = ref<string>(DEFAULT_CONTENT.projectSheets[0]!.id)

interface PlayerRow { id: string; name: string; memberId: string }
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

/** GameConfig の編集可能フィールド(rules-v4-core.md §6。playerCount は人数から自動算出) */
const numberFields: Array<{ key: keyof GameConfig; label: string }> = [
  { key: 'phases', label: 'フェーズ数' },
  { key: 'roundsPerPhase', label: '1フェーズの週数' },
  { key: 'skillMax', label: 'スキル上限' },
  { key: 'acceptancePerPhase', label: '検収条件/フェーズ' },
  { key: 'draftPool', label: '候補プール枚数' },
  { key: 'commitPenaltyCs', label: '約束未達CS減' },
  { key: 'finalMissCs', label: '最終検収:未達成CS減' },
  { key: 'finalCompromiseCs', label: '最終検収:Lv妥協CS減' },
  { key: 'qualityOvershoot', label: '納品前Lv2積み増し量' },
  { key: 'upgradeCost', label: '納品後の改修コスト' },
  { key: 'firePerRound', label: '炎上カード/週' },
  { key: 'fireOutbreakThreshold', label: '延焼閾値' },
  { key: 'fatigueMax', label: '疲労上限' },
  { key: 'noOvertimeAtFatigue', label: '残業禁止の疲労値' },
  { key: 'limitResetFatigue', label: '限界イベント後の疲労' },
  { key: 'overtimeFatigue', label: '残業の即時疲労' },
  { key: 'restRecovery', label: '休憩の疲労回復量' },
  { key: 'phaseEndRecovery', label: 'フェーズ末の疲労回復量' },
  { key: 'initialCs', label: '初期CS' },
  { key: 'initialBudget', label: '初期予算' },
  { key: 'extraBillingBudget', label: '追加請求の予算回復' },
  { key: 'extraBillingCsCost', label: '追加請求のCSコスト' },
  { key: 'extraBillingPerPhase', label: '追加請求上限/フェーズ' },
]

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
    config: { ...config, playerCount: players.length },
    projectSheetId: projectSheetId.value,
  })
}
</script>

<template>
  <section class="panel">
    <h2>ゲーム設定</h2>
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
            <input type="radio" :value="p.id" v-model="pmPlayerId" name="pm" /> PM帽子
          </label>
        </div>
        <div class="row">
          <button :disabled="players.length >= 5" @click="addPlayer">+ プレイヤー追加(最大5)</button>
          <button :disabled="players.length <= 4" @click="removePlayer">- 削除(最小4)</button>
        </div>
        <div class="row">
          <label>シード <input v-model.number="seed" type="number" /></label>
        </div>
      </fieldset>

      <fieldset>
        <legend>プロジェクトシート</legend>
        <div v-for="s in DEFAULT_CONTENT.projectSheets" :key="s.id" class="row">
          <label>
            <input type="radio" :value="s.id" v-model="projectSheetId" name="sheet" />
            <strong>{{ s.name }}</strong> — CS{{ s.initialCs }} / 予算{{ s.initialBudget }}
          </label>
        </div>
        <p class="muted">{{ projectSheetOf(projectSheetId)?.description }}</p>
      </fieldset>

      <fieldset class="wide">
        <legend>GameConfig(バランス調整。rules-v4-core.md §6)</legend>
        <div class="config-grid">
          <label v-for="f in numberFields" :key="f.key">
            {{ f.label }}
            <input v-model.number="(config[f.key] as number)" type="number" />
          </label>
          <label>CS&lt;0で即敗北
            <input v-model="config.csInstantLose" type="checkbox" />
          </label>
        </div>
      </fieldset>
    </div>
    <button class="primary" @click="start">ゲーム開始</button>
  </section>
</template>
