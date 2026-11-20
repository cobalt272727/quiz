# 問題ブック作成サイト(SPEC_v4 実装)

Markdown 風の記法(QB Markup)で問題ブックを書き、ブラウザで受験・採点・復習ができる Web サービスの実装です。
仕様は [`SPEC_v4.md`](./SPEC_v4.md)、記法は [`docs/syntax.md`](./docs/syntax.md) を参照してください。

## 現在の状態

フェーズ 0(記法の確定)、フェーズ 1(パーサ/採点コア)、フェーズ 2(Web アプリ・DB・認証・API)まで
実装済みです。PostgreSQL に保存する **サーバモード**(ログイン・ブック保存・サーバ採点)と、
ログイン不要の **ローカルモード**(localStorage)の両方が動きます。

```
packages/qb-parser   記法パーサ・AST 型・採点ロジック・toPublic / toResult(単体テスト 129 件、外部依存ゼロ)
apps/web             Next.js 15 アプリ(エディタ / 受験 / マイブック / 認証 / API)
prisma/              スキーマとマイグレーション(SPEC_v4 §6)
docs/syntax.md       記法リファレンス(/docs/syntax の内容)
docs/api.md          API 仕様(§7 の対応表)
docs/operations.md   定期実行(cron)・RE2・環境変数・バックアップ
docs/database.md     DB の要件と適用手順
docs/samples/*.qb    サンプルブック
tools/               検証 CLI(qb-check.ts / verify-sql.ts / e2e-*.ts)
```

### 画面

| パス | 内容 |
| --- | --- |
| `/` | サービス紹介、記法の抜粋、実装スコープとデータの扱い |
| `/browse` | 公開ライブラリ(検索・タグ・ページング) |
| `/b/<id>` | 公開ブックの詳細と受験開始(ゲスト可) |
| `/s/<token>` | 共有リンク経由の閲覧・受験 |
| `/r/<token>` | 結果共有(点数と受験日時のみ) |
| `/login` | ログイン / 新規登録 |
| `/library` | マイブック一覧(公開範囲の変更・編集・受験・削除) |
| `/books/new` | 新規ブックのエディタ(CodeMirror 6)+ ライブプレビュー + 診断一覧。初期内容はフロントマターのみ、`.qb` の開く/書き出し、サーバ保存 |
| `/books/new?book=<id>` | 保存済みブックの編集(楽観ロック付き・画像アップロード) |
| `/play` | ローカルモードの受験(localStorage。エディタの「このブックで受験する」から遷移) |
| `/attempt/<id>` | サーバ受験。タイマー・自動保存・サーバ採点・復習表示 |
| `/docs/syntax` | 記法リファレンス(`docs/syntax.md` をビルド時に解析して描画) |

## 動かし方

```bash
pnpm install            # 依存の導入
pnpm dev                # http://localhost:3000
pnpm test               # パーサの単体テスト
pnpm typecheck          # 型チェック(parser + web)
pnpm db:verify          # マイグレーション SQL を PGlite(WASM 版 PostgreSQL)で検証
pnpm e2e                # 認証・ブック・受験・採点・共有・画像・RE2・通報/管理・学習・ブック管理の E2E(要 dev サーバ)
pnpm admin:grant <id>   # 管理者ロールの付与(--revoke で解除)
pnpm verify             # test + typecheck + db:verify + build

node tools/qb-check.ts docs/samples/nihonshi.qb           # 記法チェック
node tools/qb-check.ts docs/samples/nihonshi.qb --writeback  # ID を確定して書き戻す
```

### データベース

```bash
cp .env.example .env              # DATABASE_URL を設定
psql -U postgres -f docs/database-setup.sql   # DB とロールの作成(初回のみ)
pnpm db:migrate                   # マイグレーション適用
pnpm db:generate                  # Prisma Client の生成
```

要件(PostgreSQL 15 以上・`pg_trgm`・権限)と代替案は [`docs/database.md`](./docs/database.md) を参照。

`prisma/migrations/20260101000001_constraints` に、Prisma で表現できない制約・索引
(`lower(loginId)` の一意、`Answer` / `Bookmark` の `NULLS NOT DISTINCT`、公開ブックの部分索引、
タグ GIN、日本語部分一致検索の trigram 索引)を SQL で定義しています。
`pnpm db:verify` は Docker なしでこの SQL を実際の PostgreSQL(PGlite)に適用し、
制約が意図どおり効くことまで確認します。

## パッケージ API(`@qb/parser`)

```ts
import { parse, saveSource, gradeAttempt, toPublic, toResult } from "@qb/parser";

// 1. 解析(クライアントのプレビュー用。ID 未付与は QB-W001 警告のみ)
const preview = parse(source);
preview.ast;         // BookAst(§5.1)
preview.diagnostics; // { code, severity, message, line, column }[]
preview.hasErrors;

// 2. 保存(サーバ用。ID を書き戻して確定済み source を返す。冪等)
const saved = saveSource(source, { retiredBlankIds, retiredQuestionIds, assetNames });
saved.source;        // ID 確定済みソース(クライアントはこれでエディタを置き換える)
saved.result.writes; // 空なら確定済み

// 3. 採点(正はサーバ)
const grade = gradeAttempt(ast, questions, answers);
// grade.score / maxScore / questions[].blanks / reviewQuestionIds

// 4. 受験者への配信(許可リスト方式。正解・解説・模範解答を落とす)
const publicBook = toPublic(ast);

// 5. 結果画面用の正解表示(終端状態の Attempt のみ)
const result = toResult(ast);
```

### 実装済みの仕様項目

- 記法: フロントマター、見出し、段落、リスト、表、コード、数式、画像、`[[ ]]` 空欄
  (exact / regex / number / choiceBlank)、`@q`(`blank` / `single` / `multi` / `essay` / `truefalse`)、
  `@explain` / `@hint` / `@model`、`{id=.. w=..}` / `{qid=..}`、`\[[` と `&vert;` のエスケープ
- 生ソース解析(§4.8): コード・数式・リンク URL・リンク表示テキストでは QB 記法を解釈しない。
  太字・斜体の内部では解釈する
- ID(§4.6): 生成(`^[qb]_[a-z0-9]{6,16}$`)、重複・形式・退役 ID の検出、ソースへの書き戻し(冪等)、
  選択肢 ID の決定的生成(`c1`, `c2`, …)
- 採点(§4.5): NFKC・大小無視・かな同一視、RE2 互換検証、数値の 10 進厳密比較(負号異体字・
  桁区切りカンマ)、配点按分と設問単位の丸め、`multi` の部分点、essay の自己採点、復習対象判定
- 公開射影(§5.3, §7.9): `toPublic`(許可リスト方式)と `toResult`(exact / number / regex /
  選択肢 / 真偽 / 模範解答)
- 診断コード QB-E001〜E012 / QB-W001, W002(§5.2)

### 意図的な簡略化(次フェーズで拡張)

- Markdown は仕様に必要なサブセットのみ(blockquote は段落として扱い、HTML は描画しない)
- `toPublic` の選択肢シャッフルは出題セッション側(`Attempt.settings.seed`)の責務
- AST の実行時スキーマ検証は Zod ではなく手書き検証(依存ゼロのため)。UI 層を入れる段階で
  共有スキーマ(Zod)に置き換える
- 正規表現の実行は `RegExp`(ブラウザ/Node)。サーバでは `re2` を `GradeOptions.regexTest` に差し込む

## 設計メモ

- `packages/qb-parser/src`
  - `parse.ts` エントリポイント。`saveSource` が書き戻し→再解析を行う
  - `blocks.ts` 行指向のブロック走査 + 自動設問生成 + `@q` 解析
  - `inline.ts` 生ソースに対するインライン走査(コード・数式・リンクの除外)
  - `blank.ts` 空欄(Matcher / 選択肢)の解析
  - `ids.ts` ID 生成と書き戻し(挿入位置はパース時に記録)
  - `grade.ts` / `decimal.ts` / `text.ts` 採点・10 進演算・正規化
  - `project.ts` `toPublic` / `toResult`
- ID 生成は `globalThis.crypto.getRandomValues`(CSPRNG)。テストでは決定的な生成器を注入
- 10 進演算は BigInt による必要最小限の実装(境界比較と丸めのみ)

## 画像アップロード

- エディタの「画像を追加」から PNG / JPEG / WebP / GIF をアップロード(1 枚 5MB・ブック合計 50MB)
- `sharp` で再エンコードして EXIF を除去し、長辺 4000px を超える画像は縮小
- ソースには `![地図](img:地図){width=320}` として挿入される(表示名は自動で一意化)
- 配信は認可付き API のみ: `/api/assets/[id]`(公開ブック)・`/api/s/[token]/assets/[id]`(共有)・`/api/attempts/[id]/assets/[id]`(受験中)・`/api/books/[id]/assets/[id]`(作者)
- 保存先は `UPLOAD_DIR`(既定 `./data/uploads`、git 管理外)。`/api/cron/expire` が孤児ファイルを回収

## セキュリティ・運用

- サーバ採点の正規表現は **RE2**(`re2`)で実行し、ReDoS を防ぎます(`apps/web/lib/regex.ts`)
- `/api/cron/expire` を cron で定期実行すると、放置受験の確定と孤児ファイルの回収が進みます。
  設定例は [`docs/operations.md`](./docs/operations.md)。cron が無くても、回答保存・提出・画面表示の時点で期限切れは確定します。

## 学習機能

- 受験履歴と学習統計(`/dashboard`、`/api/me/attempts`、`/api/me/stats`)
- ブックマーク(ブック単位・設問単位)
- 練習モードの即時採点(設問ごとの「答え合わせ」。正解・解説を表示して回答欄をロック。`practiceFeedback: true` のブックのみ)
- 受験の中断、essay の自己採点(提出後も変更可)、結果・復習画面
- 作者向け統計(受験数・平均正答率・設問別の正答率)

## ブック管理

- 保存履歴と復元(初版から履歴に残り、過去の版を新しい版として復元)
- フォーク(`allowFork` の公開ブックは誰でも複製可。画像も複製)
- 共同編集(ログイン ID で招待。編集可 / 閲覧のみ、`visibility=invite` はメンバー限定)
- 書き出し(`.qb` / JSON / ZIP)と ZIP 取り込み(本文 + 画像、上限つき)
- 保存せず診断だけ返す検証 API
- 公開範囲の変更には著作権確認(`copyrightConsent`)が必要。変更時は共有トークンを失効

## 通報・管理

- 公開ブックの「このブックを通報する」から通報(ログイン必須)
- `/admin`(admin ロールのみ):通報の処理、ブックの非公開化(進行中の受験を中断できる)、ユーザー停止、操作ログ
- 非公開化されたブックは、作者を含む全員が閲覧・受験・編集できない(管理者のみ可)
- 停止されたユーザーはログインも API 利用もできない(既存セッションは失効)
- すべての管理者操作は `AdminAuditLog` に記録される

管理者の付与は `pnpm admin:grant <loginId>`(解除は `--revoke`)。手順と運用フローは
[`docs/operations.md`](./docs/operations.md#4-管理者通報対応)。

## アカウント管理

- 登録時にリカバリーコードを 10 個発行(`XXXX-XXXX-XXXX`)。平文は表示時の 1 回だけ、DB には scrypt ハッシュを保存
- `/recover` でリカバリーコードによる再設定(成功で全セッション失効)
- `/settings` で表示名の変更・パスワード変更(他セッション失効)・リカバリーコード再発行・退会
- 退会時は認証情報を削除して `loginId` を解放し、所有ブックは論理削除、受験結果は匿名化して残す
- 管理者の一時パスワード: `pnpm user:passwd <loginId> <一時パスワード> --temp`(24 時間で失効、変更までブック作成を拒否)

## 共有の仕上げ

- `/b/<id>` などの共有ページに OGP / twitter:card / canonical を設定(`APP_URL` が基準)
- `/og.png` は `pnpm og:image` で再生成できる
- `/terms`(利用規約)・`/privacy`(プライバシー)・`/report-abuse`(通報フォーム)

## 本番運用

Ubuntu + nginx への配置手順は [`docs/deploy-ubuntu-nginx.md`](./docs/deploy-ubuntu-nginx.md) を参照。
定期実行・管理者対応・バックアップは [`docs/operations.md`](./docs/operations.md)。

## 次フェーズ(未実装)

1. `pg_bigm` への切り替え(現状は `pg_trgm`)、i18n、a11y 監査
2. 負荷試験、バックアップ復元の自動テスト
3. ブックごとの動的 OGP 画像(現在は共通の `/og.png`)
