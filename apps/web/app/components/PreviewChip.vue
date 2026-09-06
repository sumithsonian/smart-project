<script setup lang="ts">
/**
 * 配置プレビュー(RULES.md §10-2)。
 * 「確定する前に、その配置の結果を数値で見せる」ための小さな帯。
 * 進捗 / 疲労 / 納品見込み / 予算影響 を1行ずつ出す。
 */
import type { AssignPreview } from '~/composables/useGame'

defineProps<{ preview: AssignPreview }>()
</script>

<template>
  <div class="preview-chip">
    <div class="preview-head">この配置の結果</div>
    <div v-if="preview.progress" class="preview-line">
      <span class="preview-key">進捗</span>
      <span>
        {{ preview.progress.before }} → <b>{{ preview.progress.after }}</b>
        / 必要{{ preview.progress.needed }}
      </span>
    </div>
    <div class="preview-line">
      <span class="preview-key">疲労</span>
      <span>
        {{ preview.fatigue.before }} → <b>{{ preview.fatigue.after }}</b>
        <span v-if="preview.fatigue.after >= preview.fatigue.max" class="preview-warn">
          ⚠ 限界イベント
        </span>
      </span>
    </div>
    <div v-if="preview.delivery" class="preview-line">
      <span class="preview-key">納品</span>
      <span v-if="preview.delivery.level !== null">
        <b>今週末に Lv{{ preview.delivery.level }} で納品できます</b>
      </span>
      <span v-else>あと {{ preview.delivery.remaining }} 人日</span>
    </div>
    <div v-if="preview.budgetCost > 0" class="preview-line">
      <span class="preview-key">予算</span>
      <span>納品したら −{{ preview.budgetCost }}</span>
    </div>
    <div v-if="preview.note" class="preview-note">{{ preview.note }}</div>
  </div>
</template>
