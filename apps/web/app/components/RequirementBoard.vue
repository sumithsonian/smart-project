<script setup lang="ts">
/**
 * スコープボード(要件。RULES.md §3)。
 * Must / Better / 見送り の3列に分けて表示する。PM は各カードから区分・期限を交渉できる。
 */
const { state, requirementsByTier, tierLabels } = useGame()

const columns = [
  { tier: 'must' as const, hint: '期限までに必要。未達で CS 減' },
  { tier: 'better' as const, hint: '任意。達成で CS 増、未達の罰なし' },
  { tier: 'dropped' as const, hint: '今回のスコープ外(最終検収では評価されます)' },
]

const changesLeft = computed(
  () => state.value.config.scopeChangePerPhase - state.value.scopeChangeUsedThisPhase,
)
</script>

<template>
  <div class="board scope-board">
    <div class="board-title">
      スコープボード — お客様の要件
      <span class="board-sub">
        PM のスコープ交渉:残り {{ changesLeft }}/{{ state.config.scopeChangePerPhase }} 回(今フェーズ)
      </span>
    </div>

    <div class="scope-columns">
      <div v-for="col in columns" :key="col.tier" class="scope-col" :class="col.tier">
        <div class="scope-col-head">
          <span class="tier-badge" :class="col.tier">{{ tierLabels[col.tier] }}</span>
          <span class="scope-col-hint">{{ col.hint }}</span>
          <span class="scope-col-count">{{ requirementsByTier[col.tier].length }}</span>
        </div>
        <div class="scope-col-body">
          <RequirementCardTable
            v-for="r in requirementsByTier[col.tier]"
            :key="r.requirementId"
            :requirement-id="r.requirementId"
          />
          <p v-if="requirementsByTier[col.tier].length === 0" class="muted scope-empty">
            なし
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
