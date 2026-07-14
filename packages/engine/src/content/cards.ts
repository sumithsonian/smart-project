/**
 * コンテンツカード一式(v4)
 * ACCEPTANCE 8枚 / EVENTS 14枚 / FIRES 9枚 / LIMIT_EVENTS 7枚 / MEMBERS 6枚 / PROJECT_SHEETS 2枚
 */
import type {
  AcceptanceCard,
  EventCard,
  FireCard,
  LimitEventCard,
  MemberCard,
  ProjectSheet,
} from '../types/content'

/** 検収条件カード(8枚: フェーズ1〜4に各2枚) */
export const ACCEPTANCE: AcceptanceCard[] = [
  // フェーズ1
  {
    id: 'ac-p1-reqs',
    name: '要件定義書を完成させたい',
    phase: 1,
    slot: 'requirements',
    level: 1,
  },
  {
    id: 'ac-p1-map',
    name: 'サイト構成は詳しく設計してほしい',
    phase: 1,
    slot: 'sitemap',
    level: 2,
  },
  // フェーズ2
  {
    id: 'ac-p2-wire',
    name: 'ワイヤーフレームで動きを見たい',
    phase: 2,
    slot: 'wireframe',
    level: 1,
  },
  {
    id: 'ac-p2-design',
    name: 'デザインカンプは磨き込みたい',
    phase: 2,
    slot: 'design-comp',
    level: 2,
  },
  // フェーズ3
  {
    id: 'ac-p3-top',
    name: 'トップページは完成度を求めます',
    phase: 3,
    slot: 'top-page',
    level: 2,
  },
  {
    id: 'ac-p3-cms',
    name: 'CMS は必ず導入してください',
    phase: 3,
    slot: 'cms',
    level: 1,
  },
  // フェーズ4
  {
    id: 'ac-p4-launch',
    name: '指定日に確実に公開してほしい',
    phase: 4,
    slot: 'launch',
    level: 1,
  },
  {
    id: 'ac-p4-all',
    name: '全ページの品質は妥協しない',
    phase: 4,
    slot: 'sub-pages',
    level: 2,
  },
]

/** イベントカード(14枚: 通常系9枚 + 差し込み系5枚) */
export const EVENTS: EventCard[] = [
  // ─── 通常系(予算・CS・疲労) ───
  {
    id: 'ev-scope-change',
    name: '要件変更',
    description: '「やっぱりこの機能も欲しいんですけど」',
    effects: [{ type: 'BUDGET', amount: -2 }],
  },
  {
    id: 'ev-extra-budget',
    name: '予算追加',
    description: '期末の予算消化に巻き込まれた。ありがたい。',
    effects: [{ type: 'BUDGET', amount: 3 }],
  },
  {
    id: 'ev-budget-tight',
    name: 'コスト見直し',
    description: '予算が圧迫されてきた。',
    effects: [{ type: 'BUDGET', amount: -1 }],
  },
  {
    id: 'ev-praise',
    name: '社長が褒めてた',
    description: '先方の社長がデザインを気に入ったらしい。',
    effects: [{ type: 'CS', amount: 1 }],
  },
  {
    id: 'ev-complaint',
    name: '進捗クレーム',
    description: '「思ったより時間がかかってますね」',
    effects: [{ type: 'CS', amount: -1 }],
  },
  {
    id: 'ev-fatigue-week',
    name: 'バタバタの一週間',
    description: 'あれやこれやで疲弊した。',
    effects: [{ type: 'FATIGUE_ALL', amount: 1 }],
  },
  {
    id: 'ev-rest-day',
    name: '平和な一週間',
    description: '何も起きない週もある。',
    effects: [{ type: 'NONE' }],
  },
  {
    id: 'ev-smooth',
    name: '打ち合わせスムーズ',
    description: '先方の反応が早く、判断も早い。',
    effects: [
      { type: 'BUDGET', amount: 1 },
      { type: 'CS', amount: 1 },
    ],
  },
  {
    id: 'ev-combined',
    name: 'トラブル祭り',
    description: '何もかもが重なった。',
    effects: [
      { type: 'BUDGET', amount: -1 },
      { type: 'CS', amount: -1 },
      { type: 'FATIGUE_ALL', amount: 1 },
    ],
  },
  // ─── 差し込み系(INTERRUPT) ───
  {
    id: 'ev-rework-1',
    name: 'デザイン手戻り',
    description: '「色が違う気がする」',
    effects: [{ type: 'INTERRUPT', kind: 'rework', amount: 2 }],
  },
  {
    id: 'ev-rework-2',
    name: 'コンテンツ修正',
    description: 'テキスト修正指示がどんどん来た。',
    effects: [{ type: 'INTERRUPT', kind: 'rework', amount: 2 }],
  },
  {
    id: 'ev-bug-1',
    name: 'バグ報告',
    description: '本番にだけ出るバグ。何で?',
    effects: [{ type: 'INTERRUPT', kind: 'bug', amount: 2 }],
  },
  {
    id: 'ev-bug-2',
    name: '仕様漏れ',
    description: '「あ、この機能は動く想定だったんですけど」',
    effects: [{ type: 'INTERRUPT', kind: 'bug', amount: 2 }],
  },
  {
    id: 'ev-consult',
    name: '急な相談',
    description: '次のキャンペーンのこと、相談したいんだけど...',
    effects: [{ type: 'INTERRUPT', kind: 'consult', amount: 2, rewardBudget: 2 }],
  },
]

/** 炎上カード(9枚) */
export const FIRES: FireCard[] = [
  {
    id: 'fire-most-1',
    name: '「これが一番重要です」',
    target: 'most_cubes',
  },
  {
    id: 'fire-most-2',
    name: '仕様の膨張',
    target: 'most_cubes',
  },
  {
    id: 'fire-most-3',
    name: 'スコープクリープ',
    target: 'most_cubes',
  },
  {
    id: 'fire-finish-1',
    name: '終盤の駆け込み要望',
    target: 'lane_finish',
  },
  {
    id: 'fire-finish-2',
    name: 'テスト中に仕様変更',
    target: 'lane_finish',
  },
  {
    id: 'fire-oldest-1',
    name: '古傷が疼く',
    target: 'oldest',
  },
  {
    id: 'fire-oldest-2',
    name: '当初計画の誤算',
    target: 'oldest',
  },
  {
    id: 'fire-epidemic-1',
    name: '全面炎上',
    target: 'epidemic',
  },
  {
    id: 'fire-epidemic-2',
    name: 'クライアント激怒',
    target: 'epidemic',
  },
]

/** 限界イベントカード(7枚: デメリット6 + 何も起きない1) */
export const LIMIT_EVENTS: LimitEventCard[] = [
  {
    id: 'lm-sick',
    name: '体調不良',
    description: 'コロナか、それとも過労か。寝込んだ。',
    effect: { type: 'FATIGUE_ALL', amount: 1 },
  },
  {
    id: 'lm-bug',
    name: '深夜のデプロイミス',
    description: '朦朧とした頭で本番を壊した。',
    effect: { type: 'CS', amount: -1 },
  },
  {
    id: 'lm-rework-cost',
    name: '手戻りコスト',
    description: '疲れた目はタイポを見逃す。やり直し。',
    effect: { type: 'BUDGET', amount: -2 },
  },
  {
    id: 'lm-overtime-ban',
    name: '過労警告',
    description: '労務管理から「来週は残業禁止」指示が来た。',
    effect: { type: 'OVERTIME_BAN' },
  },
  {
    id: 'lm-budget-hit',
    name: '予算使い果たし',
    description: '想定外の支出が重なった。',
    effect: { type: 'BUDGET', amount: -1 },
  },
  {
    id: 'lm-quality-down',
    name: '空気の重さ',
    description: '限界のメンバーがチーム全体を暗くした。',
    effect: { type: 'CS', amount: -1 },
  },
  {
    id: 'lm-nothing',
    name: '何も起きない',
    description: '今回は、なんとか踏みとどまった。',
    effect: { type: 'NONE' },
  },
]

/** メンバーカード(6枚: 最低4種の能力を網羅。合計スキル3~4) */
export const MEMBERS: MemberCard[] = [
  {
    id: 'm-allrounder',
    name: '元エンジニアの何でも屋',
    flavor: 'バックエンド出身。DevOps経験も豊富。',
    skills: { direction: 1, design: 1, engineering: 1 },
    ability: 'multitask',
  },
  {
    id: 'm-designer-polish',
    name: 'デザイン寄り職人',
    flavor: 'グラフィックデザイン背景。細部へのこだわりが強い。',
    skills: { direction: 1, design: 2, engineering: 0 },
    ability: 'polish',
  },
  {
    id: 'm-pm-expedite',
    name: 'マネジメント寄りリーダー',
    flavor: '営業出身。段取りと調整が得意。',
    skills: { direction: 2, design: 1, engineering: 0 },
    ability: 'expedite',
  },
  {
    id: 'm-engineer-automate',
    name: '開発寄りテックリード',
    flavor: 'フロントエンド出身。自動化・効率化を常に考える。',
    skills: { direction: 0, design: 1, engineering: 2 },
    ability: 'automate',
  },
  {
    id: 'm-balanced',
    name: '新卒からの全経験者',
    flavor: 'スタートアップで全職を経験。どこでも対応できる。',
    skills: { direction: 1, design: 1, engineering: 2 },
    ability: 'expedite',
  },
  {
    id: 'm-specialist',
    name: 'UIデザインスペシャリスト',
    flavor: '有名プロダクト出身。UXへのこだわりが一級。',
    skills: { direction: 1, design: 2, engineering: 1 },
    ability: 'polish',
  },
]

/** プロジェクトシート(2枚: スタンダード・ハード) */
export const PROJECT_SHEETS: ProjectSheet[] = [
  {
    id: 'ps-standard',
    name: 'スタンダード案件',
    initialCs: 5,
    initialBudget: 18,
    description: 'フルスタック Web サイト。予算・納期ともに標準的。チーム4〜5名で4フェーズ完走を想定。',
  },
  {
    id: 'ps-hard',
    name: 'ハード案件',
    initialCs: 4,
    initialBudget: 14,
    description: '予算シビア、品質要求高。難易度UP。上級者向け。チームの連携と優先度判断がカギ。',
  },
]
