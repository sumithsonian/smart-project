/**
 * コンテンツカード一式(v5)
 * REQUIREMENTS 8枚(+追加要望用3枚) / EVENTS 16枚 / FIRES 9枚 / LIMIT_EVENTS 7枚 /
 * MEMBERS 6枚 / PROJECT_SHEETS 2枚
 */
import type {
  EventCard,
  FireCard,
  LimitEventCard,
  MemberCard,
  ProjectSheet,
  RequirementCard,
} from '../types/content'

/**
 * 要件カード(RULES.md §3-1)
 * phase = 公開されるフェーズ / deadlinePhase = 清算されるフェーズ / tier = 初期区分。
 * phase: 0 のカードはスコープ会議では公開されず、イベントの ADD_REQUIREMENT でのみ場に出る。
 */
export const REQUIREMENTS: RequirementCard[] = [
  // ─── フェーズ1: 企画・要件定義 ───
  {
    id: 'rq-p1-reqs',
    name: '要件定義書を完成させたい',
    phase: 1,
    slot: 'requirements',
    level: 1,
    deadlinePhase: 1,
    tier: 'must',
  },
  {
    id: 'rq-p1-map',
    name: 'サイト構成は詳しく設計してほしい',
    phase: 1,
    slot: 'sitemap',
    level: 2,
    deadlinePhase: 2,
    tier: 'better',
  },
  // ─── フェーズ2: 設計・デザイン ───
  {
    id: 'rq-p2-wire',
    name: 'ワイヤーフレームで動きを見たい',
    phase: 2,
    slot: 'wireframe',
    level: 1,
    deadlinePhase: 2,
    tier: 'must',
  },
  {
    id: 'rq-p2-design',
    name: 'デザインカンプは磨き込みたい',
    phase: 2,
    slot: 'design-comp',
    level: 2,
    deadlinePhase: 3,
    tier: 'better',
  },
  // ─── フェーズ3: 開発 ───
  {
    id: 'rq-p3-cms',
    name: 'CMS は必ず導入してください',
    phase: 3,
    slot: 'cms',
    level: 1,
    deadlinePhase: 3,
    tier: 'must',
  },
  {
    id: 'rq-p3-top',
    name: 'トップページは完成度を求めます',
    phase: 3,
    slot: 'top-page',
    level: 2,
    deadlinePhase: 4,
    tier: 'better',
  },
  // ─── フェーズ4: テスト・公開 ───
  {
    id: 'rq-p4-launch',
    name: '指定日に確実に公開してほしい',
    phase: 4,
    slot: 'launch',
    level: 1,
    deadlinePhase: 4,
    tier: 'must',
  },
  {
    id: 'rq-p4-sub',
    name: '下層ページの品質も妥協しない',
    phase: 4,
    slot: 'sub-pages',
    level: 2,
    deadlinePhase: 4,
    tier: 'better',
  },

  // ─── 追加要望用(イベントの ADD_REQUIREMENT でのみ場に出る)───
  {
    id: 'rq-add-styleguide',
    name: '【追加】スタイルガイドも整えてほしい',
    phase: 0,
    slot: 'styleguide',
    level: 1,
    deadlinePhase: 4,
    tier: 'better',
  },
  {
    id: 'rq-add-sub-quality',
    name: '【追加】下層ページも作り込んでほしい',
    phase: 0,
    slot: 'sub-pages',
    level: 1,
    deadlinePhase: 4,
    tier: 'better',
  },
  {
    id: 'rq-add-cms-quality',
    name: '【追加】CMS は編集しやすくしてほしい',
    phase: 0,
    slot: 'cms',
    level: 2,
    deadlinePhase: 4,
    tier: 'better',
  },
]

/**
 * イベントカード(週末に1枚。RULES.md §7)
 * 主要なイベントは2つ以上の選択肢を持つ(受ける/交渉する/断る)。
 */
export const EVENTS: EventCard[] = [
  // ─── 選択肢あり:スコープと次週を動かす ───
  {
    id: 'ev-help-other',
    name: '他案件ヘルプ要請',
    description: '「隣のチームが炎上してて、1人だけ貸してもらえない?」',
    effects: [],
    choices: [
      {
        id: 'accept',
        label: '受ける',
        description: '来週1人のキャパシティが下がる。だが社内の貸し借りは効く(CS+1)。',
        effects: [{ type: 'CAPACITY_DOWN' }, { type: 'CS', amount: 1 }],
      },
      {
        id: 'decline',
        label: '断る',
        description: '自分たちの案件を守る。角は立つ(CS-1)。',
        effects: [{ type: 'CS', amount: -1 }],
      },
    ],
  },
  {
    id: 'ev-client-review-wait',
    name: 'クライアント確認待ち',
    description: '「社内で確認しますので、少しお時間を」',
    effects: [],
    choices: [
      {
        id: 'wait',
        label: '待つ',
        description: '対象のタスクは来週は着手できない。関係は良好に保たれる。',
        effects: [{ type: 'BLOCK_TASK' }],
      },
      {
        id: 'push',
        label: '押し切る',
        description: '確認前に進める。手戻りリスクを買う(CS-1)。',
        effects: [{ type: 'CS', amount: -1 }],
      },
    ],
  },
  {
    id: 'ev-add-request-style',
    name: '要件追加:スタイルガイド',
    description: '「他のページも同じ雰囲気にしたいんですが…」',
    effects: [],
    choices: [
      {
        id: 'must',
        label: 'Must として受ける',
        description: 'スコープに Must で入れる。やり切れば信頼になる(達成で CS+1)。',
        effects: [
          { type: 'ADD_REQUIREMENT', requirementId: 'rq-add-styleguide', tier: 'must' },
        ],
        csOnFulfill: 1,
      },
      {
        id: 'better',
        label: 'Better として受ける',
        description: '余力があればやる、と伝える(達成で CS+1)。',
        effects: [
          { type: 'ADD_REQUIREMENT', requirementId: 'rq-add-styleguide', tier: 'better' },
        ],
        csOnFulfill: 1,
      },
      {
        id: 'decline',
        label: '断る',
        description: '今回のスコープ外だと伝える(CS-1)。',
        effects: [{ type: 'CS', amount: -1 }],
      },
    ],
  },
  {
    id: 'ev-add-request-cms',
    name: '要件追加:CMS の使い勝手',
    description: '「更新作業、うちの担当が自分でやりたいんです」',
    effects: [],
    choices: [
      {
        id: 'better',
        label: 'Better として受ける',
        description: 'CMS を Lv2 まで作り込む約束はしないが、狙う(達成で CS+1)。',
        effects: [
          { type: 'ADD_REQUIREMENT', requirementId: 'rq-add-cms-quality', tier: 'better' },
        ],
        csOnFulfill: 1,
      },
      {
        id: 'negotiate',
        label: '交渉する',
        description: '別途お見積りとして切り出す(予算+3)。',
        effects: [{ type: 'BUDGET', amount: 3 }],
      },
      {
        id: 'decline',
        label: '断る',
        description: '今回は標準機能でお願いする(CS-1)。',
        effects: [{ type: 'CS', amount: -1 }],
      },
    ],
  },
  {
    id: 'ev-spec-change',
    name: '仕様変更',
    description: '「やっぱりここ、作り直してもらえますか」',
    effects: [],
    choices: [
      {
        id: 'accept',
        label: '受ける',
        description: '納品済み成果物に手戻りが発生する。',
        effects: [{ type: 'INTERRUPT', kind: 'rework', amount: 2 }],
      },
      {
        id: 'negotiate',
        label: '交渉する',
        description: '追加費用と引き換えに、今回の変更は見送ってもらう(予算-3)。',
        effects: [],
        budgetCost: 3,
      },
    ],
  },
  {
    id: 'ev-bug-report',
    name: 'バグ報告',
    description: '本番でだけ再現するらしい。ログを見ないと分からない。',
    effects: [],
    choices: [
      {
        id: 'fix',
        label: '対応する',
        description: 'エンジニアリングの割り込みとして受ける(やり切れば CS+1)。',
        effects: [
          { type: 'INTERRUPT', kind: 'bug', amount: 2, skill: 'engineering' },
        ],
        csOnFulfill: 1,
      },
      {
        id: 'watch',
        label: '様子を見る',
        description: '再現条件を待つ。放置は出血になる(フェーズ末ごとに CS-1)。',
        effects: [{ type: 'INTERRUPT', kind: 'bug', amount: 2, skill: 'engineering' }],
      },
    ],
  },
  {
    id: 'ev-quality-audit',
    name: 'クライアント側レビュー',
    description: '先方の担当が細かくチェックを始めた。',
    effects: [],
    choices: [
      {
        id: 'accept',
        label: 'そのまま受ける',
        description: '粗い作りは指摘される(品質リスクのある成果物1つにつき CS-1、最大2)。',
        effects: [{ type: 'QUALITY_AUDIT', maxPenalty: 2 }],
      },
      {
        id: 'prepare',
        label: '事前に説明する',
        description: '予算を使って説明資料を用意し、指摘を1件ぶんに抑える。',
        effects: [{ type: 'QUALITY_AUDIT', maxPenalty: 1 }],
        budgetCost: 2,
      },
    ],
  },

  // ─── 選択肢なし:単純な増減 ───
  {
    id: 'ev-scope-change',
    name: '細かな仕様調整',
    description: '「ここの文言だけ直しておいてください」',
    effects: [{ type: 'BUDGET', amount: -2 }],
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
    id: 'ev-design-rework',
    name: 'デザイン手戻り',
    description: '「色が違う気がするんですよね」',
    effects: [{ type: 'INTERRUPT', kind: 'rework', amount: 2 }],
  },
  {
    id: 'ev-consult',
    name: '急な相談',
    description: '次のキャンペーンのこと、相談したいんだけど…',
    effects: [{ type: 'INTERRUPT', kind: 'consult', amount: 2, skill: null, rewardBudget: 2 }],
  },
]

/** 炎上カード(9枚) */
export const FIRES: FireCard[] = [
  { id: 'fire-most-1', name: '「これが一番重要です」', target: 'most_cubes' },
  { id: 'fire-most-2', name: '仕様の膨張', target: 'most_cubes' },
  { id: 'fire-most-3', name: 'スコープクリープ', target: 'most_cubes' },
  { id: 'fire-week-1', name: '今週の駆け込み要望', target: 'this_week' },
  { id: 'fire-week-2', name: '進行中の仕様変更', target: 'this_week' },
  { id: 'fire-blocked-1', name: '待たされている間に話が変わる', target: 'blocked' },
  { id: 'fire-oldest-1', name: '古傷が疼く', target: 'oldest' },
  { id: 'fire-oldest-2', name: '当初計画の誤算', target: 'oldest' },
  { id: 'fire-epidemic-1', name: '全面炎上', target: 'epidemic' },
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

/** メンバーカード(6枚: 最低4種の能力を網羅。合計スキル3〜4) */
export const MEMBERS: MemberCard[] = [
  {
    id: 'm-allrounder',
    name: '元エンジニアの何でも屋',
    flavor: 'バックエンド出身。DevOps 経験も豊富。',
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
    name: 'UI デザインスペシャリスト',
    flavor: '有名プロダクト出身。UX へのこだわりが一級。',
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
    description:
      'フルスタック Web サイト。予算・納期ともに標準的。チーム4〜5名で4フェーズ完走を想定。',
  },
  {
    id: 'ps-hard',
    name: 'ハード案件',
    initialCs: 4,
    initialBudget: 14,
    description:
      '予算シビア、品質要求高。難易度 UP。上級者向け。チームの連携と優先度判断がカギ。',
  },
]
