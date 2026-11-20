# API(SPEC_v4 §7)

Next.js の Route Handler として実装しています(`apps/web/app/api/**`)。
すべて `nodejs` ランタイムで動作し、DB は Prisma 経由です。

- 認証: `qb_session` Cookie(HttpOnly / SameSite=Lax / 本番は Secure)。DB にはトークンの SHA-256 のみ保存
- ゲスト受験: `qb_guest` Cookie(Attempt 単位の資格情報と同じ扱い)
- 変更系は `Origin` ヘッダが付いている場合にホスト一致を要求(CSRF 対策)
- エラーは `{ error: { code, message, details? } }` に統一
- 採点の正はサーバ。未提出の応答に正解・解説は含めない(`toPublic` のみ)

## 認証

| メソッド | パス | 説明 |
| --- | --- | --- |
| POST | `/api/auth/register` | `{ loginId, password, name? }`。ID は 3〜40 文字の半角英数字と `_ . -`、パスワードは 8 文字以上。応答に `recoveryCodes`(10 個、この 1 回だけ) |
| POST | `/api/auth/login` | `{ loginId, password }`。IP + ID 単位で 15 分 10 回まで。`user.mustChangePassword` を返す |
| POST | `/api/auth/recover` | `{ loginId, code, newPassword, signIn? }`。リカバリーコードで再設定。成功で全セッション失効 |
| POST | `/api/auth/logout` | セッション失効 + Cookie 削除 |
| GET | `/api/auth/me` | `{ user, counts }`(未ログインは `user: null`) |
| PATCH | `/api/me` | `{ name }`。表示名の変更 |
| DELETE | `/api/me` | `{ password }`。退会(認証情報削除・所有ブックは論理削除・受験は匿名化) |
| POST | `/api/me/password` | `{ currentPassword, newPassword }`。他セッションは失効(自分のセッションは維持) |
| GET | `/api/me/recovery-codes` | `{ remaining, total }`。未使用コード数 |
| POST | `/api/me/recovery-codes` | `{ password }`。再発行(旧コードはすべて失効) |

- パスワードは scrypt(N=16384, r=8, p=1)でハッシュ化
- ログイン ID は `lower(loginId)` の一意索引で大文字小文字を区別しない
- 存在しない ID と誤パスワードは同じ応答(列挙を防ぐ)
- アカウント削除時は `loginId` を NULL にして解放する(§3.4)
- リカバリーコードは `XXXX-XXXX-XXXX`(base32 12 文字 = 60bit)。DB には scrypt ハッシュのみ保存し、使用は 1 回限り
- 管理者が発行した一時パスワード(`pnpm user:passwd … --temp`)は 24 時間で失効し、
  変更するまでブックの作成・保存は `403 password_change_required` になる

## ブック

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/api/books` | 自分のブック一覧(ソースは含めない) |
| POST | `/api/books` | `{ source, visibility?, allowFork? }` → 201。ID を書き戻した確定 source を返す |
| GET | `/api/books/[id]` | 所有者には `source`、他者には公開射影のみ |
| PUT | `/api/books/[id]` | `{ source, expectedVersion, visibility?, allowFork? }`。楽観ロック(不一致は 409) |
| DELETE | `/api/books/[id]` | 論理削除(30 日後に物理削除) |

保存時は `saveSource` で検証・ID 書き戻しを行い、エラーがあれば 422 `parse_failed` と診断コードを返します。
保存に成功すると次の台帳・履歴が更新されます。

- `BookEntityId`: 新規 ID の登録と、消えた ID の退役(再利用は QB-E011)
- `QuestionRevision`: **採点に影響する変更**があった設問だけ revision を増やす
- `BookVersion`: 更新前のソースと AST を保存(Attempt が参照する版は剪定しない)

## 公開ライブラリ・共有

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/api/books?scope=public&q=&tag=&cursor=&limit=` | 公開ライブラリの検索(非 hidden・非削除の `public` のみ) |
| GET | `/api/books?mine=1&q=&tag=` | 自分のブックの絞り込み |
| POST | `/api/books/[id]/share` | 共有リンク発行(`visibility = link` のときのみ)。応答は `{ token, path: "/s/<token>" }` |
| DELETE | `/api/books/[id]/share` | 共有リンクの失効 |
| POST | `/api/attempts/[id]/share` | 結果共有(点数のみ・既定 30 日) |
| DELETE | `/api/attempts/[id]/share` | 結果共有の失効 |
| POST | `/api/cron/expire` | 期限切れ Attempt の確定と孤児ファイルの回収(`x-cron-secret: $CRON_SECRET` 必須)。設定は [`operations.md`](./operations.md) |

画面:

| パス | 内容 |
| --- | --- |
| `/browse` | 公開ライブラリ(検索・タグ絞り込み・ページング) |
| `/b/[id]` | 公開ブックの詳細と受験開始(ゲスト可) |
| `/s/[token]` | 共有リンク経由の閲覧・受験(トークン必須。`noindex`) |
| `/r/[token]` | 結果共有(点数と受験日時のみ。`noindex`) |

- `visibility = link` のブックは、共有トークンが一致しない限り **取得も受験もできない**(§3.5)
- 共有トークンは DB に SHA-256 のみ保存し、平文は発行時の応答にだけ含める(再表示しない)
- 再発行すると以前のトークンは無効になる。失効後は 404
- 結果共有には解答内容・正解を含めない(点数のみ)

## 受験と採点

| メソッド | パス | 説明 |
| --- | --- | --- |
| POST | `/api/books/[id]/attempts` | `{ mode?, reviewOnly?, shareToken? }` → 201 `{ attemptId }`(`link` 公開は `shareToken` 必須) |
| GET | `/api/attempts/[id]` | 出題セット・公開 AST・保存済み回答。終端状態なら採点結果と正解表示 |
| PUT | `/api/attempts/[id]/answers` | `{ questionId, blankId?, value }`(設問単位でデバウンス保存) |
| POST | `/api/attempts/[id]` | `{ selfGrades? }` で提出・採点 |

- 出題順・選択肢順は `Attempt.settings.seed` で再現可能
- 期限(`timeLimit`)を過ぎた保存は拒否し、その場で期限切れとして採点・確定する(猶予 `SUBMIT_GRACE_SECONDS`)
- 空欄は `blankId` ごとに 1 行、選択肢・真偽・記述は `blankId = NULL` の 1 行
- 記述(essay)は提出時に自己採点(`full` / `half` / `none`)を取り込み、後から変更できる
- 正規表現の採点はサーバでは **RE2**(`re2`)で実行する(ReDoS 対策。`lib/regex.ts`)
- 期限切れのまま放置された受験は、取得(`GET /api/attempts/[id]`)した時点で `expired` として確定する
- 回答行には採点時の `questionRevision` を記録する

`value` の形:

| 種類 | 例 |
| --- | --- |
| 空欄 | `{ "text": "603" }`(選択肢空欄は選択肢インデックスを文字列で) |
| 選択肢 | `{ "choiceIds": ["c1", "c3"] }` |
| 真偽 | `{ "boolean": true }` |
| 記述 | `{ "text": "..." , "selfGrade": "full" }` |

## 学習(§7.1, §8)

| メソッド | パス | 内容 |
|----------|------|------|
| GET | `/api/me/attempts?bookId=&limit=` | 自分の受験履歴(得点・状態・日時) |
| GET | `/api/me/stats` | 学習統計(受験回数・平均正答率・直近 30 日) |
| GET/PUT/DELETE | `/api/me/bookmarks` | ブックマーク(`{ bookId, questionId? }` の追加・解除・一覧) |
| GET | `/api/books/:id/stats` | 作者向け統計(匿名集計。owner / editor) |

## 受験の操作(§7.4, §7.5, §7.7, §7.9)

| メソッド | パス | 内容 |
|----------|------|------|
| POST | `/api/attempts/:id/check` | 設問単位の即時採点。練習・復習モード + `practiceFeedback: true` のみ。正誤・得点・正解・解説・模範解答を返し、回答欄をロック |
| POST | `/api/attempts/:id/abandon` | 受験の中断(`abandoned`。採点しない) |
| POST | `/api/attempts/:id/self-grade` | essay の自己採点(`{ questionId, selfGrade: full\|half\|none }`)。開示後(要 check 済み or 終端状態)のみ |
| GET | `/api/attempts/:id/result` | 結果・正解・解説。`submitted` / `expired` のみ(他は 409) |

- `check` は Attempt × IP 単位で 10 分 120 回まで
- 中断・自己採点は Attempt の資格情報(ログイン or ゲスト Cookie)で認可する

## ブック管理(§3.3, §3.5, §7.1, §7.2)

| メソッド | パス | 内容 |
|----------|------|------|
| GET | `/api/books/:id/versions` | 保存履歴(owner / editor) |
| POST | `/api/books/:id/versions/:version/restore` | 過去の版を新しい版として復元(`{ expectedVersion }`) |
| POST | `/api/books/:id/fork` | 複製(画像も複製)。所有者・editor、または `allowFork` かつ public |
| POST | `/api/books/validate` | 保存せず診断のみ(`{ source }`)。ID 書き戻し後の source も返す |
| GET | `/api/books/:id/export?format=qb\|json\|zip` | 書き出し(owner / editor) |
| POST | `/api/books/import` | ZIP(本文 + 画像)から作成。multipart の `file` |
| GET/POST/PATCH/DELETE | `/api/books/:id/members` | 共同編集メンバー(追加・変更・削除は所有者のみ) |
| PUT | `/api/books/:id/share` | 公開範囲・`allowFork`・トークン再発行・既存受験の中断 |

- `PUT /api/books/:id/share` で `private` から `public` / `link` にするときは `copyrightConsent: true` が必須
- 公開範囲を変えると共有トークンは失効する(`regenerateToken: true` で同時に再発行)
- `stopExistingAttempts: true` で進行中の受験を `abandoned` にする
- ZIP 取り込みの上限: 20MB(圧縮後)/ 展開後 60MB / 500 エントリ / 圧縮率 100 倍。画像は必ず再エンコードして保存する
- `visibility=invite` のブックはメンバーだけが閲覧・受験できる

## 画像(§7.8, §9)

| メソッド | パス | 説明 |
| --- | --- | --- |
| POST | `/api/books/[id]/assets` | multipart(`file`)。所有者のみ。`{ asset: { id, name, markdown, ... } }` |
| GET | `/api/books/[id]/assets` | ブックのアセット一覧(所有者) |
| GET | `/api/books/[id]/assets/[assetId]` | 作者向け配信(エディタのプレビュー) |
| GET | `/api/assets/[id]` | `public` かつ非表示・非削除のブックのみ匿名配信 |
| GET | `/api/s/[token]/assets/[assetId]` | 共有リンク経由。毎回トークンと所属を検証 |
| GET | `/api/attempts/[id]/assets/[assetId]` | 受験中の配信。Attempt の資格情報で認可 |

- 受け付ける形式は PNG / JPEG / WebP / GIF のみ(マジックナンバーで判定)。**SVG は拒否**
- 1 枚 5MB、ブック合計 50MB。`sharp` で再エンコードし EXIF を除去、長辺 4000px を超える場合は縮小
- 保存先は `UPLOAD_DIR`(既定 `./data/uploads`、Web 公開ディレクトリ外)。ファイル名は UUID
- 配信応答は `Cache-Control: private, no-cache`、`Referrer-Policy: no-referrer`、`X-Content-Type-Options: nosniff`
- ソースでは `![alt](img:name){width=320}` と書き、保存時に `name → assetId` を解決する。未登録の名前は `QB-E005`

## 通報・管理(§7.1)

| メソッド | パス | 認可 | 内容 |
|----------|------|------|------|
| POST | `/api/reports` | ログイン | `{ bookId, reason }` で通報。同じ人の未処理の重複は 409 |
| GET | `/api/admin/reports?status=open\|reviewing\|resolved\|rejected\|all` | admin | 通報一覧(ブック・作者・通報者付き) |
| PATCH | `/api/admin/reports/:id` | admin | `{ status: "reviewing"\|"resolved"\|"rejected", reason? }` |
| PATCH | `/api/admin/books/:id/hide` | admin | `{ hiddenByAdmin: boolean, stopExistingAttempts?, reason? }` |
| PATCH | `/api/admin/users/:id/suspend` | admin | `{ suspended: boolean, reason? }` |
| GET | `/api/admin/audit?limit=50` | admin | 管理者操作ログ |

- 管理者の操作はすべて `AdminAuditLog` に記録する(パスワード・トークンは記録しない)
- `hiddenByAdmin` のブックは、作者を含む全員が閲覧・受験・編集できない(管理者のみ可)。公開ライブラリ・共有リンク・画像配信からも消える
- `stopExistingAttempts: true` を指定すると、進行中の受験を `abandoned` にする
- 停止(`suspendedAt`)されたユーザーは、ログインと API 利用ができない(既存セッションも失効)
- 管理者自身・他の管理者は停止できない

管理者の付与は `pnpm admin:grant <loginId>`(`--revoke` で解除)。手順は [`operations.md`](./operations.md)。

## レート制限

試行制限は DB の `RateLimit` に置き、複数プロセスでも共有されます(§9)。

| 対象 | 制限 |
| --- | --- |
| ログイン | IP + ID で 15 分 10 回、超過で 15 分ロック |
| 登録 | IP + ID 単位で 10 分 30 回 |
| ブック作成・受験開始・画像アップロード | IP 単位で 10 分 30 回 |

クライアント IP は `X-Real-IP` → `X-Forwarded-For`(先頭)の順で採用します。
リバースプロキシ側でこれらのヘッダーを上書きし、信頼できる値にしてください。

## 動作確認

```bash
pnpm dev                     # サーバ起動(別ターミナル)
pnpm e2e                     # 認証・ブック・受験・採点・空欄採点の E2E
```

`tools/e2e-api.ts` / `e2e-blanks.ts` / `e2e-share.ts` / `e2e-assets.ts` は実 DB に対して実行し、
終了時に作成したデータと画像ファイルを削除します。
