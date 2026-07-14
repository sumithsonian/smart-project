<script setup lang="ts">
/** ホットシートUI:1画面で4〜5人分を操作するデバッグ用UI(ステージ1・エンジンv4) */
const { state, started, lastViolation } = useGame()
</script>

<template>
  <div class="app">
    <header>
      <h1>スマートプロジェクト <span class="muted">ホットシート(ステージ1・v4 工数モデル)</span></h1>
    </header>

    <div v-if="lastViolation" class="violation">
      ⚠ {{ lastViolation.message }} <span class="muted">[{{ lastViolation.code }}]</span>
    </div>

    <SetupPanel v-if="!started" />

    <template v-else>
      <MainBoard />

      <EventPanel v-if="state.pendingEvent" />

      <template v-else>
        <ScopeMeetingPanel v-if="state.step === 'scope_meeting'" />
        <PhaseEndPanel v-else-if="state.step === 'phase_end'" />
        <ResultPanel v-else-if="state.step === 'finished'" />
      </template>

      <div class="board-columns">
        <ProductBoard />
        <AcceptanceBoard />
      </div>

      <TaskBoard v-if="state.step !== 'finished'" />

      <PmPanel v-if="!state.pendingEvent && state.step !== 'finished'" />

      <section v-if="state.step !== 'finished'" class="panel">
        <h2>プレイヤーボード</h2>
        <div class="players-grid">
          <PlayerBoard v-for="p in state.players" :key="p.id" :player="p" />
        </div>
      </section>
    </template>

    <ActionLogPanel />
  </div>
</template>

<style>
:root {
  font-family: 'Hiragino Sans', 'Noto Sans JP', sans-serif;
  background: linear-gradient(160deg, #134e4a 0%, #115e59 45%, #0f766e 100%) fixed;
  color: #1f2937;
  --felt: #0f766e;
  --paper: #fffdf8;
  --ink: #1f2937;
  --line: #e7e0d2;
  --accent: #0d9488;
}
body { margin: 0; }
.app { max-width: 1240px; margin: 0 auto; padding: 16px; }
header h1 {
  font-size: 1.35rem;
  color: #f0fdfa;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
  letter-spacing: 0.02em;
}
header .muted { color: #99f6e4; }
h2 { font-size: 1.02rem; margin: 0 0 10px; letter-spacing: 0.02em; }
h3 { font-size: 0.95rem; margin: 8px 0 4px; }
.muted { color: #8b8577; font-size: 0.85em; font-weight: normal; }

.panel {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 14px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
}

button {
  border: 1px solid #d6cfc0;
  background: #fff;
  border-radius: 8px;
  padding: 5px 12px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: transform 0.05s ease, background 0.15s ease;
}
button:hover:not(:disabled) { background: #f6f1e7; }
button:active:not(:disabled) { transform: translateY(1px); }
button:disabled { opacity: 0.4; cursor: not-allowed; }
button.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
  font-weight: 600;
  box-shadow: 0 2px 6px rgba(13, 148, 136, 0.35);
}
button.primary:hover:not(:disabled) { background: #0f9488; }
button.danger { color: #b91c1c; border-color: #fca5a5; }
input, select { border: 1px solid #d6cfc0; border-radius: 8px; padding: 4px 7px; font-size: 0.85rem; background: #fff; }
input[type='number'] { width: 70px; }
.row { display: flex; gap: 6px; align-items: center; margin: 4px 0; flex-wrap: wrap; }

/* セットアップ */
.setup-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
.setup-grid fieldset { border: 1px solid var(--line); border-radius: 10px; }
.setup-grid fieldset.wide { grid-column: 1 / -1; }
.config-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.config-grid label { display: flex; flex-direction: column; font-size: 0.78rem; color: #6b6455; }

/* メインボード */
.tracks { display: flex; gap: 10px; flex-wrap: wrap; }
.track {
  background: linear-gradient(180deg, #ffffff, #f6f1e7);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 7px 16px;
  text-align: center;
  min-width: 64px;
  box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.04);
}
.track.danger { background: #fef2f2; border-color: #fecaca; }
.track-label { display: block; font-size: 0.7rem; color: #8b8577; letter-spacing: 0.06em; }
.track-value { font-size: 1.35rem; font-weight: 800; font-variant-numeric: tabular-nums; }
.step-badge { background: #ecfdf5; border-color: #a7f3d0; }
.step-badge .track-value { font-size: 1rem; color: #047857; }
.board-info { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 10px; font-size: 0.85rem; }
.phase-summary { margin-top: 10px; padding: 8px 12px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; font-size: 0.85rem; }

/* プロダクトボード・検収条件ボード(2カラム) */
.board-columns { display: grid; grid-template-columns: 1.3fr 1fr; gap: 14px; align-items: start; }
.board-columns .panel { margin-bottom: 0; }
@media (max-width: 900px) {
  .board-columns { grid-template-columns: 1fr; }
}

.slot-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.slot-card {
  border: 2px solid var(--line);
  border-radius: 10px;
  padding: 8px 10px;
  background: #f6f1e7;
  cursor: default;
  position: relative;
}
.slot-card.selectable { cursor: pointer; }
.slot-card.selectable:hover { border-color: var(--accent); }
.slot-card.selected { outline: 3px solid #facc15; outline-offset: 1px; }
.slot-card.lv1 { background: #e2e8f0; border-color: #94a3b8; }
.slot-card.lv2 { background: #fef3c7; border-color: #f59e0b; }
.slot-card .slot-name { font-weight: 700; font-size: 0.85rem; }
.slot-card .slot-level { font-size: 0.72rem; color: #6b6455; }
.slot-card .slot-badges { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }

.acceptance-list { display: flex; flex-direction: column; gap: 6px; }
.acceptance-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 7px 10px;
  background: #fff;
  text-align: left;
  font-size: 0.85rem;
}
.acceptance-card.clickable { cursor: pointer; }
.acceptance-card.clickable:hover { border-color: var(--accent); }
.acceptance-card.met { background: #f0fdf4; border-color: #86efac; }
.acceptance-card.committed { background: #fffbeb; border-color: #fde68a; }

/* タスクエリア:WBSレーン */
.lanes {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  overflow-x: auto;
  padding: 12px;
  background: linear-gradient(180deg, #0d9488 0%, #0f766e 100%);
  border-radius: 10px;
  box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.25);
}
.lane { display: flex; flex-direction: column; gap: 10px; min-width: 230px; flex: 1; }
.lane + .lane { border-left: 2px dashed rgba(255, 255, 255, 0.25); padding-left: 14px; }
.lane-head {
  color: #ccfbf1;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

/* タイル(盤上に置かれたタスクカードのイメージ) */
.tile {
  background: var(--paper);
  border: 1px solid #d6cfc0;
  border-radius: 10px;
  padding: 10px;
  cursor: pointer;
  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.28);
  transition: transform 0.08s ease, box-shadow 0.08s ease;
  position: relative;
}
.tile:hover { transform: translateY(-2px); box-shadow: 0 6px 12px rgba(0, 0, 0, 0.32); }
.tile.selected { outline: 3px solid #facc15; outline-offset: 1px; }
.tile.not-clickable { cursor: default; }
.tile.not-clickable:hover { transform: none; box-shadow: 0 3px 6px rgba(0, 0, 0, 0.28); }
.tile-head { display: flex; gap: 6px; align-items: flex-start; justify-content: space-between; font-size: 0.9rem; }

.tile-cost-row { display: flex; align-items: center; gap: 8px; margin-top: 6px; font-size: 0.75rem; }
.pip-row { display: inline-flex; gap: 3px; }
.pip {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1.5px solid #b9b1a0;
  background: #fff;
}
.pip.filled { background: #f59e0b; border-color: #d97706; }
.pip.burning { border-color: #dc2626; border-style: dashed; }
.pip.burning.filled { background: #dc2626; border-color: #b91c1c; }
.fire-badge {
  background: #fee2e2;
  color: #b91c1c;
  font-weight: 700;
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 0.74rem;
}

.tile-meta { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px; font-size: 0.74rem; }
.badge {
  background: #f1ece1;
  border-radius: 5px;
  padding: 1px 6px;
  font-size: 0.72rem;
  white-space: nowrap;
}
.badge.ok { background: #dcfce7; color: #166534; }
.badge.warn { background: #fef3c7; color: #92400e; }
.badge.skill { background: #e0f2fe; color: #075985; }
.badge.pm { background: #dbeafe; color: #1e40af; }
.badge.interrupt { background: #fae8ff; color: #86198f; }

.deliverable { font-size: 0.7rem; font-weight: 700; border-radius: 4px; padding: 1px 6px; }
.deliverable.lv1 { background: #e2e8f0; color: #334155; }
.deliverable.lv2 { background: #fbbf24; color: #713f12; box-shadow: 0 1px 2px rgba(0,0,0,0.2); }

.tile-tokens { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 8px; }
.token-chip {
  color: #fff;
  font-size: 0.72rem;
  font-weight: 600;
  border-radius: 999px;
  padding: 2px 8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
}
.token-chip.overtime { outline: 2px dashed rgba(255,255,255,0.7); }

/* 個人ボード */
.players-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; }
.player-board {
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 10px;
  background: #fff;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.08);
}
.player-board.ready { background: #f0fdf4; }
.player-head { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.player-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.player-stats { display: flex; gap: 12px; margin: 8px 0 4px; font-size: 0.92rem; flex-wrap: wrap; }
.player-skills { display: flex; gap: 10px; font-size: 0.8rem; flex-wrap: wrap; }
.fatigue-gauge { display: inline-flex; gap: 2px; vertical-align: middle; }
.fatigue-dot { width: 10px; height: 10px; border-radius: 50%; border: 1.5px solid #cbd5e1; background: #fff; }
.fatigue-dot.filled { background: #dc2626; border-color: #b91c1c; }
.member-flavor { font-size: 0.76rem; color: #8b8577; margin: 2px 0 6px; }
.player-actions { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 8px; }
.learn-group { display: inline-flex; gap: 2px; }

.worker-actions { flex-direction: column; align-items: stretch; gap: 6px; }
.assign-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.assign-label { font-size: 0.78rem; font-weight: 700; color: #6b6455; min-width: 44px; }

/* 進行 */
.event-box { background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 12px; }
.fire-box { background: #fef2f2; border-color: #fca5a5; }
.settlement-log ul { margin: 4px 0; padding-left: 18px; font-size: 0.85rem; }
.result-box { padding: 14px; border-radius: 10px; }
.result-box.win { background: #f0fdf4; border: 1px solid #86efac; }
.result-box.lose { background: #fef2f2; border: 1px solid #fecaca; }

/* ログ・違反 */
.violation {
  position: sticky;
  top: 8px;
  z-index: 40;
  background: #fef2f2;
  border: 1px solid #fca5a5;
  color: #b91c1c;
  border-radius: 10px;
  padding: 9px 14px;
  margin-bottom: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}
.game-log {
  max-height: 260px;
  overflow-y: auto;
  font-size: 0.82rem;
  color: #3f3a2e;
  margin: 8px 0 0;
  padding-left: 0;
  list-style: none;
}
.game-log li {
  padding: 3px 0;
  border-bottom: 1px dashed var(--line);
}
.game-log li .log-tag { color: #8b8577; font-size: 0.72rem; margin-right: 6px; }
</style>
