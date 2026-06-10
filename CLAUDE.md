# CLAUDE.md — smart-project 開発ガイド

## プロジェクト概要

「スマートプロジェクト」— Web制作会社を舞台にした4〜5人協力型ボードゲームのデジタル版。
オンライン対戦(各自のデバイス)、リアルタイム・非同期の両方のセッション進行に対応する。
デジタル版は「物理版に向けたルール検証」と「デジタルゲームとしての公開」の両方を目的とする。

**ゲームルールの単一の正は `docs/RULES.md`。** ルールに関する実装は必ず RULES.md を参照し、
RULES.md に書かれていない挙動を実装で勝手に決めない(❓ TODO 項目は質問するか、GameConfig でパラメータ化する)。
ルール変更が決まったら、コードより先に RULES.md を更新する。

## アーキテクチャ方針

### イベントソーシング(最重要)

- ゲーム状態はスナップショットで持たず、**アクションログの追記 + 純粋関数によるリプレイ**で導出する
- `replay(initialState, actions) => GameState`
- 理由:非同期セッションの永続化、Realtime同期、プレイテストのバランス分析(物理版検証)、局面の完全再現がすべてこの一つの設計で成立するため

### ルールエンジンの分離

- ルールエンジンは UI・DB・ネットワークから完全に独立した純TypeScriptパッケージ(`packages/engine`)
- 公開インターフェースの中核:
  ```ts
  applyAction(state: GameState, action: GameAction): GameState | RuleViolation
  ```
- 副作用禁止。乱数はシード付き乱数を state に持たせ、再現可能にする(カードシャッフル等)
- 同じエンジンコードを「サーバー側の正当性検証」「クライアントの楽観的更新」「バランスシミュレーション」の3箇所で使い回す

### 秘匿情報

- 個人目標カード・要件カードなど他プレイヤーに見せない情報がある
- クライアントに生のフル状態を渡さない。**サーバー側でプレイヤーごとに redact したビューを返す**
- エンジンに `redactFor(state, playerId): PlayerView` を用意する

### GameConfig

- バランス数値(疲労、トークン数、CS係数 など)はすべて `GameConfig` オブジェクトに外出し
- ハードコード禁止。RULES.md の §8 にパラメータ一覧がある
- ロビーの設定画面とプロジェクトシート(難易度プリセット)の両方から上書きできる構造にする

## リポジトリ構成(pnpm workspace モノレポ)

```
smart-project/
├── CLAUDE.md
├── docs/
│   └── RULES.md          # ルールの単一の正
├── packages/
│   └── engine/           # 純TSルールエンジン(UI/DB非依存)
│       ├── src/
│       │   ├── types/    # GameState, GameAction, GameConfig
│       │   ├── actions/  # アクションごとの適用ロジック
│       │   ├── replay.ts
│       │   ├── redact.ts
│       │   └── index.ts
│       └── test/         # ルールはすべてテストで担保
└── apps/
    └── web/              # Nuxt 4 アプリ
```

## 技術スタック

- **言語:** TypeScript(strict)
- **パッケージ管理:** pnpm workspace
- **フロントエンド:** Nuxt 4 + Composition API
- **テスト:** Vitest(エンジンはテストカバレッジ必須。ルール1つにつき最低1テスト)
- **ホスティング:** Cloudflare Pages(ステージ2以降)
- **バックエンド:** Supabase(ステージ2以降。Auth + Postgres + Realtime + Edge Functions)
  - DBスキーマは Supabase CLI のマイグレーションファイルで管理。ダッシュボードでの直接変更禁止

## 開発ステージ

現在:**ステージ1**

1. **ステージ1 — エンジン + ホットシート:**
   `packages/engine` の実装と、1画面で全プレイヤーを操作できるデバッグUI(秘匿情報も全表示)。
   ネットワーク層なし。ルールの穴を潰すことが目的
2. **ステージ2 — オンライン化:**
   Supabase Auth、ロビー、`game_actions` テーブルへの追記、Realtime購読、Edge Function での正当性検証と redact
3. **ステージ3 — 公開品質:**
   UIの磨き込み、非同期時の手番通知、観戦・リプレイ機能、バランス分析ダッシュボード

## コーディング規約

- エンジン内のドメイン用語はRULES.mdの用語に対応する英語名を使い、型のJSDocに日本語名を併記する
  (例:`fatigue /** 疲労 */`、`deliverable /** 成果物 */`、`actionToken /** 行動トークン */`)
- アクション名は動詞ベース:`PLACE_TOKEN`, `DECLARE_READY`, `RESOLVE_TASK`, `REST`, `EXTRA_BILLING` など
- UIテキスト・コミットメッセージ・ドキュメントは日本語
- エンジンに `Date.now()` / `Math.random()` を直接書かない(再現性のため)
