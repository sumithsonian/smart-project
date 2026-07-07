<script setup lang="ts">
/** ホットシートUI:1画面で4人分を操作するデバッグ用UI(ステージ1) */
const { state, started, lastViolation } = useGame()
</script>

<template>
  <div class="app">
    <header>
      <h1>スマートプロジェクト <span class="muted">ホットシート(ステージ1)</span></h1>
    </header>

    <div v-if="lastViolation" class="violation">
      ⚠ {{ lastViolation.message }} <span class="muted">[{{ lastViolation.code }}]</span>
    </div>

    <SetupPanel v-if="!started" />

    <template v-else>
      <MainBoard />
      <ControlPanel />
      <TaskArea />
      <section class="panel">
        <h2>個人ボード</h2>
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
.setup-grid fieldset:last-child { grid-column: 1 / -1; }
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

/* タスクエリア:依存レーン */
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

/* タイル(エンデバー風に盤面へ置かれたカードのイメージ) */
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
.tile.resolved { opacity: 0.7; background: #f0fdf4; cursor: default; }
.tile.resolved:hover { transform: none; }
.tile.carried { border-style: dashed; border-color: #f59e0b; }
.tile-head { display: flex; gap: 6px; align-items: flex-start; justify-content: space-between; font-size: 0.9rem; }

/* ステータス + ツールチップ */
.tile-status {
  position: relative;
  font-size: 0.72rem;
  font-weight: 700;
  border-radius: 999px;
  padding: 2px 8px;
  white-space: nowrap;
  cursor: help;
}
.tile-status.ok { background: #dcfce7; color: #166534; }
.tile-status.warn { background: #fee2e2; color: #b91c1c; }
.tile-status.done { background: #e5e7eb; color: #4b5563; }
.tile-status .tooltip {
  display: none;
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  z-index: 30;
  width: 240px;
  background: #1f2937;
  color: #f9fafb;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 0.78rem;
  font-weight: normal;
  white-space: normal;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
}
.tile-status:hover .tooltip { display: block; }
.tooltip-line { margin: 2px 0; }
.tooltip-line.muted-line { color: #9ca3af; border-top: 1px solid #374151; margin-top: 6px; padding-top: 6px; }

/* トークンの充足ピップ */
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
.badge.secret { background: #fae8ff; color: #86198f; }
.badge.skill { background: #e0f2fe; color: #075985; }
.badge.event { background: #fef9c3; color: #854d0e; }
.badge.special { background: #ede9fe; color: #5b21b6; }
.badge.pm { background: #dbeafe; color: #1e40af; }

.tile-deliverables { display: flex; gap: 4px; align-items: center; margin-top: 6px; }
.deliverable {
  font-size: 0.7rem;
  font-weight: 700;
  border-radius: 4px;
  padding: 1px 6px;
}
.deliverable.lv1 { background: #e2e8f0; color: #334155; }
.deliverable.lv2 { background: #fbbf24; color: #713f12; box-shadow: 0 1px 2px rgba(0,0,0,0.2); }

/* v3.0 週次ワーカーコミット:席・応援(タスクエリア) */
.seat-row { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-top: 6px; }
.seat-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  min-width: 46px;
  border: 1.5px dashed #b9b1a0;
  border-radius: 6px;
  padding: 2px 6px;
  font-size: 0.68rem;
  background: #fff;
}
.seat-chip.filled { border-style: solid; color: #fff; }
.seat-chip.outsourced { border-style: solid; border-color: #a855f7; background: #fae8ff; color: #86198f; }
.seat-chip.mismatch { outline: 2px solid #dc2626; outline-offset: 1px; }
.seat-label { font-weight: 700; }
.seat-empty { opacity: 0.7; }
.support-chip {
  font-size: 0.72rem;
  background: #fee2e2;
  color: #b91c1c;
  border-radius: 999px;
  padding: 2px 8px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.support-chip:not(.short) { background: #dcfce7; color: #166534; }

.tile-tokens { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 8px; }
.token-chip {
  color: #fff;
  font-size: 0.72rem;
  font-weight: 600;
  border-radius: 999px;
  padding: 2px 8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
}
.tile-requirement { margin-top: 6px; font-size: 0.76rem; color: #86198f; }

/* 個人ボード */
.players-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 10px; }
.player-board {
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 10px;
  background: #fff;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.08);
}
.player-board.ready { background: #f0fdf4; }
.player-head { display: flex; gap: 6px; align-items: center; }
.player-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.player-stats { display: flex; gap: 12px; margin: 8px 0 4px; font-size: 0.92rem; }
.player-skills { display: flex; gap: 10px; font-size: 0.8rem; }
.player-goal { margin: 8px 0; font-size: 0.8rem; padding: 5px 8px; border-radius: 6px; }
.secret-bg { background: #fdf4ff; border: 1px dashed #e9d5ff; }
.player-actions { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 8px; }
.learn-group { display: inline-flex; gap: 2px; }

/* v3.0 週次ワーカーコミット:配属UI(個人ボード) */
.worker-actions { flex-direction: column; align-items: stretch; gap: 6px; }
.assign-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.assign-label { font-size: 0.78rem; font-weight: 700; color: #6b6455; min-width: 44px; }

/* マイルストーン */
.milestone-strip { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
.milestone-chip {
  background: #fefce8;
  border: 1px solid #fde047;
  border-radius: 999px;
  padding: 3px 12px;
  font-size: 0.8rem;
  cursor: help;
}
.milestone-chip.claimed { background: #fef08a; border-color: #eab308; }
.player-milestones { margin: 4px 0; }
.badge.milestone { background: #fef08a; color: #713f12; }

/* 進行 */
.event-box { background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 12px; }
.fire-box { background: #fef2f2; border-color: #fca5a5; }
.fire-log {
  margin-top: 10px;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 8px;
  padding: 8px 12px;
}
.fire-log ul { margin: 4px 0; padding-left: 18px; font-size: 0.82rem; }
.requirement-choices { display: flex; gap: 8px; }
.requirement-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  text-align: left;
  border: 2px solid #e9d5ff;
  background: #fdf4ff;
  border-radius: 10px;
}
.requirement-card:hover { border-color: #a855f7; transform: translateY(-1px); }
.order-builder { display: flex; gap: 6px; flex-wrap: wrap; margin: 6px 0; }
.order-builder .selected { border-color: var(--accent); background: #ecfdf5; font-weight: 600; }
.queue { margin: 4px 0; padding-left: 20px; font-size: 0.85rem; }
.resolution-log ul { margin: 4px 0; padding-left: 18px; font-size: 0.82rem; }
.ok-text { color: #166534; }
.danger-text { color: #b91c1c; }
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
.action-log {
  max-height: 200px;
  overflow-y: auto;
  font-size: 0.8rem;
  color: #6b6455;
  margin: 8px 0 0;
  padding-left: 24px;
}
</style>
