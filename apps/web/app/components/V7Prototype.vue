<script setup lang="ts">
const {
  state, notice, taskOf, usedDays, candidatesFor, boardTask, remainingDays, gameFinished,
  plan, lead, support, work, learn, handoff, urgent, investigate, resolveIncident, extinguish,
  drawEvent, nextWeek, reset,
} = useV7Game()
const selectedPlayer = ref('a')
const statusLabel = { unknown: '原因不明', investigated: '原因究明済み', resolved: '原因解決済み' }
</script>

<template>
  <main class="v7-shell">
    <header class="v7-hud">
      <div><strong>SMART PROJECT v7</strong><span>2フェーズ・コア検証版</span></div>
      <div class="v7-round">フェーズ {{ Math.min(state.phase, 2) }} / 2　週 {{ state.week }} / 3　CS {{ state.cs }}</div>
      <button @click="reset">リセット</button>
    </header>

    <div class="v7-notice">{{ notice }}</div>

    <section class="v7-players">
      <article v-for="player in state.players" :key="player.id" :class="['v7-player', { selected: selectedPlayer === player.id }]" @click="selectedPlayer = player.id">
        <div class="v7-player-title"><strong>{{ player.name }}</strong><span>残り {{ remainingDays(player.id) }}日</span></div>
        <div class="v7-days">
          <i v-for="day in 5" :key="day" :class="{ used: day <= usedDays(player.id), locked: day > player.workdayCapacity }">{{ day }}</i>
        </div>
        <small>📋{{ player.skills.direction }} 🎨{{ player.skills.design }} ⚙{{ player.skills.engineering }}</small>
        <button @click.stop="learn(player.id)">📚 学習に1日</button>
        <em v-if="player.pendingCapacityGain">次週 +{{ player.pendingCapacityGain }}日</em>
      </article>
    </section>

    <section class="v7-grid">
      <div class="v7-main">
        <h2>成果物ロードマップ</h2>
        <div class="v7-slots">
          <article v-for="slot in state.slots" :key="slot.id" class="v7-slot">
            <header><strong>{{ slot.name }}</strong><span>{{ slot.completedByTaskId ? '完成' : '未完成' }}</span></header>
            <template v-if="!state.board.some(t => t.slotId === slot.id)">
              <p>作り方を1枚選ぶ</p>
              <button v-for="candidate in candidatesFor(slot.id)" :key="candidate.id" @click="plan(candidate.id)">
                {{ candidate.name }} / {{ candidate.effort }}日 / Lv{{ candidate.quality }}
              </button>
            </template>
            <template v-else>
              <div v-for="task in state.board.filter(t => t.slotId === slot.id)" :key="task.taskId" class="v7-task">
                <div class="v7-task-head"><strong>{{ taskOf(task.taskId)?.name }}</strong><span>進捗 {{ task.progress }}/{{ taskOf(task.taskId)?.effort }}</span></div>
                <div class="v7-fire" v-if="task.fire">🔥 {{ task.fire }}　通常進捗停止</div>
                <p>主: {{ state.players.find(p => p.id === task.leadPlayerId)?.name ?? '未定' }} / 副: {{ state.players.find(p => p.id === task.supportPlayerId)?.name ?? '未定' }}</p>
                <div class="v7-actions">
                  <button v-if="!task.leadPlayerId" @click="lead(selectedPlayer, task.taskId)">選択中を主担当</button>
                  <button v-else-if="!task.supportPlayerId && task.leadPlayerId !== selectedPlayer" @click="support(selectedPlayer, task.taskId)">選択中を副担当</button>
                  <button @click="work(selectedPlayer, task.taskId)">1日進める</button>
                  <button v-if="task.leadPlayerId && task.leadPlayerId !== selectedPlayer" @click="handoff(selectedPlayer, task.taskId)">通常引継ぎ 各1日</button>
                  <button @click="urgent(selectedPlayer, task.taskId)">緊急引継ぎ 3日</button>
                  <button v-if="task.fire" @click="extinguish(task.taskId, selectedPlayer)">消火 1日</button>
                </div>
                <div v-for="incident in state.incidents.filter(i => i.taskId === task.taskId)" :key="incident.id" class="v7-incident">
                  <strong>{{ incident.source === 'project' ? '全体' : '個人' }}イベント：{{ incident.name }}</strong>
                  <span>{{ statusLabel[incident.status] }}</span>
                  <small v-if="incident.status === 'unknown'">週末に🔥+1・閾値で{{ incident.spreadTarget }}へ飛び火</small>
                  <button v-if="incident.status === 'unknown'" @click="investigate(incident.id, selectedPlayer)">原因究明 1日</button>
                  <button v-else-if="incident.status === 'investigated'" @click="resolveIncident(incident.id, selectedPlayer)">原因対応 1日</button>
                </div>
              </div>
            </template>
          </article>
        </div>
      </div>

      <aside class="v7-side">
        <section>
          <h2>外的イベント</h2>
          <p>選択中：{{ state.players.find(p => p.id === selectedPlayer)?.name }}</p>
          <button @click="drawEvent('personal', selectedPlayer)">個人イベントを引く</button>
          <button @click="drawEvent('project')">プロジェクトイベント</button>
        </section>
        <section>
          <h2>前フェーズの置き土産</h2>
          <p v-if="state.availableTiles.length === 0">フェーズ1終了時に生成</p>
          <article v-for="tile in state.availableTiles" :key="tile.id" :class="['v7-tile', tile.kind]">
            <strong>{{ tile.kind === 'asset' ? '資産' : '負債' }}：{{ tile.name }}</strong>
            <small>{{ tile.source }} / 工数{{ tile.effortModifier > 0 ? '+' : '' }}{{ tile.effortModifier }}</small>
          </article>
        </section>
        <section>
          <h2>検証指標</h2>
          <dl>
            <dt>通常引継ぎ</dt><dd>{{ state.metrics.normalHandoffs }}</dd>
            <dt>緊急引継ぎ</dt><dd>{{ state.metrics.urgentHandoffs }}</dd>
            <dt>炎上対応日</dt><dd>{{ state.metrics.fireActions }}</dd>
            <dt>学習日</dt><dd>{{ state.metrics.learningDays }}</dd>
            <dt>並行作業週</dt><dd>{{ state.metrics.parallelWorkWeeks }}</dd>
          </dl>
        </section>
      </aside>
    </section>

    <footer class="v7-footer">
      <button class="v7-next" :disabled="gameFinished" @click="nextWeek">週末処理 → 次の週</button>
      <span>未究明炎上は増加し、3🔥でカード記載先へ飛び火します。</span>
    </footer>
  </main>
</template>

<style scoped>
.v7-shell{min-height:100vh;background:#17211d;color:#eee;padding-bottom:90px;font-family:system-ui,'Noto Sans JP',sans-serif}.v7-hud{position:sticky;top:0;z-index:5;background:#101814eF;backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:space-between;padding:14px 22px;border-bottom:1px solid #506557}.v7-hud strong{font-size:20px}.v7-hud span{margin-left:12px;color:#a9b9ae;font-size:12px}.v7-hud button,.v7-shell button{border:1px solid #748a7b;background:#25362e;color:#fff;border-radius:7px;padding:7px 10px;cursor:pointer}.v7-notice{margin:14px auto;max-width:1400px;background:#ead9a9;color:#302815;padding:10px 14px;border-radius:8px}.v7-players{max-width:1400px;margin:auto;display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.v7-player{background:#223129;border:2px solid transparent;border-radius:10px;padding:12px;cursor:pointer}.v7-player.selected{border-color:#ffd66b}.v7-player-title{display:flex;justify-content:space-between}.v7-days{display:flex;gap:5px;margin:10px 0}.v7-days i{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:#d6b15e;color:#211;font-style:normal}.v7-days i.used{background:#57655c;color:#bac3bd}.v7-days i.locked{background:#121915;color:#59645e}.v7-player button{float:right}.v7-player em{font-size:11px;color:#ffd66b}.v7-grid{max-width:1400px;margin:16px auto;display:grid;grid-template-columns:1fr 310px;gap:16px}.v7-main,.v7-side section{background:#f2ecdc;color:#26251f;border-radius:12px;padding:16px}.v7-main h2,.v7-side h2{margin:0 0 12px}.v7-slots{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.v7-slot{border:2px dashed #958d74;border-radius:10px;padding:12px;min-height:320px}.v7-slot header,.v7-task-head{display:flex;justify-content:space-between}.v7-slot>button{display:block;width:100%;margin:8px 0;background:#fff;color:#332}.v7-task{margin-top:12px}.v7-task p{font-size:13px}.v7-actions{display:flex;flex-wrap:wrap;gap:5px}.v7-actions button{font-size:11px}.v7-fire{background:#a93524;color:#fff;padding:6px;border-radius:5px;margin:8px 0}.v7-incident{margin-top:10px;background:#49261f;color:#fff0e8;border-radius:8px;padding:9px;display:grid;gap:5px}.v7-incident small{color:#ffc1aa}.v7-side{display:flex;flex-direction:column;gap:12px}.v7-side section button{width:100%;margin:4px 0}.v7-tile{padding:8px;border-radius:7px;margin:6px 0;display:grid}.v7-tile.asset{background:#cfe8d2}.v7-tile.debt{background:#f0c9c2}.v7-side dl{display:grid;grid-template-columns:1fr auto;gap:5px;margin:0}.v7-side dd{font-weight:bold}.v7-footer{position:fixed;bottom:0;left:0;right:0;background:#101814eF;display:flex;align-items:center;gap:18px;padding:12px 22px}.v7-next{background:#c99c37!important;color:#211!important;font-weight:bold;font-size:16px}.v7-footer span{font-size:12px;color:#bdc9c0}@media(max-width:900px){.v7-players{grid-template-columns:repeat(2,1fr);padding:0 10px}.v7-grid{display:block;margin:12px 10px}.v7-slots{display:block}.v7-slot{margin-bottom:12px;min-height:0}.v7-side{margin-top:12px}.v7-hud span{display:none}.v7-round{font-size:12px}.v7-footer span{display:none}}
</style>
