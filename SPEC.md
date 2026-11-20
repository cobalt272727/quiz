# 問題ブック作成サイト 技術仕様書

## 1. 概要

テキストまたはファイルで「問題ブック」を定義して読み込ませると、見出し・本文・画像・表・自由記述空欄・選択肢空欄を自動生成し、ブラウザ上でテスト(回答・採点・復習)ができるWebサービス。ログインとブックの共有機能を持つ。

### 目標
- Markdown風の記法で問題を素早く書ける(学習者自身が作者になれる)
- 読み込み→即プレビュー→即テスト
- ブックの保存・共有・複製ができる
- 学習履歴(正答率・間違えた問題)の蓄積

### 非目標(初期版)
- 記述式の AI 自動採点(将来拡張)
- リアルタイム共同編集
- 課金機能

---

## 2. 技術スタック

| 層 | 採用 | 理由 |
|---|---|---|
| フロント | Next.js (App Router) + TypeScript + React | SSR/OGP(共有リンク)・単一言語 |
| UI | Tailwind CSS + shadcn/ui | 開発速度 |
| エディタ | CodeMirror 6 | 構文ハイライト・エラー波線表示 |
| パーサ | 自作 (unified/remark ベース) + Zod | AST化とスキーマ検証 |
| 数式 | KaTeX | 軽量 |
| バックエンド | Next.js Route Handlers (REST) | 構成簡素化 |
| DB | PostgreSQL + Prisma | リレーション・JSONB |
| 認証 | ID + パスワードのみ(Auth.js Credentials + Argon2id、セッションは DB 保存の HttpOnly Cookie) | 外部ログイン・メール認証は使わない |
| 画像保存 | サーバのローカルディレクトリ(`UPLOAD_DIR`)。配信は認可付き API 経由 | |
| ホスティング | 自前サーバ/VPS + Docker(Node.js + PostgreSQL)、`UPLOAD_DIR` はボリュームマウント | ローカルディスク利用のため Vercel 等のサーバレスは不可 |
| テスト | Vitest(パーサ)、Playwright(E2E) | |

---

## 3. 機能要件

### 3.1 ブック作成・読み込み
- 入力方法: ①エディタに直接記述 ②貼り付け ③ファイルアップロード(`.qb`/`.md`/`.txt`/`.json`/`.yaml`) ④ZIP(本文+画像一式)
- 入力中にライブプレビュー(右ペイン)とエラー一覧(行番号付き)
- 書き出し: テキスト(.qb)、JSON、ZIP(画像同梱)、印刷用PDF(ブラウザ印刷CSS)

### 3.2 ブロック要素
| 要素 | 内容 |
|---|---|
| 見出し | 章・節タイトル(h1〜h3) |
| 本文 | Markdown(太字、リスト、リンク、コード、KaTeX数式) |
| 画像 | アップロード画像または URL、キャプション、サイズ指定 |
| 表 | Markdown表。セル内に空欄を埋め込み可能 |
| 自由記述空欄 | 文中に埋め込む穴埋め。複数の許容解答、正規表現、数値許容誤差 |
| 選択肢空欄 | 文中ドロップダウン、または設問形式のラジオ/チェックボックス |
| 記述問題 | 長文回答(自己採点、模範解答表示) |
| 解説 | 回答後に表示 |

### 3.3 テスト機能
- モード: 練習(即時採点・解説)/ 本番(最後に一括採点)/ 復習(間違えた問題のみ)
- オプション: 出題順シャッフル、選択肢シャッフル、制限時間、章の絞り込み、問題数指定
- 採点: 空欄ごとの部分点、配点指定可
- 結果画面: 総合得点、章別正答率、誤答一覧、解説
- 回答の途中保存・再開(ログイン時はサーバ、未ログインは localStorage)

### 3.4 アカウント
- サインアップ/ログインは **ログインID + パスワードのみ**(メール・SNS ログインなし)
  - ログインID: 3〜32文字、英数字と `_` `-`、大文字小文字を区別せず一意
  - パスワード: 8〜128文字、Argon2id でハッシュ化して保存。よくある弱いパスワードは拒否
  - メールを持たないためパスワード再設定は不可。代替として ①登録時に表示するリカバリーコード(10個、1回限り)で再設定 ②管理者による一時パスワード発行 を提供
  - パスワード変更(現パスワード必須)、変更時に他セッションを失効
  - ログイン失敗が連続した場合は一時ロック(ID+IP 単位で段階的に待機)
- プロフィール(表示名)、アカウント削除(パスワード再入力のうえ全データ削除)
- 未ログインでも「ゲスト受験」は可能(共有リンクの公開ブックのみ、履歴は端末保存)

### 3.5 共有
| 公開範囲 | 説明 |
|---|---|
| private | 作者のみ |
| link | 「リンクを知っている人」(推測困難なトークン付きURL) |
| public | 公開ライブラリに掲載・検索可能 |
| invite | 指定ユーザー(ログインID)に閲覧/編集権限を付与 |

- 権限ロール: `owner` / `editor` / `viewer`(受験のみ)
- 複製(フォーク): 閲覧可能なブックを自分のアカウントにコピー(元作者クレジット保持)
- 共有リンクは再発行・無効化可能。OGP用のタイトル・説明を自動生成(link 公開では画像は含めない)
- 回答の結果共有(任意): 点数のみのリンクを発行
- 作者向け統計: 受験回数、問題別正答率(個人は特定せず匿名集計)
- 通報機能・管理者による非公開化

---

## 4. 問題ブック記法(QB Markup)

Markdown拡張。1ファイル=1ブック。先頭に YAML フロントマターを置く。

### 4.1 例
````markdown
---
title: 日本史 基礎
description: 古代〜中世
tags: [history, japan]
lang: ja
timeLimit: 600          # 秒(任意)
shuffle: { questions: true, choices: true }
---

# 第1章 古代

## 1-1 飛鳥時代

聖徳太子は **{{603}}** 年に冠位十二階を制定した。

@q id=q1 points=2
聖徳太子が制定した憲法を答えよ。
[[十七条憲法 | 十七条の憲法 | 17条憲法]]
@explain
604年に制定された。
@end

@q id=q2
冠位十二階が定められたのは [[?603 | 593 | 645 | 701]] 年である。
@end

![法隆寺](img:horyuji.jpg){width=400}

| 時代 | 人物 | 出来事 |
|------|------|--------|
| 飛鳥 | [[蘇我馬子]] | 仏教導入 |
| 奈良 | [[聖武天皇]] | [[?大仏造立 | 平安遷都 | 承久の乱]] |

@q type=multi id=q3
次のうち室町時代のものをすべて選べ。
- [x] 勘合貿易
- [ ] 墾田永年私財法
- [x] 応仁の乱
@explain
墾田永年私財法は奈良時代。
@end
````

### 4.2 構文一覧

| 構文 | 意味 |
|---|---|
| `---` YAML `---` | ブックのメタ情報 |
| `#` `##` `###` | 見出し(章・節。章で出題範囲を絞込) |
| 通常の Markdown | 本文 |
| `![alt](img:name){width=..}` | 画像。`img:` はブック内アセット、`http(s)://` も可 |
| Markdown 表 | 表。セル内に空欄可 |
| `[[答1 \| 答2]]` | 自由記述空欄。`\|` 区切りは許容解答 |
| `[[/正規表現/]]` | 正規表現で判定 |
| `[[=3.14 ±0.01]]` | 数値(許容誤差) |
| `[[?正解 \| 誤1 \| 誤2]]` | 選択肢空欄(先頭 `?` 付きが正解、ドロップダウン表示) |
| `{{答}}` | 本文中の強調的な穴埋めの別記法(`[[ ]]` と同義) |
| `@q ... @end` | 設問ブロック(属性: id, type, points, tags) |
| `@explain` | 解説(設問ブロック内) |
| `@hint` | ヒント |
| `- [x]` / `- [ ]` | 選択肢リスト(`single`/`multi`) |
| `$...$` / `$$...$$` | 数式 |
| `\[[` | 空欄記号のエスケープ |

### 4.3 設問タイプ(`@q type=`)
`blank`(既定。ブロック内の空欄を採点)/ `single`(単一選択)/ `multi`(複数選択)/ `essay`(自己採点)/ `truefalse`

`@q` に包まれない `[[ ]]` は自動的に1問として扱う(単独設問の ID は位置から自動採番)。

### 4.4 JSON/YAML 形式
同一内容を構造化形式でも読み込める。内部 AST の JSON と同じスキーマ(§5)。テキスト形式は読み込み時に AST に変換される。

### 4.5 採点ルール(自由記述)
- 既定の正規化: 前後空白除去、全角/半角統一(NFKC)、英字大文字小文字無視
- ひらがな/カタカナ同一視はオプション `normalize.kana: true`
- 空欄ごとに `[[答 \| 別解]]` のいずれか一致で正解
- 数値空欄: 全角数字・カンマ除去後に数値比較

---

## 5. 内部データモデル

### 5.1 AST (TypeScript / Zod)
```ts
type Book = { meta: Meta; assets: Asset[]; blocks: Block[] };

type Block =
  | { type: "heading"; level: 1|2|3; text: string; id: string }
  | { type: "markdown"; source: string }
  | { type: "image"; assetId: string; alt: string; width?: number }
  | { type: "table"; header: Inline[][]; rows: Inline[][][] }
  | { type: "question"; id: string; kind: QKind; points: number;
      body: Inline[]; choices?: Choice[]; explain?: string; hint?: string };

type Inline =
  | { t: "text"; v: string }
  | { t: "blank"; id: string; answers: Matcher[] }       // 自由記述
  | { t: "choiceBlank"; id: string; options: string[]; correct: number[] };

type Matcher =
  | { kind: "exact"; v: string }
  | { kind: "regex"; pattern: string; flags?: string }
  | { kind: "number"; v: number; tol?: number };
```
### 5.2 パーサ処理
1. フロントマター抽出・検証
2. remark で Markdown → mdast
3. カスタムプラグインで `[[ ]]` `@q` を AST ノード化
4. ID 補完・重複チェック・参照アセット解決
5. 診断リスト(`error`/`warning`, 行・列, メッセージ)を返却
パーサは共有パッケージ(`packages/qb-parser`)としてクライアント(プレビュー)とサーバ(保存時検証)で同一コードを使う。

---

## 6. DB 設計(PostgreSQL)

```
User(id, loginId UNIQUE(lower), passwordHash, name, role, failedCount,
     lockedUntil, createdAt)
Session(id, userId, tokenHash, expiresAt, userAgent, createdAt)
RecoveryCode(id, userId, codeHash, usedAt)

Book(id, ownerId→User, title, description, tags[], visibility
     enum(private,link,public,invite), shareToken, source TEXT,
     ast JSONB, version INT, forkedFromId→Book?, createdAt, updatedAt)
BookVersion(id, bookId, version, source, createdAt)   -- 履歴(直近50件)
BookMember(bookId, userId, role enum(editor,viewer))
Asset(id, bookId, name, mime, size, storageKey, width, height)
  -- storageKey = ディレクトリ内の相対パス(例: books/{bookId}/{uuid}.webp)。ユーザー入力のファイル名は使わない

Attempt(id, bookId, bookVersion, userId?, guestId?, mode, startedAt,
        finishedAt, score, maxScore, settings JSONB)
Answer(id, attemptId, questionId, blankId, value JSONB, correct BOOL, points)
Bookmark(userId, bookId, questionId?)      -- お気に入り・要復習
ShareResult(id, attemptId, token)
Report(id, bookId, reporterId, reason, status)
```
索引: `Book(ownerId)`, `Book(visibility, updatedAt)`, 全文検索用 `GIN(to_tsvector(title||description))`(日本語は pg_bigm または trigram)。

---

## 7. API(REST, `/api`)

| メソッド | パス | 内容 |
|---|---|---|
| POST | `/books` | 作成(source を受け取り検証・AST化) |
| GET | `/books?mine=1&q=&tag=` | 一覧・検索 |
| GET/PUT/DELETE | `/books/:id` | 取得・更新・削除 |
| POST | `/books/:id/fork` | 複製 |
| POST | `/books/validate` | 保存せず診断のみ |
| POST | `/books/:id/assets` | 画像アップロード(multipart、サーバが検証してディレクトリへ保存) |
| GET | `/assets/:id` | 画像配信(ブックの閲覧権限を確認して返却) |
| POST | `/auth/signup` `/auth/login` `/auth/logout` | ID+パスワード認証 |
| POST | `/auth/recover` | リカバリーコードによるパスワード再設定 |
| POST | `/me/password` | パスワード変更 |
| PUT | `/books/:id/share` | 公開範囲変更・トークン再発行 |
| POST/DELETE | `/books/:id/members` | メンバー追加(ログインID指定)・削除 |
| GET | `/s/:token` | 共有リンクからの取得 |
| POST | `/books/:id/attempts` | 受験開始(出題セット生成) |
| PATCH | `/attempts/:id` | 回答の途中保存 |
| POST | `/attempts/:id/submit` | 提出・採点 |
| GET | `/me/stats` | 学習統計 |
| POST | `/reports` | 通報 |

- **正解の秘匿**: 受験用に配信するブックデータは正解(answers/correct)を除去したものとし、採点はサーバで行う。ただし練習モードの即時採点は作者設定で許可する場合のみ正解を配信。ゲストの localStorage 受験でも同様に `/attempts/:id/submit` を使う。
- 認可: 全APIでロール判定(`owner>editor>viewer`、`link` は有効トークン保持者を viewer 扱い)。

---

## 8. 画面構成

| パス | 画面 |
|---|---|
| `/` | LP・公開ライブラリ検索 |
| `/login` `/signup` | ログイン・新規登録(ID+パスワード) |
| `/dashboard` | マイブック、共有されたブック、学習履歴 |
| `/books/new` | 新規作成(テキスト貼付/ファイル/ZIP/テンプレート) |
| `/books/:id/edit` | エディタ(左:ソース、右:プレビュー、下:診断) |
| `/books/:id` | ブック詳細(概要、受験設定、共有ボタン) |
| `/books/:id/play/:attemptId` | テスト画面 |
| `/attempts/:id/result` | 結果・復習 |
| `/s/:token` | 共有リンク入口 |
| `/settings` | アカウント設定 |
| `/docs/syntax` | 記法リファレンス・サンプル |

UI要件: レスポンシブ(スマホ受験優先)、ダークモード、キーボード操作(Tab で空欄移動、Enter で次問)、a11y(WCAG AA、ラベル・フォーカス)、日本語/英語 i18n。

---

## 9. セキュリティ・非機能要件

- XSS: Markdown は HTML 無効で変換し、出力を DOMPurify/rehype-sanitize で浄化。リンクは `rel="noopener noreferrer"`
- 画像(ローカルディレクトリ保存):
  - 保存先は `UPLOAD_DIR`(Web 公開ディレクトリの外に置き、静的配信しない)。配信は `/assets/:id` 経由で権限確認、`Cache-Control: private`
  - ファイル名は UUID で生成、パストラバーサル対策(解決後のパスが `UPLOAD_DIR` 配下か検証)
  - マジックナンバーでMIME検証(png/jpeg/webp/gif)、サイズ(5MB/枚、ブック合計50MB)、SVG は拒否、再エンコードで EXIF 除去
  - ブック削除・アカウント削除時にディレクトリ内ファイルも削除。DB と実ファイルの孤児を掃除する定期ジョブ
  - フォーク時は画像ファイルを複製(元の削除の影響を受けない)
- 正規表現: ReDoS 対策(パターン長制限、`re2` 利用またはタイムアウト実行)
- CSRF: SameSite=Lax + CSRF トークン、API は Origin 検証
- セッション: HttpOnly・Secure Cookie、トークンは DB にハッシュで保存、有効期限30日(操作で延長)
- パスワード: Argon2id、ログに出力しない、ユーザー列挙対策としてログイン失敗メッセージは統一
- レート制限: ログイン・登録・リカバリー・作成・採点API(IP+ユーザー単位)
- 共有トークン: 128bit 以上の乱数、`link` 公開時のみ有効、`noindex`
- 入力上限: ソース 1MB、1ブック最大2000問
- プライバシー: 個人回答は作者に非公開(匿名集計のみ)。アカウント削除で関連データ消去
- 性能: パース+プレビュー 1000問で 200ms 以内(Web Worker 実行、デバウンス300ms)、LCP 2.5s 以内
- バックアップ: DB 日次ダンプ + `UPLOAD_DIR` の日次差分バックアップ(rsync 等)
- 監視: Sentry、構造化ログ

---

## 10. ディレクトリ構成(モノレポ)

```
/apps/web            Next.js アプリ
/packages/qb-parser  記法パーサ・AST型・採点ロジック(単体テスト重視)
/packages/ui         共通UI
/prisma              schema.prisma, migrations
/data/uploads        画像保存ディレクトリ(既定。UPLOAD_DIR で変更、git管理外)
/docs                記法ドキュメント、サンプルブック
```

---

## 11. 開発フェーズ

1. **MVP (2〜3週)**: qb-parser(見出し/本文/空欄/選択肢)、貼付読み込み、プレビュー、受験・採点、localStorage 保存
2. **アカウント (1〜2週)**: ID/パスワード認証・リカバリーコード、ブック保存・一覧、履歴、サーバ採点
3. **リッチ要素 (1〜2週)**: 画像アップロード(ローカル保存)・ZIP、表内空欄、数式、複数選択、エクスポート
4. **共有 (1〜2週)**: リンク共有、招待、フォーク、公開ライブラリ、OGP
5. **仕上げ**: 統計、通報/管理、i18n、a11y、E2E、負荷試験

## 12. テスト方針
- パーサ: 記法ごとのゴールデンテスト、不正入力のファズ(診断が出てクラッシュしない)
- 採点: 正規化・正規表現・数値誤差の境界値
- E2E(Playwright): 読込→受験→結果、共有リンク権限、フォーク、未ログイン制限
- 認可テスト: ロール×API のマトリクス

## 13. 将来拡張
AI による問題自動生成(PDF/ノート→ブック)、記述の AI 採点、間隔反復(SRS)による復習スケジューリング、チーム/クラス機能、PWA オフライン受験、音声・動画問題。
