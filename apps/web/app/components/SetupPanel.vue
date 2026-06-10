<script setup lang="ts">
/** ゲーム開始前の設定パネル(GameConfig 編集はここでのみ可能) */
import { reactive, ref } from 'vue'
import { DEFAULT_CONFIG, DEFAULT_CONTENT } from '@smart-project/engine'
import type { GameConfig, Role } from '@smart-project/engine'

const { dispatch } = useGame()

const seed = ref(Math.floor(Math.random() * 2 ** 31)) // UI 側でシード生成(エンジンには渡すだけ)
const config = reactive<GameConfig>({ ...DEFAULT_CONFIG })
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
    </div>
    <button class="primary" @click="start">ゲーム開始</button>
  </section>
</template>
