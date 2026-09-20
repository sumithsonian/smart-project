<script setup lang="ts">
const {
  state, notice, taskOf, usedDays, remainingDays, gameFinished,
  personalEventsDrawn, projectEventDue, marketTasks, guide, canEndWeek,
  plan, unplan, lead, support, work, learn, rest, handoff, urgent, investigate, resolveIncident, extinguish,
  drawEvent, nextWeek, reset,
} = useV7Game()
const selectedPlayer = ref('a')
const statusLabel = { unknown: '原因不明', investigated: '原因究明済み', resolved: '原因解決済み' }
const spreadLabel = { prerequisites: '前提タスク', dependents: '後続タスク', same_skill: '同じスキル', same_lead: '同じ主担当', cs: '顧客満足' }
const selectedName = computed(() => state.value.players.find((player) => player.id === selectedPlayer.value)?.name ?? '')
const selectedPlayerData = computed(() => state.value.players.find((player) => player.id === selectedPlayer.value))
const selectedLeadTask = computed(() => state.value.board.find((task) => task.leadPlayerId === selectedPlayer.value))
const selectedSupportTask = computed(() => state.value.board.find((task) => task.supportPlayerId === selectedPlayer.value))
const showDirector = ref(true)
const currentLeadTask = computed(() => state.value.board.find((task) => task.status !== 'completed' && !task.leadPlayerId))
const currentPersonalPlayer = computed(() => state.value.players.find((player) => !personalEventsDrawn.value.includes(player.id)))
const canLeadCurrentTask = (playerId: string) => {
  if (!currentLeadTask.value) return false
  const definition = taskOf(currentLeadTask.value.taskId)
  const player = state.value.players.find((candidate) => candidate.id === playerId)
  if (!definition || !player) return false
  return !state.value.board.some((task) => task.leadPlayerId === playerId)
    && player.skills[definition.skill] >= (definition.requiredSkillLevel ?? 1)
}
watch(() => guide.value.step, () => { showDirector.value = true })

function startAllocation() {
  showDirector.value = false
  selectedPlayer.value = state.value.players.find((player) => remainingDays(player.id) > 0)?.id ?? 'a'
}
</script>

<template>
  <main class="game-screen">
    <header class="topbar">
      <div class="brand"><strong>SMART PROJECT</strong><span>v7 CORE PROTOTYPE</span></div>
      <div class="round-strip">
        <b>PHASE {{ Math.min(state.phase, 2) }}<small>/ 2</small></b>
        <b>WEEK {{ state.week }}<small>/ 3</small></b>
        <b class="cs">CS {{ state.cs }}</b><b class="budget">予算 {{ state.budget }}</b>
      </div>
      <div class="top-actions"><button class="quiet" @click="showDirector = true">? 今やること</button><button class="quiet" @click="reset">↻ リセット</button></div>
    </header>

    <section class="navigator">
      <div class="step-badge">STEP {{ guide.step }}</div>
      <div class="guide-copy"><strong>{{ guide.title }}</strong><span>{{ guide.detail }}</span></div>
      <div class="step-dots" aria-label="進行状況">
        <i v-for="step in 6" :key="step" :class="{ done: step < guide.step, current: step === guide.step }">{{ step }}</i>
      </div>
      <div class="notice">{{ notice }}</div>
    </section>

    <section class="game-board">
      <aside class="member-rail panel">
        <div class="panel-heading"><strong>チーム</strong><small>メンバーを選択</small></div>
        <div class="team-list">
          <button
            v-for="player in state.players"
            :key="player.id"
            :class="['team-member', { selected: selectedPlayer === player.id }]"
            @click="selectedPlayer = player.id"
          >
            <span class="avatar">{{ player.name.slice(0, 1) }}</span>
            <span><b>{{ player.name }}</b><small>残り{{ remainingDays(player.id) }}人日・疲労{{ player.fatigue }}</small></span>
            <i v-if="personalEventsDrawn.includes(player.id)">✓</i>
          </button>
        </div>

        <article v-if="selectedPlayerData" class="personal-board">
          <header><div><small>PERSONAL BOARD</small><h2>{{ selectedPlayerData.name }}</h2></div><b>疲労 {{ selectedPlayerData.fatigue }} / {{ state.config.fatigueMax }}</b></header>
          <section>
            <label>今週の稼働（人日）</label>
            <div class="day-track large" :aria-label="`${selectedPlayerData.name}の営業日`">
              <i v-for="day in 5" :key="day" :class="{ used: day <= usedDays(selectedPlayer), locked: day > selectedPlayerData.workdayCapacity }">
                <span>{{ day > selectedPlayerData.workdayCapacity ? '🔒' : day }}</span>
              </i>
            </div>
          </section>
          <section><label>スキル</label><div class="skills large"><span>📋 {{ selectedPlayerData.skills.direction }}</span><span>🎨 {{ selectedPlayerData.skills.design }}</span><span>⚙ {{ selectedPlayerData.skills.engineering }}</span></div></section>
          <section class="assignment"><label>担当</label><p><span>主</span>{{ selectedLeadTask ? taskOf(selectedLeadTask.taskId)?.name : '未担当' }}</p><p><span>副</span>{{ selectedSupportTask ? taskOf(selectedSupportTask.taskId)?.name : '未担当' }}</p></section>
          <section class="growth"><label>成長</label><div><i :style="{ width: `${Math.min(100, selectedPlayerData.learningProgress / (selectedPlayerData.workdayCapacity === 3 ? state.config.learningCostTo4 : state.config.learningCostTo5) * 100)}%` }"></i></div><small v-if="selectedPlayerData.pendingCapacityGain">次週から稼働 +{{ selectedPlayerData.pendingCapacityGain }}人日</small><small v-else>学習して週の稼働を最大5人日まで解放</small></section>
          <div class="personal-actions">
            <button :disabled="remainingDays(selectedPlayer) < 1" @click="learn(selectedPlayer)">📚 学習 1人日</button>
            <button :disabled="remainingDays(selectedPlayer) < 1 || selectedPlayerData.fatigue === 0" @click="rest(selectedPlayer)">☕ 休憩 1人日</button>
            <button :class="{ recommended: guide.step === 4 && !personalEventsDrawn.includes(selectedPlayer) }" :disabled="personalEventsDrawn.includes(selectedPlayer)" @click="drawEvent('personal', selectedPlayer)">🎴 個人イベント</button>
          </div>
        </article>
      </aside>

      <section class="task-workspace panel">
        <div class="outcome-strip">
          <div v-for="slot in state.slots" :key="slot.id" :class="{ completed: slot.completedByTaskId }"><span>{{ slot.completedByTaskId ? '✓' : '○' }}</span><b>{{ slot.name }}</b><small>{{ slot.completedByTaskId ? '成果あり' : '未達' }}</small></div>
        </div>
        <div class="planned-area">
          <div class="workspace-heading"><div><strong>今週の計画</strong><small>最大{{ state.config.activeTaskLimit }}枚・複数タスクを並行できます</small></div><b>{{ state.board.filter(task => task.status !== 'completed').length }} / {{ state.config.activeTaskLimit }}</b></div>
          <div class="tile-grid planned-grid">
            <V7TaskTile v-for="boardTask in state.board.filter(task => task.status !== 'completed')" :key="boardTask.taskId" :task="taskOf(boardTask.taskId)!" :board-task="boardTask" :players="state.players" :slots="state.slots" :allocations="state.allocations" :selected-player-id="selectedPlayer" :remaining-days="remainingDays(selectedPlayer)" @unplan="unplan" @lead="lead" @support="support" @allocate="work" />
            <div v-for="index in Math.max(0, state.config.activeTaskLimit - state.board.filter(task => task.status !== 'completed').length)" :key="`empty-${index}`" class="empty-tile">タスク市場から<br>タイルを採用</div>
          </div>
          <article v-for="incident in state.incidents" :key="incident.id" class="incident-row"><div><strong>🔥 {{ incident.name }}</strong><span>{{ statusLabel[incident.status] }}・{{ spreadLabel[incident.spreadTarget] }}へ飛び火</span></div><button v-if="incident.status === 'unknown'" @click="investigate(incident.id, selectedPlayer)">原因究明 1人日</button><button v-else-if="incident.status === 'investigated'" @click="resolveIncident(incident.id, selectedPlayer)">原因対応 1人日</button><button v-else @click="extinguish(incident.taskId, selectedPlayer)">消火 1人日</button></article>
        </div>
        <div class="market-area">
          <div class="workspace-heading"><div><strong>公開タスク市場</strong><small>必要スキル・前提・人日を比較して採用</small></div><b>{{ marketTasks.length }}枚</b></div>
          <div class="tile-grid market-grid"><V7TaskTile v-for="task in marketTasks" :key="task.id" :task="task" :players="state.players" :slots="state.slots" :allocations="state.allocations" :selected-player-id="selectedPlayer" :remaining-days="remainingDays(selectedPlayer)" @plan="plan" /></div>
        </div>
      </section>

      <aside class="info-rail">
        <section class="panel event-panel">
          <div class="panel-heading"><strong>イベント</strong><small>外的要因を公開</small></div>
          <button v-if="projectEventDue" class="project-event recommended" @click="drawEvent('project')">🎴 プロジェクトイベントを引く</button>
          <div v-else class="event-status">✓ プロジェクトイベント解決済み</div>
          <p>個人イベント <b>{{ personalEventsDrawn.length }} / 4</b></p>
          <div class="mini-checks"><i v-for="player in state.players" :key="player.id" :class="{ done: personalEventsDrawn.includes(player.id) }">{{ player.name.slice(0, 1) }}</i></div>
        </section>

        <section class="panel carryover-panel">
          <div class="panel-heading"><strong>資産・負債</strong><small>前フェーズの結果</small></div>
          <p v-if="state.availableTiles.length === 0" class="empty">フェーズ1の成果が<br>ここに引き継がれます</p>
          <article v-for="tile in state.availableTiles" :key="tile.id" :class="['carry-tile', tile.kind]">
            <b>{{ tile.kind === 'asset' ? '資産' : '負債' }}｜{{ tile.name }}</b>
            <small>{{ tile.source }}</small><em>工数 {{ tile.effortModifier > 0 ? '+' : '' }}{{ tile.effortModifier }}</em>
          </article>
        </section>

        <section class="panel metrics-panel">
          <div class="panel-heading"><strong>プレイ指標</strong></div>
          <dl><dt>引継ぎ</dt><dd>{{ state.metrics.normalHandoffs }} / 緊急 {{ state.metrics.urgentHandoffs }}</dd><dt>炎上対応</dt><dd>{{ state.metrics.fireActions }}人日</dd><dt>学習</dt><dd>{{ state.metrics.learningDays }}人日</dd><dt>並行作業</dt><dd>{{ state.metrics.parallelWorkWeeks }}週</dd></dl>
        </section>
      </aside>
    </section>

    <footer class="actionbar">
      <div><strong>{{ selectedName }}</strong><span>残り{{ remainingDays(selectedPlayer) }}人日を、進捗・炎上対応・学習へ配分</span></div>
      <p v-if="!canEndWeek">週末処理の前に：<b>{{ guide.title }}</b></p>
      <p v-else>配置は後から変更できません。全員の判断を確認してください。</p>
      <button class="next-week" :disabled="gameFinished || !canEndWeek" @click="nextWeek">{{ gameFinished ? 'プロジェクト完了' : '判断を確定して週末へ →' }}</button>
    </footer>

    <div v-if="showDirector" class="director-backdrop">
      <section class="director" role="dialog" aria-modal="true" :aria-label="guide.title">
        <header><span>PHASE {{ Math.min(state.phase, 2) }}・WEEK {{ state.week }}</span><b>STEP {{ guide.step }} / 6</b></header>

        <template v-if="guide.step === 1">
          <div class="director-kicker">今回決めること</div>
          <h1>市場から今週取り組む<br>タスクを選んでください</h1>
          <p>最初から着手できる仕事、後工程を早く解放する仕事、将来に資産を残す仕事があります。正解は一つではありません。</p>
          <button class="director-primary" @click="showDirector = false">タスク市場を見る</button>
          <small class="director-foot">最大{{ state.config.activeTaskLimit }}枚。担当者の得意スキルと合う組み合わせを探します。</small>
        </template>

        <template v-else-if="guide.step === 2 && currentLeadTask">
          <div class="director-kicker">担当を決める</div>
          <h1>「{{ taskOf(currentLeadTask.taskId)?.name }}」の<br>主担当は誰ですか？</h1>
          <p>主担当は能力補正を得ます。同時に主担当できるタスクは1件までです。</p>
          <div class="director-members">
            <button v-for="player in state.players" :key="player.id" :disabled="!canLeadCurrentTask(player.id)" @click="selectedPlayer = player.id; lead(player.id, currentLeadTask.taskId)">
              <span class="avatar">{{ player.name.slice(0, 1) }}</span><b>{{ player.name }}</b>
              <small>📋{{ player.skills.direction }}　🎨{{ player.skills.design }}　⚙{{ player.skills.engineering }}</small>
              <em v-if="!canLeadCurrentTask(player.id)">スキル不足または担当中</em>
            </button>
          </div>
        </template>

        <template v-else-if="guide.step === 3">
          <div class="director-icon">🌩️</div>
          <div class="director-kicker">フェーズ開始イベント</div>
          <h1>プロジェクト全体に起きる<br>外的変化を公開します</h1>
          <p>複数のタスクへ影響することがあります。公開後に今週の営業日配分を考え直せます。</p>
          <button class="director-primary" @click="drawEvent('project')">プロジェクトイベントを引く</button>
        </template>

        <template v-else-if="guide.step === 4 && currentPersonalPlayer">
          <div class="director-kicker">個人イベント {{ personalEventsDrawn.length + 1 }} / {{ state.players.length }}</div>
          <h1>{{ currentPersonalPlayer.name }}に起きる<br>今週の出来事を公開します</h1>
          <p>体調、機材、顧客連絡などの外的要因です。悪い出来事だけでなく、良い出来事もあります。</p>
          <button class="director-primary" @click="selectedPlayer = currentPersonalPlayer.id; drawEvent('personal', currentPersonalPlayer.id)">{{ currentPersonalPlayer.name }}のイベントを引く</button>
          <div class="director-progress"><i v-for="player in state.players" :key="player.id" :class="{ done: personalEventsDrawn.includes(player.id) }">{{ player.name }}</i></div>
        </template>

        <template v-else-if="guide.step === 5">
          <div class="director-kicker">今週のメイン判断</div>
          <h1>各メンバーの営業日を<br>どこに使いますか？</h1>
          <div class="allocation-options"><span><b>▶ 進捗</b><small>担当タスクを完成へ近づける</small></span><span><b>🧯 炎上対応</b><small>原因究明・対応・消火を進める</small></span><span><b>📚 学習</b><small>来週以降の日数を増やす</small></span><span><b>☕ 休憩</b><small>1日使って疲労を回復する</small></span></div>
          <p>左でメンバーを選び、中央のタスクまたは「学習」を押します。全日を使い切る必要はありません。</p>
          <button class="director-primary" @click="startAllocation">盤面を見て営業日を配分する</button>
        </template>

        <template v-else>
          <div class="director-icon">🏁</div><h1>2フェーズの試作完了</h1><p>右側のプレイ指標を見て、迷った判断や使わなかった仕組みを振り返ってください。</p><button class="director-primary" @click="showDirector = false">結果を見る</button>
        </template>
      </section>
    </div>
  </main>
</template>

<style scoped>
.game-screen{--bg:#111a17;--panel:#f4efe2;--ink:#272820;--muted:#758078;--line:#d5ccba;--green:#295c48;--gold:#d8aa45;--red:#a63e31;width:100vw;height:100dvh;overflow:hidden;background:var(--bg);color:#f6f3e9;font-family:system-ui,'Noto Sans JP',sans-serif;display:grid;grid-template-rows:56px 74px minmax(0,1fr) 62px}.game-screen button{font:inherit}.topbar{display:flex;align-items:center;justify-content:space-between;padding:0 20px;background:#0b110f;border-bottom:1px solid #31433b}.brand{display:flex;align-items:baseline;gap:9px}.brand strong{font-size:18px;letter-spacing:.08em}.brand span{font-size:9px;color:#90a197;letter-spacing:.14em}.round-strip{display:flex;height:100%;align-items:center}.round-strip b{padding:0 20px;border-left:1px solid #2d3b35;font-size:13px}.round-strip small{font-size:9px;color:#8f9d95;margin-left:3px}.round-strip .cs{color:#ffd272}.top-actions{display:flex;gap:6px}.quiet{border:1px solid #45574f;background:transparent;color:#c9d1cc;border-radius:6px;padding:6px 10px}.navigator{display:grid;grid-template-columns:auto minmax(260px,1fr) auto minmax(250px,.7fr);align-items:center;gap:12px;padding:9px 20px;background:#1d2a25;border-bottom:1px solid #405047}.step-badge{background:var(--gold);color:#211b0d;font-weight:900;font-size:11px;padding:8px 10px;border-radius:6px}.guide-copy{display:grid}.guide-copy strong{font-size:15px}.guide-copy span{font-size:11px;color:#bdc8c1}.step-dots{display:flex;gap:5px}.step-dots i{width:22px;height:22px;border-radius:50%;border:1px solid #63746b;display:grid;place-items:center;font-size:9px;font-style:normal;color:#87958d}.step-dots i.done{background:#47715d;color:white}.step-dots i.current{background:var(--gold);border-color:var(--gold);color:#211;font-weight:bold}.notice{font-size:11px;background:#111a17;border-radius:6px;padding:8px 10px;color:#e7d7ac;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.game-board{min-height:0;display:grid;grid-template-columns:215px minmax(680px,1fr) 265px;gap:10px;padding:10px}.panel{background:var(--panel);color:var(--ink);border-radius:9px;border:1px solid #c8beaa;box-shadow:0 4px 14px #0005}.panel-heading{display:flex;align-items:baseline;justify-content:space-between;padding:10px 11px 7px;border-bottom:1px solid var(--line)}.panel-heading strong{font-size:13px}.panel-heading small{font-size:9px;color:#777}.member-rail{min-height:0;overflow:auto}.member{margin:7px;border:2px solid transparent;border-radius:8px;padding:8px;background:#e6dfcf;cursor:pointer}.member.selected{border-color:#d49b1f;background:#fff8dc;box-shadow:0 0 0 2px #f7d77955}.member-head{display:flex;align-items:center;gap:7px}.avatar{width:28px;height:28px;border-radius:50%;background:#365f50;color:white;display:grid;place-items:center;font-weight:bold}.member-head div{display:grid;flex:1}.member-head strong{font-size:12px}.member-head small{font-size:9px;color:#667068}.event-done{width:18px;height:18px;border-radius:50%;background:#3d795d;color:white;display:grid;place-items:center;font-size:10px}.day-track{display:flex;gap:4px;margin:7px 0}.day-track i{width:25px;height:20px;border-radius:4px;background:var(--gold);display:grid;place-items:center;color:#30250c;font-size:9px;font-style:normal}.day-track i.used{background:#8c958f;color:#e6e9e7}.day-track i.locked{background:#29312d;color:#9ca49f}.day-track i.locked span{font-size:8px}.skills{display:flex;justify-content:space-between;font-size:9px;color:#4c554f}.member-actions{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:7px}.member-actions button,.primary-actions button,.incident button,.handoff button{border:1px solid #9b9484;background:#fffdf6;color:#333;border-radius:5px;padding:5px;font-size:9px;cursor:pointer}.member-actions button:disabled,.primary-actions button:disabled{opacity:.4;cursor:not-allowed}.member em{display:block;font-size:9px;color:#31664e;margin-top:4px}.recommended{outline:2px solid #efb83c!important;box-shadow:0 0 9px #efb83c88;animation:pulse 1.8s infinite}.selection-help{margin:9px;padding:8px;background:#24362e;color:#fff;border-radius:6px;font-size:10px}.selection-help span{font-size:8px;color:#bbc7c0}.roadmap{min-width:0;min-height:0;display:grid;grid-template-rows:auto 1fr}.roadmap-heading{display:flex}.roadmap-heading>div:first-child{display:grid}.legend{display:flex;gap:10px;font-size:9px;color:#756c5c}.deliverables{min-height:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;padding:9px}.deliverable{min-width:0;border:1px solid #b9af9d;border-radius:8px;background:#ebe5d6;display:grid;grid-template-rows:auto 1fr;overflow:hidden}.deliverable.current-focus{border:3px solid #e5ad2d;box-shadow:0 0 18px #e5ad2d88}.deliverable.completed{background:#dfeadf;border-color:#8aa58d}.deliverable>header{display:flex;align-items:center;gap:7px;padding:9px;border-bottom:1px solid #c8beab;position:relative}.deliverable>header>div{display:grid}.deliverable>header strong{font-size:12px}.deliverable>header small{font-size:8px;color:#697169}.order{width:23px;height:23px;border-radius:50%;background:#314e42;color:white;display:grid;place-items:center;font-size:10px;font-weight:bold}.flow-arrow{position:absolute;right:-10px;z-index:2;font-size:30px;color:#746c5e}.route-choice{padding:10px;overflow:auto}.route-choice>p{font-size:10px;margin:0 0 7px;color:#625d52}.route{width:100%;display:flex;align-items:center;justify-content:space-between;text-align:left;border:1px solid #b1a896;background:#f9f7ef;border-radius:7px;padding:9px;margin-bottom:8px;color:#272820;cursor:pointer}.route>span{display:grid}.route b{font-size:11px}.route small{font-size:8px;color:#7a7367}.route em{font-style:normal;font-size:12px;font-weight:bold}.route.premium{border-left:5px solid #c7982f}.task-body{padding:10px;overflow:auto}.task-title,.progress-label{display:flex;justify-content:space-between}.task-title strong{font-size:13px}.task-title span{background:#d6b45b;border-radius:4px;padding:2px 5px;font-size:9px}.progress-line{height:9px;background:#c6c0b2;border-radius:10px;overflow:hidden;margin:9px 0 4px}.progress-line i{display:block;height:100%;background:#4b8b69}.progress-label{font-size:8px;color:#656b66}.fire-alert{background:#a83f31;color:#fff;border-radius:5px;padding:6px 8px;margin-top:8px;font-size:11px}.fire-alert small{float:right}.roles{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin:8px 0}.roles>div{background:#ddd6c7;border-radius:5px;padding:5px;display:grid}.roles small{font-size:8px;color:#777}.roles b{font-size:10px}.primary-actions{display:grid;gap:5px}.primary-actions button{font-size:10px;background:#fff}.handoff{margin-top:7px;font-size:9px}.handoff summary{cursor:pointer;color:#5e655f}.handoff button{width:100%;margin-top:4px}.incident{background:#4d2923;color:#fff3ea;border-radius:7px;padding:8px;margin-top:8px;display:grid;gap:5px}.incident>div{display:flex;justify-content:space-between}.incident strong,.incident span{font-size:9px}.incident small{font-size:8px;color:#ffc8b5}.incident b{font-size:8px;color:#bfe0c6}.info-rail{min-height:0;display:grid;grid-template-rows:auto minmax(120px,1fr) auto;gap:10px}.event-panel,.carryover-panel,.metrics-panel{min-height:0}.event-panel{padding-bottom:10px}.event-panel>button{margin:9px;width:calc(100% - 18px);border:0;border-radius:6px;padding:9px;background:#6a3e7a;color:#fff;font-size:10px;font-weight:bold}.event-status{margin:9px;background:#d9e7dc;color:#346046;padding:7px;border-radius:5px;font-size:9px}.event-panel p{font-size:10px;margin:8px 10px}.mini-checks{display:flex;gap:7px;margin:0 10px}.mini-checks i{width:25px;height:25px;border-radius:50%;display:grid;place-items:center;background:#c8c3b6;font-style:normal;font-size:9px}.mini-checks i.done{background:#397458;color:white}.carryover-panel{overflow:auto}.empty{text-align:center;color:#8b867c;font-size:10px;padding:20px 4px}.carry-tile{margin:7px;padding:7px;border-radius:6px;display:grid;font-size:9px}.carry-tile.asset{background:#cde5d2}.carry-tile.debt{background:#efcbc4}.carry-tile small{font-size:8px}.carry-tile em{font-style:normal;text-align:right;font-weight:bold}.metrics-panel dl{display:grid;grid-template-columns:1fr auto;gap:3px;margin:8px 10px;font-size:9px}.metrics-panel dd{font-weight:bold}.actionbar{display:grid;grid-template-columns:260px 1fr auto;align-items:center;gap:15px;padding:8px 20px;background:#0b110f;border-top:1px solid #3c4a44}.actionbar>div{display:grid}.actionbar strong{font-size:12px;color:#ffd272}.actionbar span,.actionbar p{font-size:9px;color:#aebbb4;margin:0}.actionbar p{text-align:right}.next-week{border:0;border-radius:7px;background:var(--gold);color:#251c09;padding:10px 18px;font-weight:900;cursor:pointer}.next-week:disabled{background:#3c4641;color:#7e8983;cursor:not-allowed}.director-backdrop{position:fixed;inset:0;z-index:100;background:#07100cbb;backdrop-filter:blur(3px);display:grid;place-items:center;padding:20px}.director{width:min(680px,calc(100vw - 30px));max-height:calc(100dvh - 30px);overflow:auto;background:#f6f0e2;color:#292820;border-radius:16px;border:1px solid #cfbd92;box-shadow:0 28px 90px #000b;padding:0 34px 30px;text-align:center}.director>header{margin:0 -34px 24px;padding:12px 18px;background:#243a31;color:#fff;display:flex;justify-content:space-between;font-size:10px;letter-spacing:.08em}.director-kicker{font-size:11px;font-weight:900;color:#9b6b08;letter-spacing:.12em}.director h1{font-size:28px;line-height:1.35;margin:8px 0 10px}.director>p{font-size:13px;line-height:1.7;color:#5d5b53;max-width:540px;margin:0 auto 20px}.director-icon{font-size:42px}.director-choices{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:22px 0 12px}.director-choices button{min-height:100px;border:2px solid #b9aa8c;border-radius:10px;background:#fffdf6;color:#292820;padding:14px;display:flex;justify-content:space-between;align-items:center;text-align:left;cursor:pointer}.director-choices button:first-child{border-color:#c59a37}.director-choices span{display:grid}.director-choices b{font-size:14px}.director-choices small{font-size:10px;color:#747067;margin-top:5px}.director-choices em{font-style:normal;font-size:15px;font-weight:900;white-space:nowrap}.director-foot{font-size:10px;color:#7d786d}.director-members{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:20px}.director-members button{border:1px solid #b8ad98;background:#fffdf6;color:#292820;border-radius:9px;padding:12px 5px;display:grid;place-items:center;gap:5px;cursor:pointer}.director-members button:hover,.director-choices button:hover{transform:translateY(-2px);box-shadow:0 7px 16px #0002}.director-members small{font-size:9px}.director-primary{display:block;margin:18px auto 0;border:0;border-radius:9px;background:#d5a332;color:#241b08;padding:13px 30px;font-size:15px;font-weight:900;cursor:pointer;box-shadow:0 5px 0 #8a6515}.director-progress{display:flex;justify-content:center;gap:7px;margin-top:20px}.director-progress i{font-style:normal;font-size:10px;background:#d2ccbd;color:#777;padding:5px 10px;border-radius:20px}.director-progress i.done{background:#3f755c;color:#fff}.allocation-options{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin:18px 0}.allocation-options span{display:grid;background:#e6dfcf;border-radius:8px;padding:12px}.allocation-options b{font-size:12px}.allocation-options small{font-size:9px;color:#706d65;margin-top:4px}@keyframes pulse{50%{box-shadow:0 0 14px #efb83cbb}}
.round-strip .budget{color:#b9dfc8}.game-board{grid-template-columns:235px minmax(660px,1fr) 265px}.team-list{display:grid;grid-template-columns:1fr 1fr;gap:5px;padding:7px}.team-member{border:1px solid #bbb2a1;background:#e5dece;color:#2b2c27;border-radius:7px;padding:6px;display:flex;align-items:center;gap:5px;text-align:left;cursor:pointer}.team-member.selected{border:2px solid #d49b1f;background:#fff8dc}.team-member .avatar{width:24px;height:24px;font-size:10px;flex:0 0 auto}.team-member>span:nth-child(2){display:grid;min-width:0}.team-member b{font-size:10px}.team-member small{font-size:7px;color:#687068;white-space:nowrap}.team-member i{font-style:normal;color:#397458;font-size:9px}.personal-board{margin:0 7px 7px;border:2px solid #c79526;border-radius:9px;background:#fffaf0;padding:9px}.personal-board>header{display:flex;justify-content:space-between;align-items:start;border-bottom:1px solid #ddd2bd;padding-bottom:7px}.personal-board header small,.personal-board label{font-size:7px;letter-spacing:.1em;color:#82765f;font-weight:900}.personal-board h2{font-size:17px;margin:0}.personal-board header>b{font-size:9px;background:#433a31;color:#fff;padding:5px 7px;border-radius:12px}.personal-board section{margin-top:8px}.day-track.large i{flex:1;height:25px}.skills.large span{background:#e7dfcf;padding:5px 7px;border-radius:5px}.assignment p{display:flex;align-items:center;gap:5px;margin:3px 0;font-size:9px}.assignment p span{width:19px;height:19px;border-radius:50%;background:#345c4d;color:white;display:grid;place-items:center;font-size:8px}.growth>div{height:6px;background:#d4cdbc;border-radius:6px;overflow:hidden;margin:4px 0}.growth>div i{display:block;height:100%;background:#4b8b69}.growth small{font-size:8px;color:#687068}.personal-actions{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:9px}.personal-actions button{border:1px solid #9b9484;background:#fffdf6;color:#333;border-radius:5px;padding:5px;font-size:9px;cursor:pointer}.personal-actions button:last-child{grid-column:1/-1}.personal-actions button:disabled{opacity:.4;cursor:not-allowed}.allocation-options{grid-template-columns:repeat(4,1fr)}.task-workspace{min-width:0;min-height:0;overflow:auto;display:grid;grid-template-rows:auto auto 1fr}.outcome-strip{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:#c8beaa;border-bottom:1px solid #b8ae9c}.outcome-strip>div{background:#e3dccd;padding:6px 10px;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:6px}.outcome-strip>div.completed{background:#d1e4d3}.outcome-strip span{font-size:13px}.outcome-strip b{font-size:9px}.outcome-strip small{font-size:7px;color:#6d716d}.planned-area,.market-area{padding:7px}.planned-area{border-bottom:2px solid #b6aa92;background:#e9e1d1}.market-area{min-height:0;background:#d8d0c0}.workspace-heading{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}.workspace-heading>div{display:grid}.workspace-heading strong{font-size:12px}.workspace-heading small{font-size:8px;color:#746d61}.workspace-heading>b{font-size:10px;background:#2f4d40;color:white;padding:4px 8px;border-radius:10px}.tile-grid{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:7px}.market-grid{grid-template-columns:repeat(4,minmax(150px,1fr))}.empty-tile{min-height:174px;border:2px dashed #aaa08e;color:#8a8173;display:grid;place-items:center;text-align:center;font-size:9px;background:#ded6c6}.incident-row{margin-top:6px;padding:6px;background:#5b2b24;color:#fff;border-radius:5px;display:flex;justify-content:space-between;align-items:center}.incident-row div{display:grid}.incident-row strong{font-size:9px}.incident-row span{font-size:7px;color:#ffc8b5}.incident-row button{font-size:8px;padding:4px 7px}.market-area .tile-grid{padding-bottom:6px}.market-grid :deep(.task-tile){min-height:164px}.planned-grid :deep(.task-tile){min-height:174px}
@media(max-width:1050px){.game-screen{height:auto;min-height:100dvh;overflow:auto;display:block;padding-bottom:72px}.topbar{height:54px;position:sticky;top:0;z-index:10}.round-strip b{padding:0 8px}.navigator{grid-template-columns:auto 1fr;position:sticky;top:54px;z-index:9}.step-dots,.notice{display:none}.game-board{display:block;padding:8px}.member-rail{display:block}.task-workspace{margin-top:8px;overflow:visible}.tile-grid,.market-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.info-rail{display:grid;grid-template-columns:1fr 1fr;margin-top:8px}.metrics-panel{grid-column:1/-1}.actionbar{position:fixed;bottom:0;left:0;right:0;z-index:10;grid-template-columns:1fr auto}.actionbar p{display:none}.brand span{display:none}.allocation-options{grid-template-columns:1fr 1fr}}
@media(max-width:620px){.tile-grid,.market-grid{grid-template-columns:1fr}.round-strip .budget{display:none}.outcome-strip{grid-template-columns:1fr}.team-list{grid-template-columns:1fr 1fr}}
.director-members button:disabled{opacity:.38;cursor:not-allowed}.director-members button em{font-size:7px;color:#8b3c32;font-style:normal}
</style>
