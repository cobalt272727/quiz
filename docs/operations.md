# 運用(定期実行とセキュリティ設定)

## 1. 定期実行(cron)

`POST /api/cron/expire` を定期的に呼びます。`x-cron-secret` ヘッダーが `CRON_SECRET` と一致する必要があります。

やること:

| 処理 | 内容 |
| --- | --- |
| 期限切れ Attempt の確定 | `deadlineAt + SUBMIT_GRACE_SECONDS` を過ぎた `in_progress` を最大 200 件まで採点し `expired` にする |
| 孤児ファイルの回収 | 一時ファイル(1 時間経過)、DB に行が無い画像ディレクトリ、`BOOK_RETENTION_DAYS`(既定 30 日)を過ぎた論理削除ブックの画像を削除 |

応答: `{ "expired": 3, "removedFiles": 1 }`

### 1.1 Linux(crontab)

```cron
# 5 分ごと。CRON_SECRET は /etc/environment などで渡す
*/5 * * * * curl -fsS -X POST -H "x-cron-secret: ${CRON_SECRET}" https://example.com/api/cron/expire > /var/log/qb-cron.log 2>&1
```

crontab は環境変数を引き継がないため、`/etc/cron.d/qb` に書く場合は次のように値を直接指定します。

```cron
SHELL=/bin/sh
*/5 * * * * root curl -fsS -X POST -H "x-cron-secret: <シークレット>" https://example.com/api/cron/expire
```

### 1.2 systemd timer(推奨)

`/etc/systemd/system/qb-expire.service`

```ini
[Unit]
Description=Quiz book periodic maintenance
After=network-online.target

[Service]
Type=oneshot
EnvironmentFile=/etc/qb/env
ExecStart=/usr/bin/curl -fsS -X POST -H "x-cron-secret: ${CRON_SECRET}" http://127.0.0.1:3000/api/cron/expire
```

`/etc/systemd/system/qb-expire.timer`

```ini
[Unit]
Description=Run quiz book maintenance every 5 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
AccuracySec=30s

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl enable --now qb-expire.timer
systemctl list-timers qb-expire.timer
```

### 1.3 Windows(タスクスケジューラ)

```powershell
$action  = New-ScheduledTaskAction -Execute "curl.exe" `
  -Argument '-fsS -X POST -H "x-cron-secret: <シークレット>" http://localhost:3000/api/cron/expire'
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName "qb-expire" -Action $action -Trigger $trigger -RunLevel Highest
```

### 1.4 コンテナ

cron 入りのサイドカー、またはホストの systemd timer から `docker exec` で叩くのが簡単です。
Kubernetes なら `CronJob`、Vercel なら Cron Jobs に `/api/cron/expire` を登録します。

### 1.5 cron が止まっても壊れないようにしてある

- 回答保存・提出時に期限を判定し、超過していればその場で `expired` として採点します
- 受験画面を開いた時点でも期限切れを確定します(`loadPlayState`)
- そのため cron の遅延は「放置された受験の確定が遅れる」「ディスクが少し残る」程度で済みます

### 1.6 監視の目安

- HTTP 200 以外が続く → シークレット相違(403)か DB 接続断
- `expired` が増え続ける → `timeLimit` の設計かクライアントの自動提出が動いていない
- `removedFiles` が増え続ける → アップロード失敗時の一時ファイルが残っている

## 2. 正規表現エンジン(RE2)

サーバ採点の `[[/正規表現/]]` は **RE2**(`re2` パッケージ)で実行します(`apps/web/lib/regex.ts`)。

- JavaScript の `RegExp` はバックトラック方式で、`(a+)+$` のようなパターンと長い入力で計算量が爆発する(ReDoS)
- RE2 は入力長に対して線形時間。作者が書いたパターンはユーザー入力なので、サーバ側は必ずこちらを使う
- 保存時点で RE2 互換サブセット(後方参照・先読み・後読み・原子グループ等を禁止)と長さ上限(パターン 200 / 入力 500 文字)を検証している
- クライアントのプレビューは従来どおり `RegExp`(作者自身のブラウザで完結するため)

実測(`pnpm e2e` の一部): `[[/(a+)+$/]]` に 40 文字の `a` + 不一致文字を当てて、採点が 400ms 未満で完了します。
JS の `RegExp` では同じ入力で事実上停止します。

### 2.1 ネイティブモジュールが使えない環境

`re2` はビルド済みバイナリを使いますが、無いプラットフォームでは node-gyp が必要です。
導入できない場合は次のどれかを選びます。

1. `re2-wasm` に差し替える(`lib/regex.ts` の実装だけ変更)
2. 正規表現空欄を無効化し、完全一致・数値のみ許可する
3. サブセット検証と長さ上限だけで運用する(リスクは残る)

`next.config.ts` の `serverExternalPackages` に `re2` / `sharp` / `@prisma/client` を指定しています。
バンドルするとネイティブバイナリを読み込めません。

## 3. 環境変数

| 変数 | 既定 | 用途 |
| --- | --- | --- |
| `DATABASE_URL` | — | PostgreSQL 接続先 |
| `SHADOW_DATABASE_URL` | — | `prisma migrate dev` 用(権限が無い場合) |
| `UPLOAD_DIR` | `./data/uploads` | 画像の保存先(Web 公開ディレクトリ外) |
| `CRON_SECRET` | — | cron の呼び出し認証。**本番では必須** |
| `SESSION_TTL_DAYS` | `30` | セッション有効期限 |
| `SUBMIT_GRACE_SECONDS` | `5` | 期限直前の送信猶予 |
| `GUEST_ATTEMPT_TTL_DAYS` | `7` | ゲスト資格情報の Cookie 期限 |
| `BOOK_RETENTION_DAYS` | `30` | 論理削除ブックの保持期間 |
| `ANSWER_MAX_CHARS` | `10000` | 記述回答の上限 |
| `ALLOW_EXTERNAL_IMAGES` | `false` | 外部画像 URL の許可 |

## 4. 管理者(通報対応)

### 4.1 管理者の付与

```bash
pnpm admin:grant admin        # 管理者にする
pnpm admin:grant admin --revoke  # 一般ユーザーに戻す
```

付与後はナビに「管理」(`/admin`)が現れます。通報の処理・ブックの非公開化・ユーザー停止・操作ログの確認ができます。

### 4.2 運用フロー

1. 利用者が公開ブックの「このブックを通報する」から通報(ログイン必須・1 時間 10 件まで)
2. 管理者が `/admin` で内容を確認し「対応中」にする
3. 問題があれば「非公開にする」。必要なら「開始済みの受験も中断する」を有効にする
4. 処理後「解決」または「却下」にする(未処理の通報だけが一覧の既定になる)

### 4.3 非公開化・停止の効果

| 対象 | 効果 |
| --- | --- |
| ブック(`hiddenByAdmin`) | 公開ライブラリ・共有リンク・画像配信・受験・作者の編集をすべて拒否(管理者のみ可)。解除すると元の公開範囲に戻る |
| ユーザー(`suspendedAt`) | ログイン不可・API 利用不可・既存セッション失効。解除すると再びログインできる |

管理者自身と他の管理者は停止できません(ロックアウト防止)。操作はすべて `AdminAuditLog` に残り、`/admin` の下部と `GET /api/admin/audit` で確認できます。

### 4.4 パスワードを忘れた利用者への対応

メールアドレスを使わないため、パスワードは復旧できません(平文は保存していません)。次の 2 経路があります。

1. **本人がリカバリーコードで再設定**(`/recover`)。登録時に発行した 10 個のコードのうち未使用のものを使う
2. **管理者が一時パスワードを発行**(本人確認のうえ)

```bash
pnpm user:passwd <loginId> <一時パスワード> --temp
```

- 一時パスワードは **24 時間で失効**し、ログイン後に `/settings` で変更するまでブックの作成・保存を拒否します
- 発行すると既存セッションはすべて失効します
- 変更後のパスワードは本人に任せてください(管理者が把握する必要はありません)

通常のパスワード再設定(本人からの申し出で一時的に上書きする場合):

```bash
pnpm user:passwd <loginId> <新しいパスワード>
```

### 4.5 退会の扱い

利用者が `/settings` から退会すると、認証情報(パスワード・セッション・リカバリーコード)を削除し、
所有ブックは論理削除、受験結果は `Attempt.userId = NULL` + `anonymizedAt` で匿名化されます。
ログイン ID は解放され、同じ ID を第三者が取得できます。復元はできません。

### 4.6 停止・非公開の解除忘れに注意

- 非公開化は `visibility` を変えないため、解除すると元の公開範囲に戻ります
- 停止したユーザーのブックは残ります。非公開にしたい場合は別途ブックを指定してください

## 5. バックアップ

- DB は `pg_dump` を日次で取得
- `UPLOAD_DIR` は DB と同じタイミングで取得(画像は DB と独立しているため、ずれても孤児になるだけで壊れない)
- 復元時は DB → ファイルの順に戻し、`/api/cron/expire` を 1 回叩いて孤児を掃除する
