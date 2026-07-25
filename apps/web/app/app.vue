<script setup lang="ts">
/**
 * 卓シミュレーション型UI(BGA風の物理卓再現。ホットシート・ステージ1)。
 * 1画面で全プレイヤーを操作する(秘匿情報も全表示)。
 * ゲーム開始前はセットアップ画面、開始後は「1枚の卓面」(パン&ズーム可能)+ 上部固定HUD。
 * イベント解決・フェーズ終了清算・最終結果はモーダルで割り込む。
 */
const { state, started } = useGame()
</script>

<template>
  <div class="table-app">
    <TableHud v-if="started" />
    <ToastViolation />

    <SetupPanel v-if="!started" />

    <template v-else>
      <TableStage />

      <EventModal v-if="state.pendingEvent" />
      <template v-else>
        <PhaseEndModal v-if="state.step === 'phase_end'" />
        <ResultModal v-else-if="state.step === 'finished'" />
      </template>

      <ActionLogScroll />
    </template>
  </div>
</template>
