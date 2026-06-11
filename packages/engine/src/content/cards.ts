/**
 * プレイテスト用の仮カードデータ
 * イベント10枚 / 要件カード8枚 / 限界イベント6枚+「何も起きない」1枚 / 個人目標4枚
 */
import type {
  ClientCard,
  EventCard,
  LimitEventCard,
  MilestoneCard,
  PersonalGoalCard,
  ProjectCard,
  ProjectSheet,
  RequirementCard,
  RoleDef,
} from '../types/content'

/** イベントカード(10枚) */
export const EVENTS: EventCard[] = [
  {
    id: 'ev-scope-change',
    name: '要件変更',
    description: '「やっぱりこの機能も欲しいんですけど」',
    effects: [{ type: 'BUDGET', amount: -2 }],
  },
  {
    id: 'ev-extra-feature',
    name: '追加機能要望',
    description: '対応すれば喜ばれるが、現場は疲弊する。',
    effects: [
      { type: 'CS', amount: 1 },
      { type: 'FATIGUE_ALL', amount: 1 },
    ],
  },
  {
    id: 'ev-deadline-pull',
    name: '納期前倒し',
    description: '「展示会に間に合わせたいんです」',
    effects: [{ type: 'FATIGUE_ALL', amount: 1 }],
  },
  {
    id: 'ev-bug-report',
    name: 'バグ報告',
    description: '本番にだけ出る。なぜか本番にだけ。',
    effects: [
      { type: 'CS', amount: -1 },
      { type: 'BUDGET', amount: -1 },
    ],
  },
  {
    id: 'ev-extra-budget',
    name: '予算追加',
    description: '期末の予算消化に巻き込まれた。ありがたい。',
    effects: [{ type: 'BUDGET', amount: 3 }],
  },
  {
    id: 'ev-praise',
    name: '社長が褒めてた',
    description: '先方の社長がデザインを気に入ったらしい。',
    effects: [{ type: 'CS', amount: 1 }],
  },
  {
    id: 'ev-contact-change',
    name: '担当者交代',
    description: '引き継ぎゼロで担当者が変わった。説明やり直し。',
    effects: [
      { type: 'CS', amount: -1 },
      { type: 'FATIGUE_ALL', amount: 1 },
    ],
  },
  {
    id: 'ev-server-down',
    name: '検証サーバーダウン',
    description: '復旧作業に半日溶けた。',
    effects: [{ type: 'BUDGET', amount: -1 }],
  },
  {
    id: 'ev-smooth-week',
    name: '平和な一週間',
    description: '何も起きない週もある。',
    effects: [{ type: 'NONE' }],
  },
  {
    id: 'ev-reference-hit',
    name: '参考サイトが刺さった',
    description: '「こういうのが欲しかったんです!」方向性が固まった。',
    effects: [
      { type: 'CS', amount: 1 },
      { type: 'BUDGET', amount: 1 },
    ],
  },
]

/** 要件カード(8枚) */
export const REQUIREMENTS: RequirementCard[] = [
  {
    id: 'rq-spa',
    name: '実は SPA 要件だった',
    description: '途中から「アプリみたいにしたい」と言われた。',
    effect: { type: 'EXTRA_SKILL', requirement: { skill: 'engineering', level: 2 } },
  },
  {
    id: 'rq-kerning',
    name: '字詰めへの強いこだわり',
    description: '1px 単位の調整指示が届く。',
    effect: { type: 'EXTRA_SKILL', requirement: { skill: 'design', level: 2 } },
  },
  {
    id: 'rq-approval',
    name: '上長承認が必要',
    description: '決裁フローが3段階あることが判明。',
    effect: { type: 'EXTRA_SKILL', requirement: { skill: 'direction', level: 2 } },
  },
  {
    id: 'rq-license',
    name: '有料ライセンスが必要',
    description: 'フォントとプラグインの費用が想定外。',
    effect: { type: 'EXTRA_COST', amount: 1 },
  },
  {
    id: 'rq-midnight',
    name: '深夜対応',
    description: '本番反映は利用者の少ない深夜に。',
    effect: { type: 'EXTRA_FATIGUE', amount: 1 },
  },
  {
    id: 'rq-template',
    name: '使えるテンプレがあった',
    description: '過去案件の資産がほぼそのまま流用できた。',
    effect: { type: 'COST_DISCOUNT', amount: 1 },
  },
  {
    id: 'rq-portfolio',
    name: 'ポートフォリオ掲載OK',
    description: '実績公開の許可が出た。チームの士気が上がる。',
    effect: { type: 'BONUS_DELIVERABLE', level: 1 },
  },
  {
    id: 'rq-as-spec',
    name: '仕様書どおり',
    description: '珍しく、書いてあるとおりだった。',
    effect: { type: 'NONE' },
  },
]

/** 限界イベントカード(デメリット6枚 + 「何も起きない」1枚) */
export const LIMIT_EVENTS: LimitEventCard[] = [
  {
    id: 'lm-sick',
    name: '体調を崩した',
    description: '無理がたたって寝込んだ。次のフェーズは出力が落ちる。',
    effect: { type: 'TOKEN_PENALTY_NEXT', amount: 1 },
  },
  {
    id: 'lm-mistake',
    name: '深夜のデプロイミス',
    description: '朦朧とした頭で本番を壊した。',
    effect: { type: 'CS', amount: -1 },
  },
  {
    id: 'lm-rework',
    name: '手戻り発生',
    description: '疲れた目はタイポを見逃す。作り直し。',
    effect: { type: 'BUDGET', amount: -2 },
  },
  {
    id: 'lm-quality-drop',
    name: '品質の妥協',
    description: '「もうこれでいいか」が成果物に滲み出た。',
    effect: { type: 'QUALITY_DOWN' },
  },
  {
    id: 'lm-bad-mood',
    name: 'ピリつく空気',
    description: '限界のメンバーがチーム全体の空気を重くした。',
    effect: { type: 'FATIGUE_ALL', amount: 1 },
  },
  {
    id: 'lm-overtime-pay',
    name: '残業代の請求',
    description: '労務管理は大事。コストとして跳ね返ってきた。',
    effect: { type: 'BUDGET', amount: -1 },
  },
  {
    id: 'lm-nothing',
    name: '何も起きない',
    description: '今回は、なんとか踏みとどまった。',
    effect: { type: 'NONE' },
  },
]

/** 個人目標カード(4枚) */
export const PERSONAL_GOALS: PersonalGoalCard[] = [
  {
    id: 'pg-quality',
    name: '品質の鬼',
    description: '自分が参加したタスクから Lv2 成果物を3個以上獲得する',
    condition: { type: 'LV2_DELIVERABLES_AT_LEAST', count: 3 },
  },
  {
    id: 'pg-learner',
    name: '学習マニア',
    description: 'スキル合計を初期値から +2 以上成長させる',
    condition: { type: 'SKILL_GROWTH_AT_LEAST', amount: 2 },
  },
  {
    id: 'pg-balance',
    name: 'ワークライフバランス',
    description: 'ゲーム終了時に疲労 Lv0 でいる',
    condition: { type: 'FATIGUE_AT_MOST', level: 0 },
  },
  {
    id: 'pg-cost-keeper',
    name: 'コスト番人',
    description: 'ゲーム終了時に予算を初期値の3割以上残す',
    condition: { type: 'BUDGET_RATIO_AT_LEAST', ratio: 0.3 },
  },
  {
    id: 'pg-hub',
    name: 'ハブ人材',
    description: 'EP(自分の仕事が他人に使われた回数)を5以上にする',
    condition: { type: 'EP_AT_LEAST', amount: 5 },
  },
  {
    id: 'pg-firefighter',
    name: '火消し屋',
    description: '累計4回以上消火する',
    condition: { type: 'EXTINGUISH_AT_LEAST', count: 4 },
  },
  {
    id: 'pg-generalist',
    name: '何でも屋',
    description: '3系統すべてのスキルを Lv1 以上にする',
    condition: { type: 'ALL_SKILLS_AT_LEAST', level: 1 },
  },
  {
    id: 'pg-steady',
    name: '安定稼働',
    description: 'ゲーム終了時に疲労 Lv1 以下でいる',
    condition: { type: 'FATIGUE_AT_MOST', level: 1 },
  },
]

/** マイルストーンカード(v2.1。公開・早取り) */
export const MILESTONES: MilestoneCard[] = [
  {
    id: 'ms-firefighter',
    name: '火消し番長',
    description: '最初に累計5回消火する',
    condition: { type: 'EXTINGUISH_AT_LEAST', count: 5 },
  },
  {
    id: 'ms-quality',
    name: '品質職人',
    description: '最初に Lv2 成果物2個に参加する',
    condition: { type: 'LV2_PARTICIPATED_AT_LEAST', count: 2 },
  },
  {
    id: 'ms-learner',
    name: '学習の鬼',
    description: '最初にスキルアップを2回行う',
    condition: { type: 'SKILL_UP_AT_LEAST', count: 2 },
  },
  {
    id: 'ms-unsung',
    name: '縁の下',
    description: '最初に EP 4 に到達する',
    condition: { type: 'EP_AT_LEAST', amount: 4 },
  },
  {
    id: 'ms-workhorse',
    name: '鬼の工数',
    description: '最初に1フェーズ中にトークン5個以上をタスクへ配置する',
    condition: { type: 'PHASE_PLACEMENTS_AT_LEAST', count: 5 },
  },
]

/** クライアントカード(3枚) */
export const CLIENTS: ClientCard[] = [
  {
    id: 'cl-marunage',
    name: '丸投げ商事',
    personality: '丸投げ系。「いい感じにしてください」が口癖。納期だけは譲らない。',
    weights: { q: 1, c: 1, d: 3 },
  },
  {
    id: 'cl-komakai',
    name: 'コマカイ製作所',
    personality: '細かい系。赤入れ PDF が毎朝届く。品質には一切妥協しない。',
    weights: { q: 3, c: 1, d: 1 },
  },
  {
    id: 'cl-genba',
    name: 'ゲンバ重視ホールディングス',
    personality: '現場重視。話は早いが、予算の決裁は渋い。',
    weights: { q: 1, c: 3, d: 1 },
  },
]

/** プロジェクトカード(3枚) */
export const PROJECTS: ProjectCard[] = [
  {
    id: 'pj-corporate',
    name: 'コーポレートサイトリニューアル',
    projectType: 'CMS',
    specialRequirements: ['CMS 組み込み', 'レスポンシブ対応'],
  },
  {
    id: 'pj-brand',
    name: 'ブランドサイト新規構築',
    projectType: 'ブランドサイト',
    specialRequirements: ['多言語対応', 'アニメーション演出'],
  },
  {
    id: 'pj-campaign',
    name: '季節キャンペーン LP',
    projectType: 'キャンペーン',
    specialRequirements: ['GA 実装', '公開日固定'],
  },
]

/** プロジェクトシート(シナリオ) */
export const PROJECT_SHEETS: ProjectSheet[] = [
  {
    id: 'ps-standard',
    name: 'スタンダード案件',
    initialCs: 5,
    initialBudget: 18,
    phaseRules: [
      { qualityThreshold: 1, deadlineAllowance: 1, csPenaltyQuality: 1, csPenaltyDeadline: 1 },
      { qualityThreshold: 1, deadlineAllowance: 1, csPenaltyQuality: 1, csPenaltyDeadline: 1 },
      { qualityThreshold: 1, deadlineAllowance: 2, csPenaltyQuality: 1, csPenaltyDeadline: 1 },
      { qualityThreshold: 1, deadlineAllowance: 0, csPenaltyQuality: 1, csPenaltyDeadline: 1 },
    ],
    specialRule: null,
  },
]

/** ロール定義(初期スキル値。RULES.md §9-6 のコンテンツデザイン暫定値) */
export const ROLES: RoleDef[] = [
  {
    role: 'pm',
    name: 'PM',
    initialSkills: { direction: 2, design: 0, engineering: 0 },
  },
  {
    role: 'director',
    name: 'ディレクター',
    initialSkills: { direction: 1, design: 1, engineering: 0 },
  },
  {
    role: 'designer',
    name: 'デザイナー',
    initialSkills: { direction: 0, design: 2, engineering: 0 },
  },
  {
    role: 'engineer',
    name: 'エンジニア',
    initialSkills: { direction: 0, design: 0, engineering: 2 },
  },
]
