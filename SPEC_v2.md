# 問題ブック作成サイト 技術仕様書(改訂版 v0.2)

## 0. 改訂履歴(v0.1 → v0.2)

### 主な変更
| # | 変更内容 | 関連節 |
|---|---|---|
| 1 | 表内の `[[ ]]` と `|` の衝突を解消(エスケープ規則を確定、診断コード追加) | 4.7 |
| 2 | 設問・空欄IDを「位置から自動採番」から「保存時に確定IDを書き戻す」方式へ変更 | 4.6 |
| 3 | AST を拡張(インライン書式・数式、設問本文を `Block[]` 化、`Choice`/`Meta` 等の型定義) | 5.1 |
| 4 | 配点・部分点・複数選択・自己採点・`truefalse`・単独空欄の設問化ルールを定義 | 4.3, 4.5 |
| 5 | `{{答}}` 記法を廃止(`[[答]]` に一本化) | 4.2 |
| 6 | 認証: Auth.js をやめ、薄い自前セッション層を採用 | 2, 3.4, 9 |
| 7 | 正規表現: RE2 互換サブセットに制限し、クライアント/サーバで挙動を一致 | 4.5, 9 |
| 8 | 画像配信: 共有リンク経由のゲスト閲覧に対応(`/s/:token/assets/:id`)、外部画像は既定で禁止 | 7, 9 |
| 9 | 即時採点API(`/attempts/:id/check`)、ゲスト受験の認可、サーバ側タイマー検証を追加 | 3.3, 7 |
| 10 | ZIP取り込みの安全対策、不足していたAPIの追加、公開物の権利侵害対応、見積り見直し | 7, 9, 11 |
| 11 | YAML入力は初期版から除外(将来拡張へ) | 3.1, 13 |

### 仮決定(要レビュー)
実装前に確認してほしい、改訂時に置いた仮の決定です。

- 表内の空欄は**行単位で1問**として扱う(表全体を1問にしたい場合は `@q` で囲む)
- `{{ }}` 記法は廃止し、予約済み(使用するとエラー)とする
- 認証は Auth.js を使わず自前セッション層とする
- 外部画像URLは既定で禁止(サイト設定で許可可能)
- 複数選択の既定採点は「完全一致のみ正解」(`scoring=partial` で部分点)

---

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
| 正規表現 | サーバ: `re2`(node-re2)。パーサ側で RE2 互換サブセットを検証 | ReDoS 対策、クライアント/サーバ間の挙動差を防ぐ |
| 画像処理 | `sharp`(再エンコード・EXIF除去・サイズ取得) | |
| バックエンド | Next.js Route Handlers (REST) | 構成簡素化 |
| DB | PostgreSQL + Prisma | リレーション・JSONB |
| 認証 | ID + パスワードのみ。自前の薄いセッション層(Argon2id、256bit乱数のセッショントークンを DB にハッシュ保存、HttpOnly Cookie) | 外部ログイン・メール認証は使わない。Auth.js の Credentials は DB セッションとの併用が標準では想定されておらず、ロック・リカバリーコードも自前実装になるため。実装時にライブラリの最新状況を再確認する |
| 画像保存 | サーバのローカルディレクトリ(`UPLOAD_DIR`)。配信は認可付き API 経由 | |
| ホスティング | 自前サーバ/VPS + Docker(Node.js + PostgreSQL)、`UPLOAD_DIR` はボリュームマウント | ローカルディスク利用のため Vercel 等のサーバレスは不可 |
| テスト | Vitest(パーサ)、Playwright(E2E) | |

---

## 3. 機能要件

### 3.1 ブック作成・読み込み
- 入力方法: ①エディタに直接記述 ②貼り付け ③ファイルアップロード(`.qb`/`.md`/`.txt`/`.json`) ④ZIP(本文+画像一式)
  - YAML 形式の入力は初期版では対応しない(§13)
  - ZIP は §9 の取り込み制限に従う
- 入力中にライブプレビュー(右ペイン)とエラー一覧(行番号付き)
- 書き出し: テキスト(.qb)、JSON、ZIP(画像同梱)、印刷用PDF(ブラウザ印刷CSS)

### 3.2 ブロック要素
| 要素 | 内容 |
|---|---|
| 見出し | 章・節タイトル(h1〜h3) |
| 本文 | Markdown(太字、リスト、リンク、コード、KaTeX数式) |
| 画像 | アップロード画像(外部URLは既定で不可、§9)、キャプション、サイズ指定 |
| 表 | Markdown表。セル内に書式・数式・空欄を埋め込み可能 |
| 自由記述空欄 | 文中に埋め込む穴埋め。複数の許容解答、正規表現、数値許容誤差 |
| 選択肢空欄 | 文中ドロップダウン、または設問形式のラジオ/チェックボックス |
| 記述問題 | 長文回答(自己採点、模範解答表示) |
| 解説 | 回答後に表示 |

### 3.3 テスト機能
- モード: 練習(即時採点・解説)/ 本番(最後に一括採点)/ 復習(間違えた問題のみ)
  - 練習モードの即時採点は、作者が `practiceFeedback: true` を設定したブックのみ(§7 `/attempts/:id/check`)
- オプション: 出題順シャッフル、選択肢シャッフル、制限時間、章の絞り込み、問題数指定
- 採点: 空欄ごとの部分点、配点指定可(規則は §4.5)
- 結果画面: 総合得点、章別正答率、誤答一覧、解説
- 回答の途中保存・再開(ログイン時はサーバ、ゲストは localStorage に回答ドラフトと attemptId のみ保持し、採点はサーバ)
  - 出題セット・出題順・シャッフルの seed は `Attempt.settings` に保存し、再開時に再現する
- 制限時間はサーバが `deadlineAt = startedAt + timeLimit` で管理する(§7)

### 3.4 アカウント
- サインアップ/ログインは **ログインID + パスワードのみ**(メール・SNS ログインなし)
  - ログインID: 3〜32文字、英数字と `_` `-`、大文字小文字を区別せず一意
  - パスワード: 8〜128文字、Argon2id でハッシュ化して保存。よくある弱いパスワードは拒否
  - メールを持たないためパスワード再設定は不可。代替として ①登録時に表示するリカバリーコード(10個、1回限り)で再設定 ②管理者による一時パスワード発行 を提供
    - リカバリーコードは登録直後に「保存しました」の確認を必須とし、再生成(旧コード全失効)も設定画面から可能
  - パスワード変更(現パスワード必須)、変更時に他セッションを失効
  - ログイン失敗が連続した場合は一時ロック(ID+IP 単位で段階的に待機)
- プロフィール(表示名)、アカウント削除(パスワード再入力のうえ全データ削除)
- 未ログインでも「ゲスト受験」は可能(`link` / `public` のブックのみ、履歴は端末保存)

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
- `public` / `link` へ変更する際は「第三者の著作物を無断で含めていない」ことへの同意を必須とする(§9 権利侵害対応)

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
practiceFeedback: true  # 練習モードの即時採点を許可(既定 false)
shuffle: { questions: true, choices: true }
---

# 第1章 古代

## 1-1 飛鳥時代

聖徳太子は **[[603]]{id=b_a1c9x2}** 年に冠位十二階を制定した。

@q id=q_k3m9p1 points=2
聖徳太子が制定した憲法を答えよ。
[[十七条憲法 | 十七条の憲法 | 17条憲法]]
@explain
604年に制定された。
@end

@q id=q_t7w2d5
冠位十二階が定められたのは [[?603 | 593 | 645 | 701]] 年である。
@end

![法隆寺](img:horyuji.jpg){width=400}

| 時代 | 人物 | 出来事 |
|------|------|--------|
| 飛鳥 | [[蘇我馬子]] | 仏教導入 |
| 奈良 | [[聖武天皇]] | [[?大仏造立 \| 平安遷都 \| 承久の乱]] |

@q type=multi id=q_h4n8c3
次のうち室町時代のものをすべて選べ。
- [x] 勘合貿易
- [ ] 墾田永年私財法
- [x] 応仁の乱
@explain
墾田永年私財法は奈良時代。
@end

@q type=truefalse answer=false id=q_r2v6f8
冠位十二階は 604 年に制定された。
@explain
冠位十二階は 603 年。604 年は十七条憲法。
@end
````

- `{id=...}` はエディタの保存時に自動付与される(§4.6)。手書きで省略してもよい。
- 表の例は、1行目が「1問・1空欄」、2行目が「1問・2空欄」として扱われる(§4.3)。表内の `|` は `\|` と書く(§4.7)。

### 4.2 構文一覧

| 構文 | 意味 |
|---|---|
| `---` YAML `---` | ブックのメタ情報 |
| `#` `##` `###` | 見出し(章・節。章で出題範囲を絞込) |
| 通常の Markdown | 本文 |
| `![alt](img:name){width=..}` | 画像。`img:` はブック内アセット。`https://` 外部画像は既定で不可(§9) |
| Markdown 表 | 表。セル内に空欄・書式・数式可 |
| `[[答1 \| 答2]]` | 自由記述空欄。`|` 区切りは許容解答 |
| `[[/正規表現/]]` | 正規表現で判定(RE2互換サブセット、§4.5) |
| `[[=3.14 ±0.01]]` | 数値(許容誤差) |
| `[[?正解 \| 誤1 \| 誤2]]` | 選択肢空欄(先頭 `?` 付きが正解、ドロップダウン表示) |
| `[[...]]{id=.. w=..}` | 空欄への属性(`id`: 空欄ID、`w`: 配点の重み、既定 1) |
| `@q ... @end` | 設問ブロック(属性: id, type, points, tags, scoring, answer) |
| `@explain` | 解説(設問ブロック内) |
| `@hint` | ヒント(設問ブロック内) |
| `@model` | 模範解答(`essay` のみ) |
| `- [x]` / `- [ ]` | 選択肢リスト(`single`/`multi`) |
| `$...$` / `$$...$$` | 数式 |
| `\[[` | 空欄記号のエスケープ |
| `&vert;` | 解答文字列中の `|` そのもの(§4.7) |

※この表内の `\|` は、仕様書の表を壊さないためのエスケープ。本文中では、区切りは単に `|` と書く(表セル内の書き方は §4.7)。

**廃止**: v0.1 の `{{答}}` は廃止した。使用するとエラー `QB-E006`(「`[[答]]` を使ってください」)を返す。

### 4.3 設問タイプ(`@q type=`)
`blank`(既定。ブロック内の空欄を採点)/ `single`(単一選択)/ `multi`(複数選択)/ `essay`(自己採点)/ `truefalse`

- `truefalse` は `@q type=truefalse answer=true|false` と書く(選択肢リストは不要。UIは「正/誤」の2択)
- `@q` 内には、段落・リスト・表・画像・数式など任意のブロックを含められる

**`@q` に包まれない空欄の扱い**:
- 段落・リスト項目・**表の行**ごとに、その中の空欄をまとめて1問(複数空欄は部分点)として扱う
- 1つのブロックに空欄が複数あっても1問。複数の問題に分けたい場合は `@q` で明示する
- 表全体を1問にしたい場合は、表を `@q ... @end` で囲む
- 自動設問の `points` は 1。IDは §4.6 に従う

### 4.4 JSON 形式
同一内容を構造化形式(JSON)でも読み込める。内部 AST の JSON と同じスキーマ(§5)。テキスト形式は読み込み時に AST に変換される。YAML 形式は将来拡張(§13)。

### 4.5 採点ルール

**正規化(自由記述)**
- 既定の正規化: 前後空白除去、全角/半角統一(NFKC)、英字大文字小文字無視
- ひらがな/カタカナ同一視はオプション `normalize.kana: true`
- 空欄ごとに `[[答 | 別解]]` のいずれか一致で正解
- 数値空欄: 全角数字・カンマ除去後に数値比較

**正規表現**
- RE2 互換サブセットのみ許可(後方参照・先読み/後読みは不可)。パーサが保存時に検証し、違反は `QB-E004`
- パターン長 ≤ 200文字、フラグは `i` のみ、判定対象は正規化後の入力(長さ ≤ 500文字)
- 判定は完全一致(内部的に `^(?:パターン)$`)

**配点**
- 設問の `points`(既定 1)を、空欄の重み `w`(既定 1)の比で按分する
  - 部分点 = `points × (正解した空欄の重み合計 / 全空欄の重み合計)`
- `single` / `truefalse`: 正解で満点、不正解で 0
- `multi`: 既定 `scoring=all`(選択がすべて正しい場合のみ満点)。`scoring=partial` なら `max(0, 正しく選んだ数 − 誤って選んだ数) / 正解数 × points`
- `essay`: 模範解答表示後に自己採点(◯=満点 / △=半分 / ✕=0)。自己申告であるため、結果画面で「自己採点」と明示する
- 小数点以下は内部では 2 桁まで保持し、表示時に必要なら丸める

### 4.6 ID ルール(設問・空欄)
- 設問ID・空欄IDは**不変の識別子**とし、回答履歴・統計・復習は ID で紐づける
- 未指定の設問・空欄には、保存時(エディタの保存・API の保存・ZIP取り込み)に短いランダムID(例: `q_k3m9p1`、`b_a1c9x2`)を**ソースへ書き戻して**確定する
  - 設問: `@q id=...`、`@q` に包まれない空欄: `[[...]]{id=...}`
- 編集中の未確定IDは警告 `QB-W001`(保存時に自動付与)
- ブック内で重複するIDは `QB-E001`
- 設問を並び替え・移動してもIDは変わらない。IDを削除した場合は新しい問題として扱う
- 問題の正解定義(答・選択肢の正誤)が変更された場合、変更前後の履歴を混ぜないよう、統計は**ブックバージョン単位**で保持し、作者が統計画面で「統合」「リセット」を選べる

### 4.7 表内の空欄とエスケープ
Markdown 表(GFM)ではセル区切りの `|` が先に解釈されるため、表の中の `[[ ]]` では区切りの `|` を `\|` と書く。

```
| 奈良 | [[聖武天皇]] | [[?大仏造立 \| 平安遷都 \| 承久の乱]] |
```

- 処理順: ①GFM としてセル分割(このとき `\|` は `|` に戻る)→ ②各セルに対して空欄パーサを適用
- 解答文字列に `|` そのものを含めたい場合は、本文・表のどちらでも `&vert;` と書く(HTML 実体参照としては処理しない。空欄パーサ専用)
- 表内に未エスケープの `|` を含む `[[` が閉じない場合は、セル数の不一致とあわせて `QB-E003`(「表内の `[[ ]]` では `|` を `\|` と書いてください」)を表示する

---

## 5. 内部データモデル

### 5.1 AST (TypeScript / Zod)
```ts
type Book = { astVersion: number; meta: Meta; assets: Asset[]; blocks: Block[] };

type Meta = {
  title: string; description?: string; tags: string[]; lang: "ja" | "en";
  timeLimit?: number;                         // 秒
  shuffle: { questions: boolean; choices: boolean };
  normalize: { kana: boolean };
  practiceFeedback: boolean;                  // 練習モードの即時採点を許可(既定 false)
};
type Asset = { id: string; name: string; mime: string; width?: number; height?: number };
type QKind = "blank" | "single" | "multi" | "essay" | "truefalse";

type Block =
  | { type: "heading"; level: 1|2|3; text: string; id: string }
  | { type: "paragraph"; c: Inline[] }
  | { type: "list"; ordered: boolean; items: Block[][] }
  | { type: "code"; lang?: string; v: string }
  | { type: "math"; v: string }                                  // $$...$$
  | { type: "image"; assetId?: string; src?: string; alt: string; caption?: string; width?: number }
  | { type: "table"; header: Inline[][]; rows: Inline[][][] }    // 行 → セル → Inline[]
  | { type: "question"; id: string; kind: QKind; points: number; tags: string[];
      auto: boolean;                                             // @q なしで自動生成された設問
      body: Block[];                                             // 段落・表・画像など
      choices?: Choice[];                                        // single / multi
      answer?: boolean;                                          // truefalse
      scoring?: "all" | "partial";                               // multi
      model?: Block[];                                           // essay の模範解答
      explain?: Block[]; hint?: Block[] };

type Choice = { id: string; label: Inline[]; correct: boolean };

type Inline =
  | { t: "text"; v: string }
  | { t: "strong" | "em"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "math"; v: string }
  | { t: "link"; href: string; c: Inline[] }
  | { t: "blank"; id: string; weight: number; answers: Matcher[] }                    // 自由記述
  | { t: "choiceBlank"; id: string; weight: number; options: string[]; correct: number[] };

type Matcher =
  | { kind: "exact"; v: string }
  | { kind: "regex"; pattern: string; flags?: "i" }
  | { kind: "number"; v: number; tol?: number };
```

Markdown の生ソース(旧 `markdown` ブロックの `source: string`)は AST に持たない。パース時に構造化し、HTML は一切通さない(XSS 対策の第一段)。

### 5.2 パーサ処理
1. フロントマター抽出・検証
2. 表を含む Markdown ブロックを remark(GFM)で mdast 化
3. カスタムプラグインで `[[ ]]` `@q` `{id=..}` を AST ノード化(表は §4.7 の順序で処理)
4. 自動設問の生成(§4.3)、ID 補完・重複チェック(§4.6)、参照アセット解決
5. 正規表現の RE2 互換検証、`{{ }}` の検出
6. 診断リスト(`error`/`warning`, 診断コード, 行・列, メッセージ)を返却

パーサは共有パッケージ(`packages/qb-parser`)としてクライアント(プレビュー)とサーバ(保存時検証)で同一コードを使う。

**主な診断コード**
| コード | 内容 |
|---|---|
| QB-E001 | ID の重複 |
| QB-E002 | `[[` / `@q` が閉じていない |
| QB-E003 | 表内で未エスケープの `|` |
| QB-E004 | RE2 互換でない正規表現 / 長さ超過 |
| QB-E005 | 参照している画像が解決できない |
| QB-E006 | 廃止記法 `{{ }}` の使用 |
| QB-W001 | ID 未付与(保存時に自動付与) |
| QB-W002 | 外部画像の使用(許可設定時) |

### 5.3 受験用の公開射影(正解の除去)
`toPublic(book)` を `qb-parser` に置き、受験者へ配信するデータは必ずこの関数を通す。

- `blank`: `answers`(Matcher)を削除。UI のために入力種別(`text` / `number`)のみ残す
- `choiceBlank`: `correct` を削除。選択肢の順序は `Attempt.settings.seed` で決定
- `Choice.correct` / `answer` / `model` / `explain` を削除(`hint` は配信する)
- `explain` と `model` は、`/attempts/:id/check`(許可時)・`/submit`・結果画面でのみ返す

---

## 6. DB 設計(PostgreSQL)

```
User(id, loginId UNIQUE(lower), passwordHash, name, role enum(user,admin),
     failedCount, lockedUntil, createdAt)
Session(id, userId, tokenHash, expiresAt, userAgent, createdAt)
RecoveryCode(id, userId, codeHash, usedAt)

Book(id, ownerId→User, title, description, tags[], visibility
     enum(private,link,public,invite), shareToken, source TEXT,
     ast JSONB, astVersion INT, parserVersion TEXT, version INT,
     hiddenByAdmin BOOL, forkedFromId→Book?, createdAt, updatedAt)
BookVersion(id, bookId, version, source, parserVersion, createdAt)   -- 履歴(直近50件)
BookMember(bookId, userId, role enum(editor,viewer))
Asset(id, bookId, name, mime, size, storageKey, width, height)
  -- storageKey = ディレクトリ内の相対パス(例: books/{bookId}/{uuid}.webp)。ユーザー入力のファイル名は使わない

Attempt(id, bookId, bookVersion, userId?, guestId?, guestTokenHash?, mode,
        startedAt, deadlineAt?, finishedAt, score NUMERIC(8,2), maxScore NUMERIC(8,2),
        settings JSONB)      -- settings: seed, 出題セット・順序、オプション
Answer(id, attemptId, questionId, blankId, value JSONB, correct BOOL,
       points NUMERIC(6,2), selfGraded BOOL)
Bookmark(userId, bookId, questionId?)      -- お気に入り・要復習
ShareResult(id, attemptId, token)
Report(id, bookId, reporterId, reason, status, createdAt, resolvedAt)
```

- 索引: `Book(ownerId)`, `Book(visibility, updatedAt)`, 全文検索用 `GIN(to_tsvector(title||description))`
  - 日本語検索は `pg_bigm` を第一候補とし、Docker イメージに拡張を同梱する。難しい場合は `pg_trgm` で代替
- `Answer.questionId` / `blankId` は §4.6 の不変IDを使う
- `parserVersion` / `astVersion`: パーサ更新で解釈が変わっても、過去バージョンの再パース結果を区別できるようにする。保存時に `source` から `ast` を再生成して整合を保つ

---

## 7. API(REST, `/api`)

### ブック・アセット
| メソッド | パス | 内容 |
|---|---|---|
| POST | `/books` | 作成(source を受け取り検証・AST化・ID書き戻し) |
| GET | `/books?mine=1&q=&tag=` | 一覧・検索 |
| GET/PUT/DELETE | `/books/:id` | 取得・更新・削除 |
| POST | `/books/:id/fork` | 複製(画像も複製) |
| POST | `/books/validate` | 保存せず診断のみ |
| GET | `/books/:id/export?format=qb\|json\|zip` | 書き出し |
| POST | `/books/:id/assets` | 画像アップロード(multipart、サーバが検証してディレクトリへ保存) |
| GET | `/assets/:id` | 画像配信(ログイン済みユーザー。ブックの閲覧権限を確認) |
| GET | `/s/:token/assets/:id` | 画像配信(共有リンク経由。トークンの有効性とアセットの所属を確認) |
| GET | `/books/:id/stats` | 作者向け統計(匿名集計) |

### 認証・アカウント
| メソッド | パス | 内容 |
|---|---|---|
| POST | `/auth/signup` `/auth/login` `/auth/logout` | ID+パスワード認証 |
| POST | `/auth/recover` | リカバリーコードによるパスワード再設定 |
| GET/DELETE | `/me` | 自分の情報取得・アカウント削除 |
| POST | `/me/password` | パスワード変更 |
| POST | `/me/recovery-codes` | リカバリーコード再生成 |
| GET | `/me/stats` | 学習統計 |
| GET/PUT/DELETE | `/me/bookmarks` | ブックマーク |

### 共有
| メソッド | パス | 内容 |
|---|---|---|
| PUT | `/books/:id/share` | 公開範囲変更・トークン再発行 |
| GET | `/books/:id/members` | メンバー一覧 |
| POST/PATCH/DELETE | `/books/:id/members` | メンバー追加(ログインID指定)・ロール変更・削除 |
| GET | `/s/:token` | 共有リンクからの取得(`toPublic` 済み) |
| POST | `/s/:token/attempts` | ゲスト受験開始(§下記) |
| POST | `/attempts/:id/share` | 点数のみの結果共有リンク発行 |
| GET | `/r/:token` | 結果共有リンクの取得 |

### 受験
| メソッド | パス | 内容 |
|---|---|---|
| POST | `/books/:id/attempts` | 受験開始(出題セット・seed・`deadlineAt` を生成) |
| GET | `/attempts/:id` | 受験状態の取得(再開用) |
| PATCH | `/attempts/:id` | 回答の途中保存 |
| POST | `/attempts/:id/check` | 設問ごとの即時採点(練習モードで、ブックが `practiceFeedback: true` の場合のみ) |
| POST | `/attempts/:id/submit` | 提出・採点 |
| GET | `/attempts/:id/result` | 結果・解説 |

### 通報・管理
| メソッド | パス | 内容 |
|---|---|---|
| POST | `/reports` | 通報 |
| GET/PATCH | `/admin/reports` `/admin/reports/:id` | 通報の一覧・処理(admin) |
| PATCH | `/admin/books/:id/hide` | 管理者による非公開化(admin) |
| POST | `/admin/users/:id/temp-password` | 一時パスワード発行(admin) |

### 方針
- **正解の秘匿**: 受験用に配信するブックデータは §5.3 の `toPublic` を通したものとし、採点はサーバで行う。`explain` / `model` は `check`・`submit` 後にのみ返す。
- **即時採点(`check`)**: 練習モードかつ `practiceFeedback: true` の場合のみ有効。本番モードでは 403。総当たり対策として、attempt ごと・IP ごとにレート制限を設ける。
- **ゲスト受験の認可**: `POST /s/:token/attempts` で `link` / `public` のブックに対する受験を開始すると、サーバは推測困難な `attemptId` と、ランダムな `guestId` を HttpOnly Cookie で発行する(`Attempt.guestTokenHash` と照合)。以後の `PATCH` / `check` / `submit` / `result` は、この Cookie を持つ本人のみ許可する。localStorage には回答ドラフトと `attemptId` のみ保存する。
- **タイマー**: `deadlineAt = startedAt + timeLimit`。`deadlineAt` を過ぎた `PATCH` / `check` は拒否し、`submit` は期限までに保存済みの回答で採点する(通信遅延のため数秒の猶予を許容)。
- **認可**: 全APIでロール判定(`owner>editor>viewer`、`link` は有効トークン保持者を viewer 扱い)。`invite` のブックは招待されたユーザーのみ。

---

## 8. 画面構成

| パス | 画面 |
|---|---|
| `/` | LP・公開ライブラリ検索 |
| `/login` `/signup` | ログイン・新規登録(ID+パスワード、登録後にリカバリーコード表示) |
| `/dashboard` | マイブック、共有されたブック、学習履歴 |
| `/books/new` | 新規作成(テキスト貼付/ファイル/ZIP/テンプレート) |
| `/books/:id/edit` | エディタ(左:ソース、右:プレビュー、下:診断) |
| `/books/:id` | ブック詳細(概要、受験設定、共有ボタン) |
| `/books/:id/play/:attemptId` | テスト画面 |
| `/attempts/:id/result` | 結果・復習 |
| `/s/:token` | 共有リンク入口 |
| `/r/:token` | 結果共有 |
| `/settings` | アカウント設定(パスワード変更・リカバリーコード再生成・削除) |
| `/admin` | 通報・ユーザー管理(admin のみ) |
| `/docs/syntax` | 記法リファレンス・サンプル |
| `/terms` `/report-abuse` | 利用規約・権利侵害の申告窓口 |

UI要件: レスポンシブ(スマホ受験優先)、ダークモード、キーボード操作(Tab で空欄移動、Enter で次問)、a11y(WCAG AA、ラベル・フォーカス)、日本語/英語 i18n。

---

## 9. セキュリティ・非機能要件

- XSS: パーサが Markdown を構造化 AST に変換し、HTML を通さない。描画側でも rehype-sanitize / DOMPurify を適用し、リンクは `rel="noopener noreferrer"`。CSP を設定する
- 画像(ローカルディレクトリ保存):
  - 保存先は `UPLOAD_DIR`(Web 公開ディレクトリの外に置き、静的配信しない)。配信は `/assets/:id` または `/s/:token/assets/:id` 経由で権限確認、`Cache-Control: private`、`Referrer-Policy: no-referrer`
  - ファイル名は UUID で生成、パストラバーサル対策(解決後のパスが `UPLOAD_DIR` 配下か検証)
  - マジックナンバーでMIME検証(png/jpeg/webp/gif)、サイズ(5MB/枚、ブック合計50MB)、SVG は拒否、再エンコードで EXIF 除去
  - ブック削除・アカウント削除時にディレクトリ内ファイルも削除。DB と実ファイルの孤児を掃除する定期ジョブ
  - フォーク時は画像ファイルを複製(元の削除の影響を受けない)
  - Route Handlers で multipart を受ける際のボディサイズ上限を設定し、リバースプロキシ側(例: `client_max_body_size`)とも整合させる
- 外部画像URL:
  - 既定で禁止(`ALLOW_EXTERNAL_IMAGES=false`)。閲覧者のIP漏洩・トラッキングを避けるため
  - 許可する場合も `https` のみ、`referrerpolicy="no-referrer"`、CSP の `img-src` で制御し、診断 `QB-W002` を表示する
- ZIP 取り込み:
  - ZIP 自体のサイズ上限、エントリ数上限(例: 500)、展開後合計サイズ上限(例: 60MB)、圧縮率の上限(zip bomb 対策)
  - エントリ名を正規化し、`..`・絶対パス・シンボリックリンク・許可外の拡張子(`.qb` `.md` `.txt` `.json` と png/jpeg/webp/gif 以外)を拒否
  - メモリへ全展開せず、ストリームで検査しながら処理する
  - 画像は通常のアップロードと同じ検証・再エンコードを通す
- 正規表現: ReDoS 対策として RE2 互換サブセットに限定(パターン長・入力長の制限は §4.5)。サーバは `re2` で実行する
- CSRF: SameSite=Lax + CSRF トークン、API は Origin 検証
- セッション: HttpOnly・Secure Cookie、トークンは DB にハッシュで保存、有効期限30日(操作で延長)
- パスワード: Argon2id、ログに出力しない、ユーザー列挙対策としてログイン失敗メッセージは統一
- レート制限: ログイン・登録・リカバリー・作成・採点API・`check`(IP+ユーザー単位)。初期は単一プロセス前提でメモリまたは PostgreSQL テーブルを使い、複数台構成にする際に Redis 等へ移行する
- 共有トークン: 128bit 以上の乱数、`link` 公開時のみ有効、`noindex`
- 入力上限: ソース 1MB、1ブック最大2000問
- プライバシー: 個人回答は作者に非公開(匿名集計のみ)。アカウント削除で関連データ消去
- 権利侵害・不適切コンテンツへの対応:
  - 利用規約と、権利侵害の申告窓口(`/report-abuse`)を設ける
  - `public` / `link` への変更時に同意チェックを必須とする
  - 通報 → 管理者確認 → 非公開化(`hiddenByAdmin`)の運用フローを定義し、処理履歴を残す
  - 関連法令に基づく手続き(削除依頼への対応期限など)は、公開前に法務面を確認する
- 性能: パース+プレビュー 1000問で 200ms 以内(Web Worker 実行、デバウンス300ms)、LCP 2.5s 以内
- バックアップ: DB 日次ダンプ + `UPLOAD_DIR` の日次差分バックアップ(rsync 等)。復元手順を文書化し、定期的に復元テストを行う
- 監視: Sentry、構造化ログ

---

## 10. ディレクトリ構成(モノレポ)

```
/apps/web            Next.js アプリ
/packages/qb-parser  記法パーサ・AST型・採点ロジック・toPublic(単体テスト重視)
/packages/ui         共通UI
/prisma              schema.prisma, migrations
/data/uploads        画像保存ディレクトリ(既定。UPLOAD_DIR で変更、git管理外)
/docs                記法ドキュメント、サンプルブック
```

---

## 11. 開発フェーズ

見積りは、経験のある開発者1人がフルタイムで進める場合の目安。

0. **記法の確定 (約1週)**: 構文・エスケープ(§4.7)・ID規則(§4.6)・採点規則(§4.5)・診断コードを確定し、ゴールデンテストのコーパスを先に作る。後から変更するとデータ移行が必要になるため、ここを固める
1. **MVP (3〜4週)**: qb-parser(見出し/本文/空欄/選択肢/表)、貼付読み込み、プレビュー、受験・採点、localStorage 保存
2. **アカウント (2〜3週)**: ID/パスワード認証・リカバリーコード、ブック保存・一覧、履歴、サーバ採点、`toPublic`、タイマー
3. **リッチ要素 (2〜3週)**: 画像アップロード(ローカル保存)・ZIP(取り込み制限込み)、数式、複数選択、エクスポート
4. **共有 (2〜3週)**: リンク共有(画像配信含む)、ゲスト受験、招待、フォーク、公開ライブラリ、OGP、通報・管理
5. **仕上げ (2〜3週)**: 統計、i18n、a11y、E2E、負荷試験、バックアップ復元テスト

## 12. テスト方針
- パーサ: 記法ごとのゴールデンテスト、不正入力のファズ(診断が出てクラッシュしない)。表内エスケープ、ID書き戻しの冪等性(2回保存しても変化しない)を含める
- 採点: 正規化・正規表現(RE2非互換の拒否を含む)・数値誤差・配点按分・`multi` の部分点の境界値
- `toPublic`: 正解・解説・模範解答が配信データに含まれないことをスナップショットで検証
- E2E(Playwright): 読込→受験→結果、共有リンク権限、ゲスト受験と画像表示、フォーク、タイマー期限、未ログイン制限
- 認可テスト: ロール×API のマトリクス(ゲスト Cookie の他人の attempt へのアクセス拒否を含む)
- ZIP: zip bomb、パストラバーサル、許可外拡張子の取り込み拒否

## 13. 将来拡張
YAML 形式の入力、AI による問題自動生成(PDF/ノート→ブック)、記述の AI 採点、間隔反復(SRS)による復習スケジューリング、チーム/クラス機能、PWA オフライン受験、音声・動画問題、外部画像のサーバ側取り込み(SSRF 対策込み)。
