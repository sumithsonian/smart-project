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
  background: #f4f4f5;
  color: #1f2937;
}
body { margin: 0; }
.app { max-width: 1200px; margin: 0 auto; padding: 12px; }
h1 { font-size: 1.3rem; }
h2 { font-size: 1.05rem; margin: 0 0 8px; }
h3 { font-size: 0.95rem; margin: 8px 0 4px; }
.muted { color: #6b7280; font-size: 0.85em; font-weight: normal; }
.panel {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}
button {
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 0.85rem;
}
button:hover:not(:disabled) { background: #f3f4f6; }
button:disabled { opacity: 0.4; cursor: not-allowed; }
button.primary { background: #2563eb; border-color: #2563eb; color: #fff; }
button.primary:hover:not(:disabled) { background: #1d4ed8; }
button.danger { color: #b91c1c; border-color: #fca5a5; }
input, select { border: 1px solid #d1d5db; border-radius: 6px; padding: 3px 6px; font-size: 0.85rem; }
input[type='number'] { width: 70px; }
.row { display: flex; gap: 6px; align-items: center; margin: 4px 0; flex-wrap: wrap; }

/* セットアップ */
.setup-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
.setup-grid fieldset { border: 1px solid #e5e7eb; border-radius: 6px; }
.setup-grid fieldset:last-child { grid-column: 1 / -1; }
.config-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.config-grid label { display: flex; flex-direction: column; font-size: 0.78rem; color: #4b5563; }

/* メインボード */
.tracks { display: flex; gap: 10px; flex-wrap: wrap; }
.track {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 6px 14px;
  text-align: center;
}
.track.danger { background: #fef2f2; border-color: #fecaca; }
.track-label { display: block; font-size: 0.72rem; color: #64748b; }
.track-value { font-size: 1.2rem; font-weight: 700; }
.step-badge { background: #eff6ff; border-color: #bfdbfe; }
.board-info { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 8px; font-size: 0.85rem; }
.phase-summary { margin-top: 8px; padding: 6px 10px; background: #fffbeb; border-radius: 6px; font-size: 0.85rem; }

/* タスクエリア */
.task-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 8px; }
.task-card {
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px;
  cursor: pointer;
  background: #fff;
}
.task-card.selected { border-color: #2563eb; background: #eff6ff; }
.task-card.resolved { opacity: 0.55; background: #f0fdf4; cursor: default; }
.task-card.carried { border-style: dashed; }
.task-title { display: flex; gap: 6px; align-items: center; justify-content: space-between; font-size: 0.9rem; }
.task-meta { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; font-size: 0.75rem; }
.task-deps { font-size: 0.75rem; margin-top: 4px; }
.task-tokens { margin-top: 4px; font-size: 0.8rem; color: #2563eb; }
.badge {
  background: #f3f4f6;
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 0.72rem;
  white-space: nowrap;
}
.badge.ok { background: #dcfce7; color: #166534; }
.badge.warn { background: #fef3c7; color: #92400e; }
.badge.secret { background: #fae8ff; color: #86198f; }
.badge.pm { background: #dbeafe; color: #1e40af; }

/* 個人ボード */
.players-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 8px; }
.player-board { border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px; }
.player-board.ready { background: #f0fdf4; }
.player-head { display: flex; gap: 6px; align-items: center; }
.player-stats { display: flex; gap: 10px; margin: 6px 0; font-size: 0.9rem; }
.player-skills { display: flex; gap: 8px; font-size: 0.8rem; }
.player-goal { margin: 6px 0; font-size: 0.8rem; padding: 4px 6px; border-radius: 4px; }
.secret-bg { background: #fdf4ff; }
.player-actions { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px; }
.learn-group { display: inline-flex; gap: 2px; }

/* 進行 */
.event-box { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 10px; }
.requirement-choices { display: flex; gap: 8px; }
.requirement-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px;
  text-align: left;
  border: 2px solid #e9d5ff;
  background: #fdf4ff;
}
.requirement-card:hover { border-color: #a855f7; }
.order-builder { display: flex; gap: 6px; flex-wrap: wrap; margin: 6px 0; }
.order-builder .selected { border-color: #2563eb; background: #eff6ff; }
.queue { margin: 4px 0; padding-left: 20px; font-size: 0.85rem; }
.resolution-log ul { margin: 4px 0; padding-left: 18px; font-size: 0.82rem; }
.ok-text { color: #166534; }
.danger-text { color: #b91c1c; }
.result-box { padding: 12px; border-radius: 8px; }
.result-box.win { background: #f0fdf4; border: 1px solid #86efac; }
.result-box.lose { background: #fef2f2; border: 1px solid #fecaca; }

/* ログ・違反 */
.violation {
  position: sticky;
  top: 8px;
  z-index: 10;
  background: #fef2f2;
  border: 1px solid #fca5a5;
  color: #b91c1c;
  border-radius: 8px;
  padding: 8px 12px;
  margin-bottom: 12px;
}
.action-log {
  max-height: 200px;
  overflow-y: auto;
  font-size: 0.8rem;
  color: #4b5563;
  margin: 8px 0 0;
  padding-left: 24px;
}
</style>
