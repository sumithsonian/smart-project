<script setup lang="ts">
/** ゲーム開始前の設定パネル(GameConfig 編集はここでのみ可能) */
import { reactive, ref } from 'vue'
import { DEFAULT_CONFIG, DEFAULT_CONTENT } from '@smart-project/engine'
import type { GameConfig, Role } from '@smart-project/engine'

const { dispatch } = useGame()

const seed = ref(Math.floor(Math.random() * 2 ** 31)) // UI 側でシード生成(エンジンには渡すだけ)
// v2.2 配属トリアージは手触り確認のため UI 既定でオン(エンジン既定はオフ=v2.1互換)
const config = reactive<GameConfig>({
  ...DEFAULT_CONFIG,
  mismatchEnabled: true,
  outsourceEnabled: true,
  overqualifiedDiscount: 1,
})
const clientId = ref<string>('')
const projectCardId = ref<string>('')
const projectSheetId = ref<string>(DEFAULT_CONTENT.projectSheets[0]!.id)

const players = reactive<Array<{ id: string; name: string; role: Role }>>([
  { id: 'p1', name: 'プレイヤー1', role: 'pm' },
  { id: 'p2', name: 'プレイヤー2', role: 'director' },
  { id: 'p3', name: 'プレイヤー3', role: 'designer' },
  { id: 'p4', name: 'プレイヤー4', role: 'engineer' },
])

const numberFields: Array<{ key: keyof GameConfig; label: string }> = [
  { key: 'tokensPerPhase', label: 'トークン/フェーズ' },
  { key: 'fatigueMax', label: '疲労上限' },
  { key: 'fatiguePerTask', label: '通常タスク疲労' },
  { key: 'fatiguePerHeavyTask', label: '重タスク疲労' },
  { key: 'fatigueLv2TokenPenalty', label: 'Lv2補充ペナルティ' },
  { key: 'restRecovery', label: '休憩回復量' },
  { key: 'phaseEndRecovery', label: 'フェーズ末回復量' },
  { key: 'limitEventResetLevel', label: '限界後の疲労Lv' },
  { key: 'extraBillingBudget', label: '追加請求の予算回復' },
  { key: 'extraBillingCsCost', label: '追加請求のCSコスト' },
  { key: 'tasksPerPhase', label: 'タスク/フェーズ' },
  { key: 'learningTiles', label: '学習タイル数' },
  { key: 'skillMax', label: 'スキル上限' },
]

const fireFields: Array<{ key: keyof GameConfig; label: string }> = [
  { key: 'firePerPhase', label: '炎上カード/フェーズ' },
  { key: 'fireOutbreakThreshold', label: '延焼閾値' },
  { key: 'fireOutbreakCsPenalty', label: '延焼CSペナルティ' },
  { key: 'extinguishCost', label: '消火コスト' },
  { key: 'epidemicCount', label: '大炎上カード数' },
  { key: 'milestoneCount', label: 'マイルストーン数' },
  { key: 'personalGoalChoices', label: '個人目標の配布枚数' },
]

const triageFields: Array<{ key: keyof GameConfig; label: string }> = [
  { key: 'understaffFatigue', label: 'やっつけ追加疲労' },
  { key: 'understaffCsPenalty', label: 'やっつけCS債務' },
  { key: 'overqualifiedDiscount', label: '過剰スペック割引' },
  { key: 'outsourceBudgetCost', label: '外注の予算コスト' },
  { key: 'outsourceCsCost', label: '外注のCSコスト' },
  { key: 'outsourcePerPhase', label: '外注上限/フェーズ' },
]

function start() {
  dispatch({
    type: 'SETUP_GAME',
    seed: seed.value,
    players: players.map((p) => ({ ...p })),
    config: { ...config },
    ...(clientId.value ? { clientId: clientId.value } : {}),
    ...(projectCardId.value ? { projectCardId: projectCardId.value } : {}),
    projectSheetId: projectSheetId.value,
  })
}
</script>

<template>
  <section class="panel">
    <h2>ゲーム設定</h2>
    <div class="setup-grid">
      <fieldset>
        <legend>プレイヤー</legend>
        <div v-for="p in players" :key="p.id" class="row">
          <input v-model="p.name" />
          <span class="muted">{{ p.role }}</span>
        </div>
        <div class="row">
          <label>シード <input v-model.number="seed" type="number" /></label>
        </div>
      </fieldset>

      <fieldset>
        <legend>シナリオ</legend>
        <label class="row">クライアント
          <select v-model="clientId">
            <option value="">ランダム</option>
            <option v-for="c in DEFAULT_CONTENT.clients" :key="c.id" :value="c.id">
              {{ c.name }}(Q{{ c.weights.q }}/C{{ c.weights.c }}/D{{ c.weights.d }})
            </option>
          </select>
        </label>
        <label class="row">プロジェクト
          <select v-model="projectCardId">
            <option value="">ランダム</option>
            <option v-for="c in DEFAULT_CONTENT.projects" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </label>
        <label class="row">プロジェクトシート
          <select v-model="projectSheetId">
            <option v-for="s in DEFAULT_CONTENT.projectSheets" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </label>
      </fieldset>

      <fieldset>
        <legend>GameConfig(バランス調整)</legend>
        <div class="config-grid">
          <label v-for="f in numberFields" :key="f.key">
            {{ f.label }}
            <input v-model.number="(config[f.key] as number)" type="number" />
          </label>
          <label>QCD重み方式
            <select v-model="config.qcdWeightMode">
              <option value="multiply">multiply(乗算)</option>
              <option value="add">add(加算)</option>
            </select>
          </label>
          <label>CS&lt;0で即敗北
            <input v-model="config.csInstantLose" type="checkbox" />
          </label>
          <label>トークン持ち越し
            <input v-model="config.carryOverTokens" type="checkbox" />
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>v2.1 炎上 / EP / マイルストーン</legend>
        <div class="config-grid">
          <label>🔥 炎上システム
            <input v-model="config.fireEnabled" type="checkbox" />
          </label>
          <label>🤝 EP
            <input v-model="config.epEnabled" type="checkbox" />
          </label>
          <label>🏅 マイルストーン
            <input v-model="config.milestonesEnabled" type="checkbox" />
          </label>
          <label v-for="f in fireFields" :key="f.key">
            {{ f.label }}
            <input v-model.number="(config[f.key] as number)" type="number" />
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>v2.2 配属トリアージ(スキルと配属)</legend>
        <p class="muted hint">
          スキル未達のタスクを「やっつけ」(成果物ダウン+疲労+CS債務)で解決可能にし、過剰スペックには割引、
          外注で専門席を金で充足できる。供給&lt;需要の配属トリアージを試す実験機能。
        </p>
        <div class="config-grid">
          <label>🎓 やっつけ解決を許可
            <input v-model="config.mismatchEnabled" type="checkbox" />
          </label>
          <label>📉 やっつけで成果物ダウン
            <input v-model="config.understaffDowngrade" type="checkbox" />
          </label>
          <label>🏷️ 外注を許可
            <input v-model="config.outsourceEnabled" type="checkbox" />
          </label>
          <label v-for="f in triageFields" :key="f.key">
            {{ f.label }}
            <input v-model.number="(config[f.key] as number)" type="number" />
          </label>
        </div>
      </fieldset>
    </div>
    <button class="primary" @click="start">ゲーム開始</button>
  </section>
</template>
