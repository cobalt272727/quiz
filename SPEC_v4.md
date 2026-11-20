# 問題ブック作成サイト 技術仕様書(改訂版 v0.4)

## 0. 改訂履歴(v0.1 → v0.4)

### v0.3 → v0.4 の主な変更

v0.3 は「v0.2 本文 + 追補章(A〜K)」の二層構造で、追補章が本文に優先する方式だった。v0.4 では追補章を各節へ統合し、優先関係の読み替えが不要な単一の仕様書にした。統合の過程で見つかった本文と追補の矛盾、仕様の漏れも合わせて修正している。

| # | 区分 | 変更内容 | 関連節 |
|---|------|----------|--------|
| 1 | 統合 | 追補章 A〜K を §3〜§12 へ統合し、「追補が優先」の規則を廃止 | 全体 |
| 2 | 矛盾 | 統計の集計単位を「ブックバージョン」から「設問ID+設問リビジョン」に統一。「統合」「リセット」は表示上の操作で、元データは変更しない | 4.6, 8 |
| 3 | 矛盾 | 期限後の猶予「数秒」を設定値 `SUBMIT_GRACE_SECONDS` に確定。期限後に受け付けるのは提出要求の到達のみ | 7.4 |
| 4 | 矛盾 | ゲスト資格情報を単一の `guestId` Cookie から Attempt 単位に変更し、`Attempt.guestId` を廃止 | 6, 7.6 |
| 5 | 矛盾 | `Book.shareToken` / `ShareResult.token` の平文保存をハッシュ保存に統一(共有URLは発行時のみ表示) | 6, 9 |
| 6 | 矛盾 | アカウント削除の「全データ削除」を、認証情報の削除+受験結果の匿名化に整合 | 3.4, 9 |
| 7 | 矛盾 | 自動設問のIDを書き戻す場所が未定義だった問題を、`{qid=...}` 属性の導入で解決 | 4.2, 4.6 |
| 8 | 実装矛盾 | `\[[` や `&vert;` が Markdown パーサに先に解釈されて効かなくなる問題。QB記法は生ソース範囲に対して解析する | 4.7, 4.8, 5.2 |
| 9 | 実装矛盾 | AST の数値 Matcher を `number` から10進文字列へ変更(10進演算の要求と整合) | 4.5, 5.1 |
| 10 | 実装矛盾 | 正規表現で入力を小文字化すると、大文字を含むパターンが決して一致しない問題。大小無視は `i` フラグのみで制御 | 4.5 |
| 11 | 実装矛盾 | `Attempt.score` の桁あふれ(1000点×2000問)を `NUMERIC(10,2)` に修正。丸め規則を定義 | 4.5, 6 |
| 12 | 実装矛盾 | ログイン試行制限(ID+IP単位)を `User` の列では持てない問題を、`RateLimit` テーブルで解決 | 6, 9 |
| 13 | 実装矛盾 | 日本語全文検索のインデックスを `pg_bigm` / `pg_trgm` 前提に修正(`tsvector` は日本語を分かち書きできない) | 6 |
| 14 | 漏れ | 数値空欄の負号異体字・桁区切りカンマ・指数の文法を確定。診断コード QB-E007〜E012 を追加 | 4.5, 5.2 |
| 15 | 漏れ | 選択肢ID、`normalize` 変更を採点定義に含める。退役ID台帳 `BookEntityId`、Attempt が参照する BookVersion の保持 | 4.6, 6 |
| 16 | 漏れ | `PUT /books/:id` の応答で確定済み source を返し、クライアントが置換する(ID再採番の防止) | 7.3 |
| 17 | 漏れ | API補完: 履歴・復元、中断、自己採点、結果共有の失効、`/me/attempts`、ユーザー停止、Attempt経由の画像配信 | 7.1 |
| 18 | 漏れ | `public` ブックのゲスト受験経路と画像配信、共有リンク失効後に継続する Attempt の画像配信 | 7.1, 7.6, 7.8 |
| 19 | 漏れ | 認可マトリクスを追加。source取得・export・フォークが正解開示になる点を整理し `allowFork` を導入 | 3.5, 7.2 |
| 20 | 漏れ | `expired` の確定タイミング、essay 自己採点と終端状態の関係を定義 | 7.4, 7.5 |
| 21 | 体裁 | 崩れていた表・箇条書き(診断コード、API、§4.3・§4.5)の修正、古い参照(旧 `markdown` ブロック、「§下記」)の削除 | 全体 |
| 22 | 見直し | v0.3 追加分を反映して開発見積りを更新 | 11 |
| 23 | 新設 | 未解決事項をまとめた「要確認事項」を新設 | 14 |

### v0.4 レビュー反映(確定事項)

v0.4 レビューで次の事項が確定し、本文に反映した。

- 結果画面(終端状態の Attempt)では正解を表示する(§3.3, §5.3, §7.9)
- 選択肢空欄は複数正解を可能にする。`?` を付けた選択肢がすべて正解で、いずれかを選べば正解(§4.2, §5.1)
- ゲスト資格情報の失効後は、Attempt の状態を変更せず放置する。復習・履歴に特別な処理はしない(§7.6)
- 削除済みユーザーのログインIDは解放し、他のユーザーが再取得できる(§3.4, §6.1)
- 作者向け統計は editor にも公開する(§7.2)

### 仮決定(要レビュー)

実装前に確認してほしい、改訂時に置いた仮の決定です(★は v0.4 で追加)。

- 表内の空欄は**行単位で1問**として扱う(表全体を1問にしたい場合は `@q` で囲む)
- `{{ }}` 記法は廃止し、予約済み(使用するとエラー)とする
- 認証は Auth.js を使わず自前セッション層とする
- 外部画像URLは既定で禁止(サイト設定で許可可能)
- 複数選択の既定採点は「完全一致のみ正解」(`scoring=partial` で部分点)
- ★ 自動設問のID属性は `{qid=...}`(追補の例 `{id=q_...}` は空欄属性と曖昧になるため変更)
- ★ 設問得点は設問単位で1回だけ丸める(小数第3位を四捨五入)
- ★ `SUBMIT_GRACE_SECONDS` の既定は 5 秒
- ★ ゲスト Attempt 資格情報の有効期間 `GUEST_ATTEMPT_TTL_DAYS` の既定は 7 日
- ★ フォークは作者が `allowFork` を許可した場合のみ(既定 false)。許可は正解の開示を意味する
- ★ 結果共有リンクの既定有効期限は 30 日
- ★ Markdown リンクの許可スキームは `http` / `https` / `mailto`
- ★ 作者向け統計は回答 5 件未満を非表示
- ★ Book の論理削除の保持期間 `BOOK_RETENTION_DAYS` の既定は 30 日
- ★ essay の自己採点は、終端状態になった後も本人に限り更新可能
- ★ 管理者発行の一時パスワードは 1 回限り・有効期限 24 時間・使用後に変更を強制
- ★ 退役済みIDの再出現は、バージョン復元による場合のみ許可
- ★ Attempt が参照する BookVersion は履歴の剪定(直近50件)から除外する
- ★ 結果画面の正解表示: `exact` は許容解答すべて、`number` は `値 ± 許容誤差`、`regex` はパターン文字列をそのまま表示する

### 過去の改訂(要約)

- **v0.2 → v0.3**: ID・リビジョン、Markdown領域の独自記法誤認防止、数値空欄の文法、Answer/Attempt の状態管理、Book の楽観的排他制御、ゲスト資格情報、共有リンク失効、source/AST の互換性方針、管理者操作ログ等を追加
- **v0.1 → v0.2**: 表内の `[[ ]]` エスケープ、ID の書き戻し方式、AST 拡張、配点規則、`{{答}}` 廃止、自前セッション層、RE2 サブセット、画像配信、即時採点API、ZIP 取り込み対策、YAML 入力の除外

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
|----|------|------|
| フロント | Next.js (App Router) + TypeScript + React | SSR/OGP(共有リンク)・単一言語 |
| UI | Tailwind CSS + shadcn/ui | 開発速度 |
| エディタ | CodeMirror 6 | 構文ハイライト・エラー波線表示 |
| パーサ | 自作 (unified/remark ベース) + Zod | AST化とスキーマ検証 |
| 数式 | KaTeX | 軽量 |
| 数値演算 | `decimal.js`(`qb-parser` に同梱し、クライアント/サーバで共有) | 許容誤差の境界比較を浮動小数点誤差なしで行う(§4.5) |
| 正規表現 | サーバ: `re2`(node-re2)。パーサ側で RE2 互換サブセットを検証 | ReDoS 対策、クライアント/サーバ間の挙動差を防ぐ |
| 画像処理 | `sharp`(再エンコード・EXIF除去・サイズ取得) | |
| バックエンド | Next.js Route Handlers (REST) | 構成簡素化 |
| DB | PostgreSQL + Prisma | リレーション・JSONB。Prisma で表現できない制約・索引は SQL マイグレーションで定義する(§6.3) |
| 認証 | ID + パスワードのみ。自前の薄いセッション層(Argon2id、256bit乱数のセッショントークンを DB にハッシュ保存、HttpOnly Cookie) | 外部ログイン・メール認証は使わない。Auth.js の Credentials は DB セッションとの併用が標準では想定されておらず、ロック・リカバリーコードも自前実装になるため。実装時にライブラリの最新状況を再確認する |
| 画像保存 | サーバのローカルディレクトリ(`UPLOAD_DIR`)。配信は認可付き API 経由 | |
| ホスティング | 自前サーバ/VPS + Docker(Node.js + PostgreSQL)、`UPLOAD_DIR` はボリュームマウント | ローカルディスク利用のため Vercel 等のサーバレスは不可 |
| テスト | Vitest(パーサ)、Playwright(E2E) | |

---

## 3. 機能要件

### 3.1 ブック作成・読み込み

- 入力方法: ①エディタに直接記述 ②貼り付け ③ファイルアップロード(`.qb`/`.md`/`.txt`/`.json`) ④ZIP(本文+画像一式)
  - YAML 形式の**ブック全体の入力**は初期版では対応しない(§13)。本文先頭のフロントマター(§4.1)は YAML 記法で書くが、これは対応範囲に含まれる
  - ZIP は §9 の取り込み制限に従う
  - どの入力方法でも、保存時に §4.6 の ID 確定(書き戻し)と §5.2 の検証を同一の手順で行う
- 入力中にライブプレビュー(右ペイン)とエラー一覧(行番号付き)
- 書き出し(owner / editor のみ。正解・解説を含むため。§7.2):
  - テキスト(.qb)、JSON、ZIP(画像同梱)
  - 印刷用PDF(ブラウザ印刷CSS)。「問題用」と「解答用」の2種類(§8)

### 3.2 ブロック要素

| 要素 | 内容 |
|------|------|
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
  - 復習モードは、出題対象が復習対象設問(§8)に限られる点を除き練習モードと同じ扱いとする(`check` の可否も `practiceFeedback` に従う)
- オプション: 出題順シャッフル、選択肢シャッフル、制限時間、章の絞り込み、問題数指定
- 採点: 空欄ごとの部分点、配点指定可(規則は §4.5)。未回答の設問は不正解として扱い、結果画面で「未回答」と明示する
- 結果画面: 総合得点、章別正答率、誤答一覧、正解、解説(正解の表示は終端状態の Attempt のみ。§7.9)
- 回答の途中保存・再開(ログイン時はサーバ、ゲストは localStorage に回答ドラフトと attemptId のみ保持し、採点はサーバ)
  - 出題セット・出題順・シャッフルの seed・開始時点の設問リビジョン対応表(`questionId → revision`)は `Attempt.settings` に保存し、再開時に再現する
- 制限時間はサーバが `deadlineAt = startedAt + timeLimit` で管理し、期限判定もサーバ時刻を基準にする(§7.4)
- 採点の正はサーバとする。クライアント側の採点結果は信用しない(MVP 段階のローカル完結モードを除く。§11)

### 3.4 アカウント

- サインアップ/ログインは **ログインID + パスワードのみ**(メール・SNS ログインなし)
  - ログインID: 3〜32文字、英数字と `_` `-`、大文字小文字を区別せず一意。アカウント削除後は解放され、他のユーザーが再取得できる(旧アカウントとは無関係の別ユーザーとして扱う)
  - パスワード: 8〜128文字(バイト数にも上限を設ける、§9)、Argon2id でハッシュ化して保存。よくある弱いパスワードは拒否
  - メールを持たないためパスワード再設定は不可。代替として ①登録時に表示するリカバリーコード(10個、1回限り)で再設定 ②管理者による一時パスワード発行 を提供
    - リカバリーコードは登録直後に「保存しました」の確認を必須とし、再生成(旧コード全失効)も設定画面から可能
    - 管理者発行の一時パスワードは 1 回限り・有効期限付き(既定 24 時間)で、使用後は新パスワードの設定を強制する
  - パスワード変更(現パスワード必須)、変更時に他セッションを失効。リカバリーによる再設定時は全セッションを失効
  - ログイン失敗が連続した場合は一時ロック(ID+IP 単位で段階的に待機。状態は `RateLimit` テーブルに持つ、§6)
  - 管理者に停止(`suspendedAt`)されたユーザーはログイン・API利用ができない
- プロフィール(表示名)
- アカウント削除(パスワード再入力のうえ実行。§9 のルールに従い、認証情報・個人データを削除し、保持が必要な受験結果は個人を識別できない形に匿名化する)
- 未ログインでも「ゲスト受験」は可能(`link` / `public` のブックのみ、履歴は端末保存)

### 3.5 共有

| 公開範囲 | 説明 |
|----------|------|
| private | 作者のみ |
| link | 「リンクを知っている人」(推測困難なトークン付きURL) |
| public | 公開ライブラリに掲載・検索可能 |
| invite | 指定ユーザー(ログインID)に閲覧/編集権限を付与 |

- 権限ロール: `owner` / `editor` / `viewer`(受験のみ)。操作ごとの可否は §7.2 の認可マトリクスに従う
- 複製(フォーク): 元作者クレジットを保持してコピーする
  - フォークは source 全体(正解・解説・模範解答を含む)を複製するため、**正解の開示を意味する**。viewer・共有リンク経由・公開ライブラリ経由のフォークは、作者がブックの `allowFork` を許可している場合のみ可能とする(既定 false)。owner / editor は常に可能
  - フォークしても ID は維持する(IDはブック内でのみ一意)。リビジョン・統計・履歴は引き継がず、新ブックとして revision 1 から始める
- 共有リンクは再発行・無効化可能。共有トークンは DB にハッシュのみ保存するため、共有URLは発行時にのみ表示する(再表示はせず、必要なら再発行)。失効時の挙動は §7.8
- OGP用のタイトル・説明を自動生成(link 公開では画像は含めない)
- 回答の結果共有(任意): 点数のみのリンクを発行。有効期限(既定 30 日)と失効機能を持つ
- 作者向け統計: 受験回数、問題別正答率(個人は特定せず匿名集計。§8)
- 通報機能・管理者による非公開化(`hiddenByAdmin`)。非公開化時は §7.8 と同様に新規アクセス・新規受験・共有経由の画像取得を停止し、開始済みの Attempt を停止するかは管理者が選択する(操作は監査ログに記録)
- `public` / `link` へ変更する際は「第三者の著作物を無断で含めていない」ことへの同意を必須とする(API では `copyrightConsent: true` を要求。§9 権利侵害対応)

---

## 4. 問題ブック記法(QB Markup)

Markdown拡張。1ファイル=1ブック。先頭に YAML フロントマターを置く。

### 4.1 例

``` markdown
---
title: 日本史 基礎
description: 古代〜中世
tags: [history, japan]
lang: ja
timeLimit: 600          # 秒(任意)
practiceFeedback: true  # 練習モードの即時採点を許可(既定 false)
shuffle: { questions: true, choices: true }
normalize: { kana: false }
---

# 第1章 古代

## 1-1 飛鳥時代

聖徳太子は **[[603]]{id=b_a1c9x2}** 年に冠位十二階を制定した。 {qid=q_m2x7a4}

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
```

- この例は保存前後の記述が混在している。冒頭の段落は保存後の形(設問ID `{qid=...}` と空欄ID `{id=...}` が書き戻された状態)、`@q` 内の空欄と表の行は保存前の形(ID省略)を示している。ID は保存時に自動付与されるため、手書きで省略してよい(§4.6)
- 表の例は、1行目が「1問・1空欄」、2行目が「1問・2空欄」として扱われる(§4.3)。表内の `|` は `\|` と書く(§4.7)
- 表の行・段落・リスト項目が自動設問になる場合、その設問IDは保存時に `{qid=...}` として、段落・リスト項目は末尾、表の行は最終セルの末尾に書き戻される(§4.6)

#### フロントマター項目

| キー | 型 | 既定 | 内容 |
|------|----|------|------|
| `title` | 文字列 | (必須) | ブック名 |
| `description` | 文字列 | なし | 説明(OGP・検索に使用) |
| `tags` | 文字列配列 | `[]` | タグ |
| `lang` | `ja` / `en` | `ja` | 言語 |
| `timeLimit` | 正の整数(秒) | なし | 制限時間 |
| `practiceFeedback` | 真偽 | `false` | 練習モードの即時採点を許可 |
| `shuffle` | `{questions, choices}` | 両方 `false` | シャッフルの既定 |
| `normalize` | `{kana}` | `{ kana: false }` | 自由記述の正規化オプション(採点に影響する。§4.6) |

### 4.2 構文一覧

| 構文 | 意味 |
|------|------|
| `---` YAML `---` | ブックのメタ情報 |
| `#` `##` `###` | 見出し(章・節。章で出題範囲を絞込) |
| 通常の Markdown | 本文 |
| `![alt](img:name){width=..}` | 画像。`img:` はブック内アセット。`https://` 外部画像は既定で不可(§9) |
| Markdown 表 | 表。セル内に空欄・書式・数式可 |
| `[[答1 \| 答2]]` | 自由記述空欄。`\|` 区切りは許容解答(本文中では単に `|`) |
| `[[/正規表現/]]` | 正規表現で判定(RE2互換サブセット、§4.5) |
| `[[=3.14 ±0.01]]` | 数値(許容誤差。§4.5) |
| `[[?正解 \| 誤1 \| 誤2]]` | 選択肢空欄(ドロップダウン表示)。先頭の選択肢が `?` で始まる式が選択肢空欄で、`?` が付いた選択肢がすべて正解(複数可。いずれかを選べば正解。例: `[[?603 \| ?六〇三 \| 593]]`)。選択肢の先頭の文字として `?` を使う場合は `\?` と書く |
| `[[...]]{id=.. w=..}` | 空欄への属性(`id`: 空欄ID、`w`: 配点の重み、既定 1) |
| `{qid=..}` | 自動設問(`@q` に包まれない空欄のブロック)の設問ID。段落・リスト項目の末尾、表の行は最終セルの末尾に置く |
| `@q ... @end` | 設問ブロック(属性: id, type, points, tags, scoring, answer) |
| `@text ... @end` | 表示専用ブロック。中の Markdown 記法は解釈するが、`[[...]]` は空欄にせず文字として扱い、設問を生成しない。受験画面・結果画面にも表示される |
| `@explain` | 解説(設問ブロック内) |
| `@hint` | ヒント(設問ブロック内) |
| `@model` | 模範解答(`essay` のみ) |
| `- [x]` / `- [ ]` | 選択肢リスト(`single`/`multi`) |
| `$...$` / `$$...$$` | 数式 |
| `\[[` | 空欄開始記号のエスケープ(通常テキストとして保持) |
| `&vert;` | 解答文字列中の `|` そのもの(§4.7) |

※この表内の `\|` は、仕様書の表を壊さないためのエスケープ。本文中では、区切りは単に `|` と書く(表セル内の書き方は §4.7)。

**`{qid=..}` と `{id=..}` を分けた理由**: 段落末尾の空欄 `[[答]]{id=b_xxx}` の直後に設問ID属性が続く場合(`[[答]]{id=b_xxx} {qid=q_yyy}`)、同じキー名では空欄属性との区別が文字列の接頭辞頼みになるため、キーで区別する。`{qid=..}` は空欄を1つ以上含むブロックにのみ付与できる(それ以外は QB-E010)。

**`@text` の扱い**: `@text` 内の空欄記法は文字として表示し、ID の付与・設問の生成・採点の対象にしない。`@text` の中で `@q` は書けない(QB-E010)。コードブロック内の `@end` は `@text` の終端として扱わない。出題順をシャッフルしても `@text` は記述位置に残り、設問だけを入れ替える。

**廃止**: v0.1 の `{{答}}` は廃止した。使用するとエラー `QB-E006`(「`[[答]]` を使ってください」)を返す。

### 4.3 設問タイプ(`@q type=`)

`blank`(既定。ブロック内の空欄を採点)/ `single`(単一選択)/ `multi`(複数選択)/ `essay`(自己採点)/ `truefalse`

- `truefalse` は `@q type=truefalse answer=true|false` と書く(選択肢リストは不要。UIは「正/誤」の2択。`answer` の省略は QB-E008)
- `single` は正解がちょうど 1 つ、`multi` は正解が 1 つ以上であること(違反は QB-E008)
- `@q` 内には、段落・リスト・表・画像・数式など任意のブロックを含められる

**`@q` に包まれない空欄の扱い**:

- 段落・リスト項目・**表の行**ごとに、その中の空欄をまとめて1問(複数空欄は部分点)として扱う
- 1つのブロックに空欄が複数あっても1問。複数の問題に分けたい場合は `@q` で明示する
- 表全体を1問にしたい場合は、表を `@q ... @end` で囲む
- 自動設問の `points` は 1。IDは §4.6 に従う(設問ID `{qid=..}`、空欄ID `{id=..}`)

### 4.4 JSON 形式

同一内容を構造化形式(JSON)でも読み込める。内部 AST の JSON と同じスキーマ(§5)。テキスト形式は読み込み時に AST に変換される。JSON 取り込みでも、ID 確定・検証・リビジョン判定はテキスト形式と同一の手順で行う。YAML 形式は将来拡張(§13)。

### 4.5 採点ルール

#### 自由記述の正規化

- 比較時のみ、次の順で正規化する: ①NFKC → ②前後空白除去 → ③英字の大文字小文字無視 → ④(`normalize.kana: true` の場合のみ)ひらがな/カタカナ同一視
- 回答側・正解側の双方に同じ正規化を適用する。表示用の回答文字列は書き換えない
- 内部空白は保持する。連続空白の圧縮は初期版では行わない
- 空欄ごとに `[[答 | 別解]]` のいずれか一致で正解
- 採点の正はサーバ側とする

#### 正規表現

- RE2 互換サブセットのみ許可(後方参照・先読み/後読みは不可)。パーサが保存時に検証し、違反は `QB-E004`
- パターン長 ≤ 200文字、フラグは `i` のみ
- 判定対象は「NFKC → 前後空白除去」までを行った入力(長さ ≤ 500文字。超過は不正解とし、エラーにはしない)
- **大文字小文字の無視は `i` フラグでのみ制御し、入力の小文字化は行わない**(小文字化すると `[A-Z]` や `Tokyo` のような大文字を含むパターンが決して一致しないため)。かな同一視(`normalize.kana`)も正規表現には適用しない
- 判定は完全一致(内部的に `^(?:パターン)$`)

#### 数値空欄

- `[[=数値 ±許容誤差]]` の数値と許容誤差は、次の10進リテラルとする: `[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d{1,3})?`(例: `-1.25`、`1.2e-3`)
- 許容誤差は 0 以上の有限数(符号なし)で、省略時は 0。違反・解析不能は `QB-E009`
- 回答は次の順で解析する。いずれかで失敗、または文法に一致しなければ不正解
  1. NFKC → 前後空白除去(全角数字・全角小数点・全角符号を正規化)
  2. 負号の異体字(`−` U+2212、`－` U+FF0D、`‐` U+2010 等)を `-` に統一(NFKC では `−` U+2212 が変換されないため明示する)
  3. 桁区切りカンマの除去。**3桁区切りの位置にある場合のみ**除去し(`1,234.5` は可)、それ以外のカンマ(`1,5` 等)は不正解とする(欧州式小数との取り違えで誤って正解扱いしないため)
- `NaN`、`Infinity`、`-Infinity`、空文字、数値以外の文字を含む回答は不正解。回答長は 64文字以内
- 正解条件は `abs(回答値 - 正解値) <= 許容誤差`(境界値は正解に含める)。判定は `decimal.js` 等の10進演算で行い、IEEE 754 の単純比較に依存しない
- 初期版では単位付き回答(例: `10cm`)をサポートしない。単位は空欄の外に書く(`[[=10]]cm`)

#### 配点

- `points`(省略時は設問内の空欄の重み `w` の合計。空欄のない設問は 1。`points=-1` も同じ)と空欄の重み `w`(既定 1)は、有限の正数のみ許可する。上限はそれぞれ 1000(違反は `QB-E007`)。重みの合計が 1000 を超える場合も `QB-E007`
- 設問の `points` を、空欄の重み `w` の比で按分する
  - 部分点 = `points × (正解した空欄の重み合計 / 全空欄の重み合計)`
- `single` / `truefalse`: 正解で満点、不正解で 0
- `multi`: 既定 `scoring=all`(選択がすべて正しい場合のみ満点)。`scoring=partial` なら `max(0, 正しく選んだ数 − 誤って選んだ数) / 正解数 × points`(負の点数は 0 点に下限処理)
- `essay`: 模範解答表示後に自己採点(◯=満点 / △=半分 / ✕=0)。自己申告であるため、結果画面で「自己採点」と明示する。未自己採点のまま提出した場合は 0 点で「未自己採点」と表示する。自己採点の受付規則は §7.5
- **丸めと合計**: 設問得点は上式を10進演算で求め、小数第3位を四捨五入して小数 2 桁で確定する(丸めは設問単位で 1 回のみ)。`Attempt.score` は設問得点の合計とし、画面表示時に必要なら丸める。空欄別の `Answer.points` は表示用の按分値で、合算が設問得点と一致するよう端数を最後の正解空欄で調整する

### 4.6 ID ルール(設問・空欄・選択肢)

#### 基本

- 設問IDと空欄IDは**不変の識別子**とし、回答履歴・統計・復習は ID で紐づける
- 設問IDはブック内で一意、空欄IDもブック内で一意とする。両者は別名前空間とする
- ID は `q_`(設問)/ `b_`(空欄)に続く小文字英数字 6〜16 文字とし(`^[qb]_[a-z0-9]{6,16}$`)、生成には暗号学的乱数を用いる(既定 6 文字。ブック内の既存ID・退役IDと衝突した場合は再生成)。形式違反は `QB-E010`
- ID は識別子であり、認証・認可用の秘密情報として扱わない
- 設問を並び替え・移動しても ID は変わらない
- 削除した ID は同一ブック内で再利用しない(退役ID台帳 `BookEntityId`、§6)。ソースから ID だけが消えた場合も新しい問題として扱い(同一性の推測は行わない)、旧 ID は退役する。退役済み ID の再出現は `QB-E011`(サーバ検証のみ)。ただしバージョン復元(§8)による復活は許可する
- 設問削除後も過去 Attempt の回答・採点結果は保持し、現行ブックの出題対象からのみ除外する

#### 書き戻し

- 未指定の設問・空欄には、保存時(エディタの保存・API の保存・ZIP取り込み・JSON取り込み)に短いランダム ID を**ソースへ書き戻して**確定する
  - `@q` の設問: `@q id=...`
  - `@q` に包まれない自動設問: `{qid=...}`(段落・リスト項目は末尾、表の行は最終セルの末尾)
  - 空欄: `[[...]]{id=...}`
- 書き戻しは 2 回実行しても結果が変わらない(冪等)
- 編集中の未確定 ID は警告 `QB-W001`(保存時に自動付与)。ブック内で重複する ID は `QB-E001`
- クライアントは保存応答に含まれる確定済み source でエディタ内容を置き換える(§7.3)。置き換えないと、次の保存で ID が再採番され履歴が切れる

#### 選択肢の ID

- `single` / `multi` の選択肢(`Choice.id`)は、ソース上に ID を書かず、出現順から決定的に生成する(`c1`, `c2`, …)。`Answer.value` はこの ID を保存する
- 選択肢空欄(`choiceBlank`)の回答値は、作者記述順の選択肢インデックスとする
- したがって選択肢の追加・削除・並び替えは採点定義の変更として扱い、設問リビジョンを更新する(シャッフルは表示上のみで、保存値は変わらない)

#### 設問リビジョン

- 採点に影響するフィールドが変わった場合は `QuestionRevision` を新規作成する。対象は次のとおり
  - 設問タイプ、正解、Matcher(`exact` / `regex` / `number` と正規表現フラグ)、選択肢の構成と正誤、`scoring`、`points`、空欄構成と重み `w`
  - 当該設問に適用される実効の `normalize` 設定(ブック全体の `normalize` が変わった場合、自由記述空欄を含む全設問が対象になる)
- 問題文の誤字修正など採点に影響しない変更では、リビジョンを更新しない
- 現行の最新リビジョンと `gradingHash` を比較し、異なる場合のみ新リビジョンを作る(以前の定義へ戻した場合も新リビジョンとする)
- 過去 Attempt は開始時点の BookVersion と設問リビジョン対応表を固定し、後日の編集で過去の得点・正誤を再計算しない
- 統計の基本単位は「設問ID + 設問リビジョン」とする。作者が統計画面で選べる「統合」「リセット」は表示上の集計操作で、元データは変更・削除しない(§8)

### 4.7 表内の空欄とエスケープ

Markdown 表(GFM)ではセル区切りの `|` が先に解釈されるため、表の中の `[[ ]]` では区切りの `|` を `\|` と書く。

```
| 奈良 | [[聖武天皇]] | [[?大仏造立 \| 平安遷都 \| 承久の乱]] |
```

- 処理順: ①GFM としてセル分割(このとき `\|` は `|` に戻る)→ ②各セルに対して空欄パーサを適用
- 解答文字列に `|` そのものを含めたい場合は、本文・表のどちらでも `&vert;` と書く(HTML 実体参照としては処理しない。空欄パーサ専用)
- 表内に未エスケープの `|` を含む `[[` が閉じない場合は、セル数の不一致とあわせて `QB-E003`(「表内の `[[ ]]` では `|` を `\|` と書いてください」)を表示する
- `\[[` と `&vert;` は、Markdown パーサに先に解釈(`\[` → `[`、`&vert;` → `|`)されると効かなくなる。**QB記法の解析は §4.8 のとおり、Markdown が解釈した後のテキストではなく生ソース範囲に対して行う**

### 4.8 Markdown と QB記法の解析規則

#### 処理順

1. Markdown 構造解析(mdast 化。ブロック・インライン範囲の特定)
2. QB記法の対象ノード抽出(下記の対象外領域を除く)
3. QB記法解析(`[[ ]]`、属性、`@q` 等)
4. AST 検証

#### 生ソース範囲に対する解析

ステップ 3 は mdast のテキストノードの値ではなく、ノードの `position` が指す**ソース上の生テキスト**に対して行う。実装は、対象外領域をマスクしたうえで QB トークンを抽出して不透明なプレースホルダに置換し、残りを Markdown インライン解析してから戻す方式を想定する。これにより次を保証する。

- `\[[` のエスケープと `&vert;` が Markdown に消費されず、QB パーサが解釈できる
- 太字・斜体の内部の空欄(`**[[603]]**`)が解釈される

#### 解釈しない領域

次の領域では `[[...]]`、`@q`、`@explain` 等を解釈しない。

- インラインコード、フェンス付きコードブロック、インデントコードブロック
- リンクURL、画像URL、リンクタイトル
- 数式ノード(`$...$`、`$$...$$`)
- 生HTML領域(初期版では HTML 自体を描画しない)

#### その他

- 太字・斜体の内部では通常本文と同様に QB記法を解釈する
- リンクの表示テキストでは QB記法を解釈しない。リンク内に空欄を設ける場合はリンクの外に記述する
- `@q`、`@explain` 等のブロック指示子は行頭に単独である場合のみ認識し、コードブロック内では認識しない
- 対象外領域内の独自記法らしい文字列を黙って変換しない。パーサテストで非解釈を保証する(§12)

---

## 5. 内部データモデル

### 5.1 AST (TypeScript / Zod)

``` ts
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
  | { type: "heading"; level: 1|2|3; text: string; id: string }   // id は表示・アンカー用の導出値(永続IDではない)
  | { type: "paragraph"; c: Inline[] }
  | { type: "list"; ordered: boolean; items: Block[][] }
  | { type: "code"; lang?: string; v: string }
  | { type: "math"; v: string }                                  // $$...$$
  | { type: "image"; assetId?: string; src?: string; alt: string; caption?: string; width?: number }
  | { type: "table"; header: Inline[][]; rows: Inline[][][] }    // 行 → セル → Inline[]
  | { type: "text"; body: Block[] }                             // @text 表示専用(設問を生成しない)
  | { type: "question"; id: string; kind: QKind; points: number; tags: string[];
      auto: boolean;                                             // @q なしで自動生成された設問
      body: Block[];                                             // 段落・表・画像など
      choices?: Choice[];                                        // single / multi
      answer?: boolean;                                          // truefalse
      scoring?: "all" | "partial";                               // multi
      model?: Block[];                                           // essay の模範解答
      explain?: Block[]; hint?: Block[] };

type Choice = { id: string; label: Inline[]; correct: boolean };  // id は出現順から生成(c1, c2, …。§4.6)

type Inline =
  | { t: "text"; v: string }
  | { t: "strong" | "em"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "math"; v: string }
  | { t: "link"; href: string; c: Inline[] }
  | { t: "blank"; id: string; weight: number; answers: Matcher[] }                    // 自由記述
  | { t: "choiceBlank"; id: string; weight: number; options: string[]; correct: number[] };
  // choiceBlank: options は作者記述順。correct は `?` を付けた選択肢のインデックス(1 つ以上。いずれかを選べば正解)

type Matcher =
  | { kind: "exact"; v: string }
  | { kind: "regex"; pattern: string; flags?: "i" }
  | { kind: "number"; v: string; tol?: string };                  // 10進文字列(§4.5。number 型にしない)
```

- 見出しの `id` は表示・アンカー用に導出した値で、永続IDではない。章の絞り込みは、受験開始時に確定した出題セット(設問ID列)を `Attempt.settings` に保存することで再現するため、見出しIDの安定性には依存しない
- 数値 Matcher の `v` / `tol` を `number` 型にしないのは、10進演算での境界判定(§4.5)と、指数表記・桁数の保持のため
- Markdown の生ソースは AST に持たない。パース時に構造化し、HTML は一切通さない(XSS 対策の第一段)

### 5.2 パーサ処理

1. フロントマター抽出・検証
2. Markdown ブロックを remark(GFM)で mdast 化(§4.8 ステップ 1)
3. カスタムプラグインで `[[ ]]` `@q` `{id=..}` `{qid=..}` を生ソース範囲から解析して AST ノード化(表は §4.7 の順序で処理)
4. 自動設問の生成(§4.3)、ID 補完・重複チェック(§4.6)、参照アセット解決
5. 正規表現の RE2 互換検証、`{{ }}` の検出、配点・正解定義・数値空欄・URLスキームの検証
6. 診断リスト(`error`/`warning`, 診断コード, 行・列, メッセージ)を返却

パーサは共有パッケージ(`packages/qb-parser`)としてクライアント(プレビュー)とサーバ(保存時検証)で同一コードを使う。ID の**補完(書き戻し)**はサーバの保存処理でのみ確定し、クライアントのプレビューは `QB-W001` を表示するだけとする。

**主な診断コード**

| コード | 内容 |
|--------|------|
| QB-E001 | ID の重複 |
| QB-E002 | `[[` / `@q` が閉じていない |
| QB-E003 | 表内で未エスケープの `\|` |
| QB-E004 | RE2 互換でない正規表現 / 長さ超過 |
| QB-E005 | 参照している画像が解決できない |
| QB-E006 | 廃止記法 `{{ }}` の使用 |
| QB-E007 | 配点 `points` / 重み `w` が範囲外(有限の正数、上限 1000) |
| QB-E008 | 設問の正解定義が不正(`single` の正解が 1 つでない、`multi` の正解が 0、`truefalse` の `answer` 欠落、選択肢リスト不備) |
| QB-E009 | 数値空欄の構文不正(数値・許容誤差が解析不能、許容誤差が負、非有限) |
| QB-E010 | 属性値の不正(ID 形式、`type`・`scoring`・`answer` の値、`{qid=..}` の付与先が空欄を含まないブック) |
| QB-E011 | 退役済み ID の再利用(サーバ検証のみ) |
| QB-E012 | リンクURLのスキームが許可リスト外(§9) |
| QB-W001 | ID 未付与(保存時に自動付与) |
| QB-W002 | 外部画像の使用(許可設定時) |
| QB-W003 | 受験画面・結果画面に表示されない内容(`@text` の外の通常文など) |

### 5.3 受験用の公開射影(正解の除去)

`toPublic(book)` を `qb-parser` に置き、受験者へ配信するデータは必ずこの関数を通す。**許可リスト方式**で公開フィールドを組み立て、内部 AST をコピーして秘密フィールドだけ削除する方式には依存しない。

- `blank`: `answers`(Matcher)を削除。UI のために入力種別のみ残す(全 Matcher が `number` なら `number`、それ以外は `text`)
- `choiceBlank`: `correct` を削除。選択肢の順序は `Attempt.settings.seed` で決定
- `Choice.correct` / `answer` / `model` / `explain` を削除(`hint` は配信する)
- `explain` と `model` は、`/attempts/:id/check`(許可時)・`/submit`・結果画面でのみ返す
- 結果画面用には、終端状態の Attempt に限り `toResult` で許可リスト方式の正解表示を組み立てる(§7.9)。`check` の応答には含めない
- `correct`、`answer`、`model`、`explain` 等の非公開情報が混入しないことをスナップショットテストで検証する(§12)

### 5.4 source・AST の互換性方針

- `Book.source` を原本、`Book.ast` を再生成可能な派生データとする
- `astVersion` は AST 構造のバージョン、`parserVersion` はパーサ実装のバージョンを表し、混同しない
- AST 生成に失敗した場合、既存の source・AST・version を更新しない
- パーサ更新時に既存ブックを一括再保存しない。新パーサで検証し、成功した場合のみ明示的な移行処理で採用する
- 旧 AST は移行完了まで保持する。移行に失敗した場合も、旧 source・`parserVersion`・`astVersion` から復旧できるようにする(保持方法は専用カラムまたは移行テーブルとし、実装時に決定する)
- `QuestionRevision` の `gradingHash` は、採点に影響するフィールド(§4.6)を正規化・直列化して計算する。本文表示のみの変更では変化させない

---

## 6. DB 設計(PostgreSQL)

### 6.1 モデル

``` text
User(id, loginId UNIQUE(lower), passwordHash, name, role enum(user,admin),
     suspendedAt?, deletedAt?, createdAt)
  -- アカウント削除時は行を物理削除せず、loginId・passwordHash・name を無効化して deletedAt を設定する(FK を維持)。loginId は NULL にして解放し、他のユーザーが再取得できる
Session(id, userId, tokenHash UNIQUE, expiresAt, revokedAt?, userAgent, createdAt, lastUsedAt)
RecoveryCode(id, userId, codeHash, usedAt?, createdAt)       -- codeHash はソルト付きハッシュ
RateLimit(key, windowStartedAt, count, lockedUntil?)         -- ログイン(ID+IP単位)・回復・check 等の試行制限

Book(id, ownerId→User, title, description, tags[], visibility
     enum(private,link,public,invite), shareTokenHash UNIQUE?, allowFork BOOL DEFAULT false,
     source TEXT, ast JSONB, astVersion INT, parserVersion TEXT, version INT,
     hiddenByAdmin BOOL, deletedAt?, forkedFromId→Book?, createdAt, updatedAt)
  -- title / description / tags はフロントマターから導出した非正規化値
BookVersion(id, bookId, version, source, parserVersion, astVersion, createdAt)   -- 履歴(直近50件。Attempt が参照するものは剪定しない)
BookEntityId(bookId, kind enum(question,blank), id, firstVersion, retiredVersion?)  -- 発行済みID台帳。退役済みIDの再利用検出に使う
QuestionRevision(id, bookId, questionId, revision INT, gradingHash,
                 gradingSnapshot JSONB, createdAt)
BookMember(bookId, userId, role enum(editor,viewer))
Asset(id, bookId, name, mime, size, storageKey, width, height)
  -- storageKey = ディレクトリ内の相対パス(例: books/{bookId}/{uuid}.webp)。ユーザー入力のファイル名は使わない

Attempt(id, bookId, bookVersion, userId?, guestTokenHash?, mode enum(practice,exam,review),
        status enum(in_progress,submitted,expired,abandoned),
        startedAt, deadlineAt?, finishedAt?,
        score NUMERIC(10,2), maxScore NUMERIC(10,2),
        settings JSONB,          -- seed、出題セット・順序、questionRevisions(questionId→revision)、オプション
        anonymizedAt?, createdAt, updatedAt)
Answer(id, attemptId, questionId, questionRevision, blankId?,
       value JSONB, correct BOOL?, points NUMERIC(6,2),
       selfGraded BOOL, checkedAt?, updatedAt)
Bookmark(userId, bookId, questionId?)      -- お気に入り・要復習
ShareResult(id, attemptId, tokenHash UNIQUE, expiresAt, revokedAt?, createdAt)
Report(id, bookId, reporterId, reason, status, createdAt, resolvedAt)
AdminAuditLog(id, adminUserId, action, targetType, targetId, reason?,
              metadata JSONB, createdAt)
```

- `Attempt.guestId` は廃止した。ゲストの資格情報は Attempt 単位の `guestTokenHash` のみで管理する(§7.6)
- `Attempt.userId` と `guestTokenHash` は、受験開始時はどちらか一方が必須。アカウント削除による匿名化後は両方 NULL となり `anonymizedAt` が設定される
- `Attempt.score` / `maxScore` は `NUMERIC(10,2)`。`points` 上限 1000 × 最大 2000 問 = 2,000,000 を保持するため(`NUMERIC(8,2)` では桁あふれする)
- `Answer.questionId` / `blankId` は §4.6 の不変IDを使う

### 6.2 Answer の保存粒度

- Answer は空欄単位の回答を基本とする
- `blankId IS NULL` は `single` / `multi` / `truefalse` / `essay` 等の設問単位回答を表す
- 1設問に複数空欄がある場合は空欄ごとに 1 レコード保存する
- `(attemptId, questionId, blankId)` の一意性を保証する(NULL の扱いに依存しない方式。§6.3)
- 途中保存は上記キーによる UPSERT とし、Attempt が `in_progress` であることを、Attempt 行のロック(`FOR SHARE`)を取ったトランザクション内で確認する
- 同一キーへの複数タブからの同時更新は最終書き込み優先とし、`updatedAt` を応答に含める
- 採点に使った設問リビジョンは `Answer.questionRevision` と `Attempt.settings.questionRevisions` から特定できる

### 6.3 一意制約・索引

- 一意制約: `lower(loginId)`、`(bookId, version)`(BookVersion)、`(bookId, userId)`(BookMember)、`(bookId, questionId, revision)`、`ShareResult.tokenHash`、`Book.shareTokenHash`、`Session.tokenHash`、`BookEntityId(bookId, kind, id)`
- `Answer` の一意性: PostgreSQL 15 以降は `UNIQUE NULLS NOT DISTINCT (attemptId, questionId, blankId)`、それ以前は `UNIQUE (attemptId, questionId, COALESCE(blankId, ''))` の式インデックス(または生成列 `answerKey`)で保証する。`Bookmark(userId, bookId, questionId)` も同様
- Prisma のスキーマで表現できない部分 UNIQUE・式インデックス・生成列は、SQL マイグレーションで定義する
- 索引: `Book(ownerId)`、`Book(visibility, updatedAt)`(公開ライブラリは `visibility = 'public' AND NOT hiddenByAdmin AND deletedAt IS NULL` の部分インデックス)、`Book` の `tags` に GIN
- 検索用:
  - 日本語検索は `pg_bigm` を第一候補とし、Docker イメージに拡張を同梱する。`GIN ((lower(title || ' ' || coalesce(description, ''))) gin_bigm_ops)` に対する `LIKE '%…%'` で検索する。難しい場合は `pg_trgm`(`gin_trgm_ops`)で代替
  - `to_tsvector` は日本語の分かち書きができないため使わない(`title || description` は description が NULL のとき全体が NULL になる点にも注意)
- 状態・期限・時系列: `Attempt(status, deadlineAt)`(期限切れ検索)、`Answer(attemptId)`、`AdminAuditLog(createdAt)`
- Book には `deletedAt` を追加し、論理削除を表現する

### 6.4 履歴・退役ID・リビジョンの運用

- `BookVersion` は直近 50 件を保持する。ただし Attempt(進行中、または結果を保持しているもの)が参照する `bookVersion` は剪定対象から除外する(過去 Attempt の問題文を結果画面で再現できなくなるのを防ぐため)。保存容量は受験結果の保持期間(§14)で管理する
- `PUT /books/:id` の保存時、ID の集合を前回と比較し、消えた ID は `BookEntityId.retiredVersion` を設定して退役させる。保存した source に退役済み ID が含まれていれば `QB-E011`
- バージョン復元は新しい `BookVersion` として保存する(過去 version への巻き戻しではない)。復元ソースに現行で退役済みの ID が含まれる場合は、同じ設問・空欄の復活として許可し `retiredVersion` を解除する。採点定義が退役時点から変わっていなければ旧リビジョンを継続し、変わっていれば新リビジョンを作る
- `QuestionRevision.gradingSnapshot` には、採点に必要な正解・Matcher・選択肢の正誤・`scoring`・`points`・空欄構成と重み・実効の `normalize` 設定を保持する。API では返さない(§7.9)

---

## 7. API(REST, `/api`)

### 7.1 エンドポイント一覧

#### ブック・アセット

| メソッド | パス | 内容 |
|----------|------|------|
| POST | `/books` | 作成(source を受け取り検証・AST化・ID書き戻し)。応答に確定済み source と version を含む |
| GET | `/books?mine=1&q=&tag=` | 一覧・検索(公開ライブラリは `public` かつ非 hidden・非削除のみ) |
| GET | `/books/:id` | 取得。owner / editor は source・AST、それ以外は `toPublic` 済みデータ |
| PUT | `/books/:id` | 更新(`expectedVersion` 必須。§7.3) |
| DELETE | `/books/:id` | 論理削除(§9) |
| POST | `/books/:id/fork` | 複製(画像も複製。可否は §3.5 / §7.2) |
| POST | `/books/validate` | 保存せず診断のみ |
| GET | `/books/:id/export?format=qb\|json\|zip` | 書き出し(owner / editor のみ) |
| GET | `/books/:id/versions` | 履歴一覧(owner / editor のみ) |
| POST | `/books/:id/versions/:version/restore` | 過去 version を新しい BookVersion として復元(§6.4) |
| POST | `/books/:id/assets` | 画像アップロード(multipart、サーバが検証してディレクトリへ保存) |
| GET | `/assets/:id` | 画像配信。ログイン済みでブックの閲覧権限がある場合、または `public` かつ非 hidden のブックのアセット |
| GET | `/s/:token/assets/:id` | 画像配信(共有リンク経由)。毎回、トークンの有効性とアセットの所属を確認 |
| GET | `/attempts/:id/assets/:assetId` | 受験中の画像配信。Attempt の資格情報で認可し、アセットが Attempt のブックに属することを確認(共有リンク失効後に継続する Attempt、`public` ブックのゲスト用) |
| GET | `/books/:id/stats` | 作者向け統計(匿名集計) |

#### 認証・アカウント

| メソッド | パス | 内容 |
|----------|------|------|
| POST | `/auth/signup` | ID+パスワードで登録(リカバリーコードを返す) |
| POST | `/auth/login` | ログイン(成功時に必ず新規セッショントークンを発行) |
| POST | `/auth/logout` | ログアウト(DB セッションを失効、Cookie 削除) |
| POST | `/auth/recover` | リカバリーコードによるパスワード再設定 |
| GET/DELETE | `/me` | 自分の情報取得・アカウント削除 |
| POST | `/me/password` | パスワード変更 |
| POST | `/me/recovery-codes` | リカバリーコード再生成 |
| GET | `/me/stats` | 学習統計 |
| GET | `/me/attempts` | 自分の受験履歴(ダッシュボード用) |
| GET/PUT/DELETE | `/me/bookmarks` | ブックマーク |

#### 共有

| メソッド | パス | 内容 |
|----------|------|------|
| PUT | `/books/:id/share` | 公開範囲変更・トークン再発行・`allowFork` 変更。`public`/`link` への変更は `copyrightConsent: true` 必須。`stopExistingAttempts` で既存 Attempt の停止を選択可 |
| GET | `/books/:id/members` | メンバー一覧 |
| POST/PATCH/DELETE | `/books/:id/members` | メンバー追加(ログインID指定)・ロール変更・削除 |
| GET | `/s/:token` | 共有リンクからの取得(`toPublic` 済み) |
| POST | `/s/:token/attempts` | ゲスト受験開始(`link` ブック。§7.6) |
| POST | `/attempts/:id/share` | 点数のみの結果共有リンク発行 |
| DELETE | `/attempts/:id/share` | 結果共有リンクの失効 |
| GET | `/r/:token` | 結果共有リンクの取得 |

#### 受験

| メソッド | パス | 内容 |
|----------|------|------|
| POST | `/books/:id/attempts` | 受験開始(出題セット・seed・`deadlineAt`・設問リビジョン対応表を生成)。ログインユーザー、または `public` ブックのゲスト(§7.6) |
| GET | `/attempts/:id` | 受験状態の取得(再開用) |
| PATCH | `/attempts/:id` | 回答の途中保存(`in_progress` のみ) |
| POST | `/attempts/:id/check` | 設問ごとの即時採点(練習・復習モードで、ブックが `practiceFeedback: true` の場合のみ) |
| POST | `/attempts/:id/submit` | 提出・採点(回答本文は受け取らず、保存済みの回答で採点。§7.5) |
| POST | `/attempts/:id/self-grade` | essay の自己採点(§7.5) |
| POST | `/attempts/:id/abandon` | 受験の中断 |
| GET | `/attempts/:id/result` | 結果・解説 |

#### 通報・管理

| メソッド | パス | 内容 |
|----------|------|------|
| POST | `/reports` | 通報 |
| GET/PATCH | `/admin/reports`、`/admin/reports/:id` | 通報の一覧・処理(admin) |
| PATCH | `/admin/books/:id/hide` | 管理者による非公開化(admin) |
| POST | `/admin/users/:id/temp-password` | 一時パスワード発行(admin) |
| PATCH | `/admin/users/:id/suspend` | ユーザー停止・解除(admin) |

管理者による非公開化・通報処理・一時パスワード発行・ユーザー停止は、すべて `AdminAuditLog` に記録する。パスワード・トークン等の秘密値はログに含めない。

### 7.2 認可マトリクス

| 操作 | owner | editor | viewer | 共有トークン保持者・`public` 閲覧者 |
|------|:-----:|:------:|:------:|:----------------------------------:|
| ブック閲覧(`toPublic`)・受験 | ✓ | ✓ | ✓ | ✓(ゲスト可) |
| source・AST 取得、履歴、export | ✓ | ✓ | ✗ | ✗ |
| 更新(PUT)・画像アップロード・履歴復元 | ✓ | ✓ | ✗ | ✗ |
| 作者向け統計 | ✓ | ✓ | ✗ | ✗ |
| 削除・共有設定・メンバー管理 | ✓ | ✗ | ✗ | ✗ |
| フォーク | ✓ | ✓ | `allowFork` 時のみ | `allowFork` 時のみ(要ログイン) |

- `link` ブックの有効トークン保持者は viewer 扱い。`invite` ブックは招待されたユーザーのみ。`private` は owner のみ(editor は招待メンバーとして存在する場合に限る)
- `hiddenByAdmin` または `deletedAt` が設定されたブックは、全ロールで新規閲覧・受験・編集を拒否する(管理者を除く)

### 7.3 Book 更新の競合制御

- `PUT /books/:id` は `expectedVersion` を必須とする
- DB 上の version と一致した場合のみ更新し、条件付き UPDATE 等で原子的に実施する
- 不一致時は `409 Conflict` と現在の version を返す。古い内容で上書きしてはならない
- 更新処理は「source 検証 → ID 確定 → AST 生成 → `BookEntityId` 更新 → `QuestionRevision` 生成 → Book 更新 → BookVersion 追加」を一つの DB トランザクションとして扱う
- **応答には ID 書き戻し済みの source と新しい version を含める**。クライアントはエディタ内容を応答の source で置き換え、以後の `expectedVersion` に新 version を使う。保存中に追記された編集がある場合は、応答 source へマージする(置き換えを怠ると、ID のない source が再送されて次の保存で ID が再採番される)

### 7.4 Attempt の状態遷移と期限

``` text
in_progress --提出成功--> submitted
     |
     +--期限到達-------> expired
     |
     +--ユーザー中断/管理操作--> abandoned
```

- `submitted`、`expired`、`abandoned` は終端状態とし、`in_progress` に戻さない
- 終端状態への PATCH / check は `409 Conflict` で拒否する。本番モードの `check` は `403`
- 期限判定はサーバ時刻を基準にする。`deadlineAt` を過ぎた PATCH / check は拒否する(猶予なし)
- **猶予**: `submit` に限り、`deadlineAt + SUBMIT_GRACE_SECONDS`(既定 5 秒)までは通信遅延として受け付け、`submitted` として確定する。猶予は提出要求の到達遅延のためのもので、新規回答の保存期限は延長しない
- **`expired` の確定**: 猶予を過ぎた `in_progress` は、(a) 当該 Attempt への次のアクセス時、または (b) 定期ジョブ(1 分間隔を目安)のいずれかで `expired` に遷移し、期限までにサーバへ保存された回答のみで採点して確定する。期限を過ぎてから届いた `submit` は、確定済みの `expired` 結果を返す
- `abandoned` は採点しない。統計・復習対象には含めない
- 制限時間のない Attempt は自動では期限切れにならない。ゲストは資格情報の有効期間(§7.6)で失効する

### 7.5 提出・自己採点

- `submit` は Attempt 行を `FOR UPDATE` でロックして状態を確認する(PATCH は `FOR SHARE`)。これにより submit と PATCH の競合は直列化される
- `submit` は回答本文を受け取らない。クライアントは未保存の回答を PATCH で送り終えてから `submit` を呼ぶ
- `in_progress` の場合だけ採点・確定する。`submitted` / `expired` の再送には確定済みの結果を返し、二重採点・二重加算をしない
- `Idempotency-Key` ヘッダを受け付け、同一キーの再送には同一結果を返す(状態による冪等性に加えた保険であり、省略可)
- **essay の自己採点**: 模範解答の開示後に限り、本人が `POST /attempts/:id/self-grade`(`questionId` と ◯/△/✕)で登録する。「開示後」とは、当該設問に `check` を実行済み(`Answer.checkedAt`)、または Attempt が終端状態(`submitted` / `expired`)であること。登録は essay の Answer の `selfGraded` と得点だけを更新し、設問得点を再計算して `Attempt.score` を再集計する。他の設問・回答本文は変更できず、`abandoned` では受け付けない。終端状態後も変更可能で、最後の値が有効

### 7.6 ゲスト受験

- ゲスト受験の入口:
  - `link` ブック: `POST /s/:token/attempts`
  - `public` ブック: `POST /books/:id/attempts`(未ログイン可)。共有トークンは `link` 公開時のみ有効なため、`public` には共有トークン経由の入口がない
- 開始時に Attempt 専用の 256bit 以上の乱数資格情報を発行し、HttpOnly Cookie で保持する。DB にはハッシュのみ保存する(`Attempt.guestTokenHash`)
- **Attempt ごとに Cookie を分ける**: Cookie 名は `qb_at_{attemptId}`、`Path=/api/attempts/{attemptId}` とする。単一のゲスト Cookie を新しい Attempt の開始で上書きしてはならず、複数 Attempt の同時進行が可能。Cookie は `Secure; HttpOnly; SameSite=Lax` とし、Domain は指定しない
- Path が `/api/attempts/{attemptId}` のため、サーバサイドレンダリングのページからは資格情報が見えない。ゲストのテスト画面は資格情報を要するデータをクライアントから API 経由で取得する
- 資格情報は当該 Attempt だけに使用でき、他 Attempt への流用を拒否する(Cookie の Path と、サーバ側の `attemptId` 照合の両方で保証)
- 資格情報の有効期間は `GUEST_ATTEMPT_TTL_DAYS`(既定 7 日)。終端状態の Attempt の Cookie はクライアントに削除を指示する(Cookie 数の増加を抑える)
- 資格情報が失効した Attempt は、状態を変更せず(`in_progress` のまま)放置する。失効後の復習・結果の再閲覧・履歴の復元に特別な処理は行わない。制限時間付きの Attempt が期限で `expired` になる遷移は §7.4 のとおり別途行われる
- localStorage には回答ドラフトと `attemptId` のみ保存し、資格情報は保存しない
- 以後の `PATCH` / `check` / `submit` / `self-grade` / `abandon` / `result` / `assets` は、この Cookie を持つ本人のみ許可する
- ゲスト受験の開始・check には IP 単位のレート制限を設ける

### 7.7 即時採点 `check`

- 受験開始画面(公開ブック・共有リンク・マイブック・エディタ)で練習モード / 本番モードを選択できる。本番モードでは受験中の `check` を行わない
- 結果画面からは、復習対象設問だけを `mode=review` で再受験できる(「間違えた N 問を復習する」)
- 練習・復習モードかつ `practiceFeedback: true` の場合のみ有効。本番モードでは `403`
- 応答は正誤・得点・満点・正解・解説・模範解答。正解を開示した設問は `Answer.checkedAt` を記録し、受験画面の回答欄をロックする
- 総当たり対策として、Attempt ごと・IP ごとにレート制限を設ける
- 応答の詳細は §7.9 に従う

### 7.8 共有リンクの失効

- トークン再発行・無効化・visibility 変更時は、旧トークンを即時無効化する
- 失効後は共有入口(`/s/:token`)、共有経由アセット(`/s/:token/assets/:id`)、新規ゲスト Attempt を拒否する
- 既に開始した Attempt は、Attempt 専用資格情報が有効で、終端状態でない場合に限り継続できる。継続中の Attempt の画像は `/attempts/:id/assets/:assetId` で配信する
- 所有者が「既存 Attempt も停止」(`stopExistingAttempts`)を選択した場合、対象 Attempt を `abandoned` に遷移させる
- `/s/:token/assets/:id` と `/assets/:id` は毎回、権限・トークン有効性・アセット所属を検証する。画像応答は `Cache-Control: private, no-cache`(再検証必須)とし、長期キャッシュで失効後も画像が閲覧できる状態を作らない(§9)

### 7.9 API レスポンスの秘密情報

- `/attempts/:id/check` は練習・復習モードの学習支援のため、正誤・得点・満点・正解・解説・模範解答を返す。本番モードでは利用できず、Attempt × IP のレート制限を設ける
- `/attempts/:id/result` は終端状態(`submitted` / `expired`)の Attempt に限り、設問ごとの正誤・得点・解説・模範解答に加えて**正解**を返す。`in_progress` と `abandoned` の Attempt には `409` を返す
- 結果画面に表示する正解は、Matcher をそのまま返さず `toResult` で表示用に整形した値とする
  - `exact`: 許容解答をすべて(作者の記述どおり)
  - `number`: `値 ± 許容誤差`
  - `regex`: パターン文字列をそのまま(仮決定)
  - `single` / `multi` / `truefalse` / 選択肢空欄: 正解の選択肢(複数可)
  - `essay`: 模範解答
- `gradingSnapshot` と内部採点情報は返さない
- 同一ブックを再受験すれば正解が既知になる点は許容する
- `toPublic` は許可リスト方式で構築し(§5.3)、`correct`、`answer`、`model`、`explain` 等の非公開情報が混入しないテストを行う

### 7.10 方針

- **正解の秘匿**: 受験用に配信するブックデータは §5.3 の `toPublic` を通したものとし、採点はサーバで行う。`explain` / `model` は `check`・`submit` 後にのみ返す。`check` は練習・復習モードに限り正解も返し、本番モードでは返さない
- **認可**: 全 API でロール判定(§7.2)を行う
- **入力検証・エラー応答**: リクエスト・レスポンスは Zod 等でサーバ側検証する。エラーは共通形式とし、内部スタックトレース・正解情報・秘密情報を含めない。ステータスは検証失敗 `400`、未認証 `401`、権限なし `403`、未存在 `404`、競合・状態不正 `409`、レート制限 `429`

---

## 8. 画面構成・利用機能

| パス | 画面 |
|------|------|
| `/` | LP・公開ライブラリ検索 |
| `/login` `/signup` | ログイン・新規登録(ID+パスワード、登録後にリカバリーコード表示) |
| `/dashboard` | マイブック、共有されたブック、学習履歴 |
| `/books/new` | 新規作成(テキスト貼付/ファイル/ZIP/テンプレート) |
| `/books/:id/edit` | エディタ(左:ソース、右:プレビュー、下:診断)。保存履歴・復元を含む |
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

### 利用機能の規則

- **復習対象**: 機械採点で不正解または部分点となった設問。essay は自己採点で「△」「✕」を選択した場合に復習対象とする。`abandoned` の Attempt は対象に含めない
- **未回答**: 未回答で提出した設問は不正解として扱い、結果画面で「未回答」と明示する
- **作者向け統計**: 「設問ID + 設問リビジョン」単位を基本とし、個人を特定できる情報を含めない。回答数が 5 件未満の集計は非表示とする(初期値)。「統合」は複数リビジョンを合算表示する操作、「リセット」は集計の起点日時を設定して表示対象を絞る操作であり、どちらも元データは変更・削除しない
- **PDF**: 「問題用」(解答欄を空欄化)と「解答用」(正解・解説を含む)の 2 種類を提供する。画像・表・数式は可能な限り分割を避けるが、ページに収まらない場合は分割を許容する。「解答用」は owner / editor のみ出力できる
- **バージョン履歴からの復元**: 過去 version への巻き戻しではなく、新しい BookVersion として保存する。ID 履歴との衝突は §6.4 のとおり検証する

---

## 9. セキュリティ・非機能要件

### XSS・描画

- パーサが Markdown を構造化 AST に変換し、HTML を通さない。描画側でも rehype-sanitize / DOMPurify を適用し、リンクは `rel="noopener noreferrer"`。CSP を設定する
- KaTeX は `trust: false` とし、`maxSize` / `maxExpand` を設定して過大な数式による負荷を防ぐ
- Markdown リンクの URL スキームは許可リストで検証する(`http` / `https` / `mailto`)。`javascript:`、`data:`、`vbscript:` 等は保存時に `QB-E012` で拒否する

### 画像(ローカルディレクトリ保存)

- 保存先は `UPLOAD_DIR`(Web 公開ディレクトリの外に置き、静的配信しない)。配信は `/assets/:id`、`/s/:token/assets/:id`、`/attempts/:id/assets/:assetId` のいずれかで権限確認し、`Cache-Control: private, no-cache`、`Referrer-Policy: no-referrer` を付ける
- ファイル名は UUID で生成、パストラバーサル対策(解決後のパスが `UPLOAD_DIR` 配下か検証)
- マジックナンバーで MIME 検証(png/jpeg/webp/gif)、サイズ(5MB/枚、ブック合計50MB)、SVG は拒否、再エンコードで EXIF 除去
- ブック削除・アカウント削除時にディレクトリ内ファイルも削除。DB と実ファイルの孤児を掃除する定期ジョブ
- フォーク時は画像ファイルを複製(元の削除の影響を受けない)
- Route Handlers で multipart を受ける際のボディサイズ上限を設定し、リバースプロキシ側(例: `client_max_body_size`)とも整合させる
- DB とファイルシステムの更新は原子的ではない。画像は一時領域に保存して検証し、DB コミット後に確定する。確定に失敗した一時ファイルは定期ジョブで回収する

### 外部画像URL

- 既定で禁止(`ALLOW_EXTERNAL_IMAGES=false`)。閲覧者の IP 漏洩・トラッキングを避けるため
- 許可する場合も `https` のみ、`referrerpolicy="no-referrer"`、CSP の `img-src` で制御し、診断 `QB-W002` を表示する

### ZIP 取り込み

- ZIP 自体のサイズ上限、エントリ数上限(例: 500)、展開後合計サイズ上限(例: 60MB)、圧縮率の上限(zip bomb 対策)
- エントリ名を正規化し、`..`・絶対パス・シンボリックリンク・許可外の拡張子(`.qb` `.md` `.txt` `.json` と png/jpeg/webp/gif 以外)を拒否
- メモリへ全展開せず、ストリームで検査しながら処理する
- 画像は通常のアップロードと同じ検証・再エンコードを通す

### 正規表現

ReDoS 対策として RE2 互換サブセットに限定する(パターン長・入力長の制限は §4.5)。サーバは `re2` で実行する。

### 認証・セッション・CSRF

- セッションはログイン成功時に必ず新規トークンを発行する(セッション固定対策)。ログアウト時は DB セッションを失効させ Cookie を削除する。パスワード変更・リカバリー時は全セッションを失効させる
- Cookie は `HttpOnly`、HTTPS 環境では `Secure` 必須、Domain は原則指定しない。セッションの有効期限は 30 日(操作で延長)
- CSRF: `SameSite=Lax`、CSRF トークンと Origin の完全一致検証を併用する。許可 Origin は環境設定の allowlist で管理し、`null` Origin を安易に許可しない。ゲスト API は Origin 検証と `SameSite=Lax` で守る
- パスワード: Argon2id のメモリ・反復回数・並列度を設定値として定義し、実機負荷試験で調整する。文字数だけでなくバイト数にも上限を設ける。ログに出力しない。ユーザー列挙対策としてログイン失敗メッセージは統一
- リカバリーコード: CSPRNG で十分なエントロピー(例: 12 文字 base32 = 60bit)で生成し、DB にはソルト付きハッシュを保存する。使用は 1 回限りで、使用済み更新とパスワード変更を同一トランザクションで行う。回復 API にも試行制限を設ける
- トークン類: 共有トークン・結果共有トークンは 128bit 以上、ゲスト資格情報とセッショントークンは 256bit 以上の乱数を使い、DB にはハッシュのみ保存する(高エントロピーなトークンは SHA-256 等で足りる。低エントロピーのリカバリーコードはソルト付きの低速ハッシュ)。結果共有トークンには有効期限・失効機能を設ける
- 共有トークンは `link` 公開時のみ有効、`noindex`
- レート制限: ログイン・登録・リカバリー・作成・採点 API・`check`・ゲスト受験開始(IP+ユーザー単位)。初期は単一プロセス前提でメモリまたは PostgreSQL テーブル(`RateLimit`)を使い、複数台構成にする際に Redis 等へ移行する

### 入力上限

- ソース 1MB、1 ブック最大 2000 問
- `points` / `w` は各 1000 まで(§4.5)
- 回答: 自由記述空欄 500 文字(数値空欄は 64 文字)、essay は 10,000 文字(仮決定。`ANSWER_MAX_CHARS` で設定)

### 削除・保持

- Book 削除は論理削除を基本とし、`deletedAt` を設定して新規閲覧・受験・編集を拒否する。`BOOK_RETENTION_DAYS`(既定 30 日)経過後に物理削除する
- User 削除時は認証情報(パスワード・セッション・リカバリーコード・メンバー関係・ブックマーク)を削除し、本人が owner のブックは論理削除する。本人の受験結果等は、他者のブックの統計に必要なため個人を識別できない形に匿名化して保持する(`Attempt.userId` を NULL にし `anonymizedAt` を設定)。具体的な保持期間は利用規約・プライバシーポリシーに明記する
- 個人回答は作者に非公開(匿名集計のみ)
- バックアップに残る削除済みデータは、バックアップの保持期間で自然に消滅する。この旨を規約に明記する

### 権利侵害・不適切コンテンツへの対応

- 利用規約と、権利侵害の申告窓口(`/report-abuse`)を設ける
- `public` / `link` への変更時に同意チェックを必須とする
- 通報 → 管理者確認 → 非公開化(`hiddenByAdmin`)の運用フローを定義し、処理履歴を `AdminAuditLog` に残す
- 関連法令に基づく手続き(削除依頼への対応期限など)は、公開前に法務面を確認する

### 性能・運用

- 性能: パース+プレビュー 1000 問で 200ms 以内(Web Worker 実行、デバウンス 300ms)、LCP 2.5s 以内
- バックアップ: DB 日次ダンプ + `UPLOAD_DIR` の日次差分バックアップ(rsync 等)を、本番サーバとは別の保管先に暗号化して保存する。初期運用目標は RPO 24 時間・RTO 8 時間。バックアップ失敗を監視・通知し、復元手順を文書化して定期的に復元テストを行う
- 監視: Sentry、構造化ログ。パスワード・トークン・回答内容・正解情報を送信しない(スクラブ設定)
- 設定値の一元管理: セキュリティ関連値、アップロード上限、Cookie 属性、レート制限、トークン長、`SUBMIT_GRACE_SECONDS`、`GUEST_ATTEMPT_TTL_DAYS`、`BOOK_RETENTION_DAYS` 等は一元管理し、コード内に散在させない

---

## 10. ディレクトリ構成(モノレポ)

```
/apps/web            Next.js アプリ
/packages/qb-parser  記法パーサ・AST型・採点ロジック・toPublic(単体テスト重視)
/packages/ui         共通UI
/prisma              schema.prisma, migrations(部分UNIQUE・式インデックス等の SQL マイグレーションを含む)
/data/uploads        画像保存ディレクトリ(既定。UPLOAD_DIR で変更、git管理外)
/docs                記法ドキュメント、サンプルブック
```

---

## 11. 開発フェーズ

見積りは、経験のある開発者1人がフルタイムで進める場合の目安。v0.3 で追加された範囲(設問リビジョン・退役ID台帳、Attempt 状態管理、ゲスト資格情報の Attempt 単位化、共有リンク失効、監査ログ、論理削除・匿名化)を反映して、v0.2 時点から見直した(要レビュー)。

0.  **記法の確定 (約1.5〜2週)**: 構文・エスケープ(§4.7)・生ソース解析方式(§4.8)・ID規則とリビジョン(§4.6)・採点規則(§4.5)・診断コードを確定し、ゴールデンテストのコーパスを先に作る。後から変更するとデータ移行が必要になるため、ここを固める
1.  **MVP (3〜4週)**: qb-parser(見出し/本文/空欄/選択肢/表)、貼付読み込み、プレビュー、受験・採点、localStorage 保存。MVP は端末内で完結するローカルモードで、採点はクライアント側で行う(§3.3 の「採点の正はサーバ」はフェーズ 2 から適用)
2.  **アカウント (3〜4週)**: ID/パスワード認証・リカバリーコード・セッション、ブック保存・一覧(`expectedVersion` による排他制御、ID 書き戻し、`QuestionRevision`、`BookEntityId`)、履歴、サーバ採点、`toPublic`、Attempt 状態管理・タイマー・冪等な提出、管理者最小機能(一時パスワード発行・`AdminAuditLog`)
3.  **リッチ要素 (2〜3週)**: 画像アップロード(ローカル保存)・ZIP(取り込み制限込み)、数式、複数選択、エクスポート
4.  **共有 (3〜4週)**: リンク共有(画像配信含む)、Attempt 単位のゲスト資格情報、共有リンク失効、招待、フォーク(`allowFork`)、公開ライブラリ、OGP、通報・管理
5.  **仕上げ (2〜3週)**: 統計、i18n、a11y、E2E、負荷試験、バックアップ復元テスト

合計の目安: 約15〜20週。

---

## 12. テスト方針

- **パーサ**: 記法ごとのゴールデンテスト、不正入力のファズ(診断が出てクラッシュしない)
  - 表内エスケープ、`\[[` と `&vert;` が Markdown に消費されないこと
  - Markdown コード領域・リンクURL・数式内部で QB記法が解釈されないこと、太字・斜体内部では解釈されること
  - ID 書き戻しの冪等性(2回保存しても変化しない)、自動設問の `{qid=..}` の書き戻し(段落・リスト項目・表の行)、削除済み ID が再利用されないこと
  - 診断コード QB-E001〜E012 がそれぞれ出ること
- **採点**:
  - 正規化・正規表現(RE2 非互換の拒否、大文字を含むパターン、入力長超過)
  - 数値空欄の負数・指数表記・負号異体字・桁区切りカンマ(`1,234` は可、`1,5` は不正解)・ゼロ許容誤差・境界値・NaN/Infinity・単位付き入力
  - 配点按分・`multi` の部分点の境界値・丸め(3 空欄の均等按分で全問正解時に満点と一致)
  - 採点定義の変更で `QuestionRevision` が作成され、過去 Attempt の結果が変化しないこと。`normalize` 変更時に自由記述を含む全設問のリビジョンが更新されること
  - essay の自己採点(終端状態後の更新、`abandoned` の拒否、スコア再集計)
  - 選択肢空欄の複数正解(`?` が複数付いた式、いずれか選択で正解、`\?` エスケープ、`?` 付きが 0 の式は自由記述空欄として扱われること)
- **`toPublic` / API レスポンス**: 正解・解説・模範解答・Matcher・`gradingSnapshot` が配信データと `check` 応答に含まれないこと、`result` は終端状態でのみ整形済みの正解を返し(`in_progress` / `abandoned` は `409`)Matcher・`gradingSnapshot` を含まないことをスナップショットで検証
- **DB・排他制御**: Answer の一意制約・UPSERT・同時更新、`Book.version` 競合(`409`)、DB ロールバック、PUT 応答の source で再保存しても ID が変わらないこと
- **Attempt**: 全状態遷移、期限境界(猶予内・猶予後)、`expired` の確定(アクセス時・ジョブ)、二重 submit、submit と PATCH の競合、複数タブ更新
- **ゲスト・共有**: Attempt 専用資格情報の他 Attempt への流用拒否、複数 Attempt の同時進行(Cookie の上書きがないこと)、共有リンク失効後の画像・新規受験の拒否と継続 Attempt の画像取得、`public` ブックのゲスト受験
- **認可**: ロール × API のマトリクス(§7.2。ゲスト Cookie の他人の attempt へのアクセス拒否、viewer の source 取得・export 拒否、`allowFork` の効き方を含む)
- **セキュリティ**: CSRF、Origin 不一致、URL スキーム拒否、セッション固定、リカバリーコード総当たり、ログイン試行制限(ID+IP)、管理者操作ログ
- **E2E(Playwright)**: 読込→受験→結果、共有リンク権限、ゲスト受験と画像表示、フォーク、タイマー期限、未ログイン制限
- **ZIP**: zip bomb、パストラバーサル、許可外拡張子の取り込み拒否

---

## 13. 将来拡張

YAML 形式のブック全体入力、AI による問題自動生成(PDF/ノート→ブック)、記述の AI 採点、間隔反復(SRS)による復習スケジューリング、チーム/クラス機能、PWA オフライン受験、音声・動画問題、外部画像のサーバ側取り込み(SSRF 対策込み)。

---

## 14. 要確認事項

レビューで確定した事項は §0 に記載した。以下は未解決の事項。

1. **受験結果の保持期間**: Attempt が参照する BookVersion の保持(§6.4)による容量増加、匿名化後の結果の保持期間、資格情報が失効して放置されたゲスト Attempt(§7.6)の扱い
2. **`allowFork` の既定値**: `public` ブックでフォークを既定で許可しないと、公開ライブラリで「他人のブックを元に作る」使い方がしにくい。正解開示との兼ね合い
3. **一時パスワード運用**: 管理者が本人確認をどう行うか(運用手順の定義が必要)

---

## 15. 実装上の注意

- 仕様にない曖昧な挙動はクライアント側で独自判断せず、サーバ側の規則に従う
- 設定値(セキュリティ関連値、上限、Cookie 属性、レート制限、トークン長)は一元管理する(§9)
- API の入力検証・エラー形式は §7.10 に従う。DB をそのまま外部公開しない
