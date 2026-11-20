# 本番運用ガイド(Ubuntu + nginx)

このドキュメントは、開発環境(`pnpm dev`)で動いている「問題ブック」を、
Ubuntu サーバー上で nginx の背後に置いて公開するまでの手順をまとめたものです。

- 対象: Ubuntu Server 22.04 LTS / 24.04 LTS(x86_64 または arm64)
- 構成: nginx(443)→ Next.js(127.0.0.1:3100)→ PostgreSQL 16(ローカルまたは別ホスト)
- 前提: ドメインを取得済みで、A/AAAA レコードをサーバーに向けてある
- 単一サーバー構成を基本にし、水平分割が必要になったときの注意点を §12 にまとめる

---

## 1. 全体像

```
インターネット
   │ 443 (TLS 終端 / HTTP→HTTPS リダイレクト)
   ▼
nginx ── /_next/static, /og.png … 静的配信(キャッシュ)
   │     それ以外            … proxy_pass http://127.0.0.1:3100
   ▼
next start (systemd: qb-web)  ── scrypt 認証・採点・画像配信
   │
   ├─ PostgreSQL 16 (127.0.0.1:5432)
   └─ /srv/qb/data/uploads   (アップロード画像。永続ボリューム)
```

必要なポート: 22(SSH)、80、443 のみ。3100 と 5432 は外部に公開しない。

---

## 2. サーバーの初期設定

```bash
# root または sudo 可能なユーザーで実行
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl ca-certificates git ufw fail2ban unzip

# タイムゾーン(ログと受験期限の判定に影響する)
sudo timedatectl set-timezone Asia/Tokyo

# ファイアウォール
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
sudo ufw status

# 自動セキュリティ更新
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

### 2.1 Node.js 22 LTS と pnpm

```bash
# NodeSource のリポジトリを使う(Node 22 = 本リポジトリの engines と一致)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # v22.x
corepack enable
corepack prepare pnpm@10 --activate   # 本リポジトリは pnpm を使用
pnpm -v
```

> `sharp` と `re2` はネイティブモジュール。ビルド済みバイナリが無い環境では
> `sudo apt install -y build-essential python3` を追加する。

### 2.2 PostgreSQL 16

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql

sudo -u postgres psql <<'SQL'
CREATE ROLE qb LOGIN PASSWORD 'ここに強いパスワード';
CREATE DATABASE qb OWNER qb ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0;
CREATE DATABASE qb_shadow OWNER qb;
SQL
```

`pg_trgm` 拡張はマイグレーション内で作成される(拡張の作成には DB の所有者権限が必要)。
外部のマネージド PostgreSQL を使う場合も、`CREATE EXTENSION` が可能かを確認しておく。

---

## 3. アプリケーションの配置

```bash
sudo adduser --system --group --home /srv/qb qb
sudo -u qb -H bash -lc '
  cd /srv/qb
  git clone https://github.com/cobalt272727/quiz.git app
'
```

ディレクトリ構成:

```
/srv/qb/
├── app/              リポジトリ(リリースごとに切り替える場合は releases/ 方式へ)
├── data/uploads/     アップロード画像(バックアップ対象)
├── shared/.env       環境変数(600。リポジトリに含めない)
└── backups/          pg_dump の出力先
```

**すべてのディレクトリを先に作る**(`shared` を作り忘れると §4 の `tee` が
`No such file or directory` で失敗する):

```bash
sudo -u qb mkdir -p /srv/qb/shared /srv/qb/data/uploads /srv/qb/backups
sudo -u qb chmod 700 /srv/qb/shared /srv/qb/data/uploads /srv/qb/backups
sudo ls -ld /srv/qb /srv/qb/shared /srv/qb/data/uploads /srv/qb/backups
```

---

## 4. 環境変数(`/srv/qb/shared/.env`)

```ini
NODE_ENV=production
DATABASE_URL="postgresql://qb:パスワード@127.0.0.1:5432/qb?schema=public"
APP_URL="https://quiz.example.com"
OPERATOR_NAME="問題ブック運営"

UPLOAD_DIR="/srv/qb/data/uploads"
SESSION_TTL_DAYS=30
SUBMIT_GRACE_SECONDS=5
GUEST_ATTEMPT_TTL_DAYS=7
BOOK_RETENTION_DAYS=30
ANSWER_MAX_CHARS=10000
ALLOW_EXTERNAL_IMAGES=false

CRON_SECRET="下記で生成した 32 バイトの乱数"
```

```bash
# シークレットを生成して控える(64 文字の 16 進)
openssl rand -hex 32

# 上の値を CRON_SECRET に、DB のパスワードを DATABASE_URL に入れて書き込む。
# ヒアドキュメント内は変数展開されないため、実際の値に置き換えてから実行する。
sudo -u qb tee /srv/qb/shared/.env >/dev/null <<'EOF'
NODE_ENV=production
DATABASE_URL="postgresql://qb:DBのパスワード@127.0.0.1:5432/qb?schema=public"
APP_URL="https://quiz.example.com"
OPERATOR_NAME="問題ブック運営"

UPLOAD_DIR="/srv/qb/data/uploads"
SESSION_TTL_DAYS=30
SUBMIT_GRACE_SECONDS=5
GUEST_ATTEMPT_TTL_DAYS=7
BOOK_RETENTION_DAYS=30
ANSWER_MAX_CHARS=10000
ALLOW_EXTERNAL_IMAGES=false

CRON_SECRET="openssl rand -hex 32 の出力"
EOF

sudo chown qb:qb /srv/qb/shared/.env
sudo chmod 600 /srv/qb/shared/.env

# 確認(所有者・権限・中身)
sudo ls -l /srv/qb/shared/.env
sudo -u qb cat /srv/qb/shared/.env
```

| 変数                      | 役割                      | 本番での注意                                                     |
| ------------------------- | ------------------------- | ---------------------------------------------------------------- |
| `DATABASE_URL`          | PostgreSQL 接続           | `127.0.0.1` を指定し、外部公開しない                           |
| `APP_URL`               | OGP・canonical の絶対 URL | **必ず本番の https URL**。誤ると共有カードのリンクが壊れる |
| `UPLOAD_DIR`            | 画像の保存先              | systemd の `ReadWritePaths` と一致させる                       |
| `CRON_SECRET`           | 回収 API の認証           | 既定値のままにしない                                             |
| `ALLOW_EXTERNAL_IMAGES` | 外部画像の許可            | 既定 `false`(SSRF・トラッキング対策)                           |

---

## 5. ビルドとマイグレーション

```bash
sudo -u qb -H bash -lc '
  cd /srv/qb/app
  pnpm install --frozen-lockfile
  pnpm --filter @qb/parser build || true      # 型生成が必要な場合のみ
  pnpm db:generate
  pnpm db:deploy                              # prisma migrate deploy
  pnpm db:verify                              # PGlite でスキーマを照合(任意)
  pnpm build
'
```

- `db:deploy` は**既存データを消さない**。`migrate dev` / `migrate reset` は本番で使わない。
- 初回はマイグレーション 4 本(`init` → `constraints` → `guest_token_multi` → `account_self_service`)が順に適用される。
- 管理者を作る:

```bash
sudo -u qb -H bash -lc 'cd /srv/qb/app && pnpm user:passwd admin "初期パスワード" && pnpm admin:grant admin'
```

---

## 6. systemd ユニット

`/etc/systemd/system/qb-web.service`:

```ini
[Unit]
Description=QB Markup web (Next.js)
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=qb
Group=qb
WorkingDirectory=/srv/qb/app/apps/web
EnvironmentFile=/srv/qb/shared/.env
Environment=PORT=3100
Environment=HOSTNAME=127.0.0.1
ExecStart=/usr/bin/env pnpm exec next start -p 3100 -H 127.0.0.1
Restart=always
RestartSec=3
TimeoutStopSec=20
KillSignal=SIGTERM

# 権限の最小化
NoNewPrivileges=true
PrivateTmp=true
PrivateDevices=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
RestrictNamespaces=true
LockPersonality=true
MemoryDenyWriteExecute=false
ReadWritePaths=/srv/qb/data/uploads /srv/qb/app/apps/web/.next/cache
UMask=0077

[Install]
WantedBy=multi-user.target
```

> `next start` はビルド済みの `.next` を配信する。ビルドは `apps/web` で行われるため
> `WorkingDirectory` を `apps/web` にしている。

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now qb-web
sudo systemctl status qb-web
curl -sI http://127.0.0.1:3100/api/books?scope=public | head -3
```

`MemoryDenyWriteExecute=true` は V8 の JIT が使えず起動に失敗するため `false` にしている。

---

## 7. nginx

`/etc/nginx/sites-available/qb.conf`:

```nginx
# HTTP → HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name quiz.example.com;

    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name quiz.example.com;

    ssl_certificate     /etc/letsencrypt/live/quiz.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/quiz.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    # 画像アップロードは 5MB まで。JSON は 2MB 上限。余裕を見て 12m
    client_max_body_size 12m;
    client_body_timeout 60s;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;

    # 静的ファイルは Next.js がハッシュ付きで配信するため長期キャッシュ
    location /_next/static/ {
        proxy_pass http://127.0.0.1:3100;
        proxy_cache_valid 200 365d;
        add_header Cache-Control "public, max-age=31536000, immutable";
        access_log off;
    }

    location /og.png {
        proxy_pass http://127.0.0.1:3100;
        add_header Cache-Control "public, max-age=86400";
    }

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "";
        proxy_read_timeout 90s;
        proxy_send_timeout 90s;
        proxy_buffering off;
    }
}
```

> **重要**: `X-Real-IP` と `X-Forwarded-For` は nginx で上書きする。アプリの試行制限は
> このヘッダーを信頼するため、クライアントが送ってきた値を通すと制限を回避される(§9)。

```bash
sudo ln -s /etc/nginx/sites-available/qb.conf /etc/nginx/sites-enabled/qb.conf
sudo nginx -t && sudo systemctl reload nginx
```

### 7.1 TLS 証明書

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d quiz.example.com --redirect --agree-tos -m you@example.com
sudo systemctl list-timers | grep certbot   # 自動更新の確認
```

証明書発行の前に、上記の 80 番 `server` ブロックだけを有効にしておくと取得しやすい。

---

## 8. 定期実行(cron)

期限切れ Attempt の確定、孤立画像の回収、保持期間を過ぎたブックの物理削除は
`POST /api/cron/expire` が行う。

`/etc/cron.d/qb-expire`:

```cron
# 10 分ごとに回収ジョブを実行
*/10 * * * * qb curl -fsS -X POST -H "x-cron-secret: $(grep -oP '(?<=^CRON_SECRET=").*(?="$)' /srv/qb/shared/.env)" http://127.0.0.1:3100/api/cron/expire >/dev/null 2>&1
```

`$(...)` は cron では展開されないため、実際には次のいずれかを使う。

**A. シークレットを別ファイルに置く(推奨)**

```bash
sudo -u qb sh -c 'grep -oP "(?<=^CRON_SECRET=\").*(?=\"$)" /srv/qb/shared/.env > /srv/qb/shared/cron-secret'
sudo chmod 600 /srv/qb/shared/cron-secret
```

```cron
*/10 * * * * qb curl -fsS -X POST -H "x-cron-secret: $(cat /srv/qb/shared/cron-secret)" http://127.0.0.1:3100/api/cron/expire >/dev/null 2>&1
```

**B. systemd timer(ログが journald に残る)**

`/etc/systemd/system/qb-expire.service`:

```ini
[Unit]
Description=QB Markup expire job

[Service]
Type=oneshot
User=qb
ExecStart=/usr/bin/curl -fsS -X POST -H "x-cron-secret: SEKRET" http://127.0.0.1:3100/api/cron/expire
```

`/etc/systemd/system/qb-expire.timer`:

```ini
[Unit]
Description=Run QB expire every 10 minutes

[Timer]
OnCalendar=*:0/10
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now qb-expire.timer
systemctl list-timers qb-expire.timer
```

> 期限切れは受験画面の読み込み時にも確定するため、cron が止まっても受験は破綻しない。
> cron は「放置されたデータの掃除」と「統計の整合」のための保険と位置づける。

---

## 9. バックアップと復元

### 9.1 取得

`/srv/qb/bin/backup.sh`(実行権限 750、所有者 qb):

```bash
#!/usr/bin/env bash
set -euo pipefail
STAMP=$(date +%Y%m%d-%H%M%S)
OUT=/srv/qb/backups
# 1) DB
pg_dump --no-owner --clean --if-exists -Fc "$DATABASE_URL" > "$OUT/qb-$STAMP.dump"
# 2) 画像(増分ではなく tar。容量が問題になったら restic 等へ)
tar -C /srv/qb -czf "$OUT/uploads-$STAMP.tar.gz" data/uploads
# 3) 世代管理(14 日)
find "$OUT" -type f -mtime +14 -delete
```

```cron
30 3 * * * qb /srv/qb/bin/backup.sh >> /srv/qb/backups/backup.log 2>&1
```

`DATABASE_URL` は systemd の `EnvironmentFile` を読むか、`PGPASSWORD` を
`/srv/qb/shared/.pgpass`(600)に置く。外部ストレージ(S3 等)への転送は別途設定する。

### 9.2 復元テスト(四半期に 1 回)

```bash
# 別 DB に復元して起動確認する。本番 DB を直接上書きしない
sudo -u postgres createdb qb_restore
pg_restore --no-owner -d "postgresql://qb:パスワード@127.0.0.1:5432/qb_restore" /srv/qb/backups/qb-YYYYMMDD-HHMMSS.dump
DATABASE_URL="postgresql://qb:パスワード@127.0.0.1:5432/qb_restore?schema=public" pnpm db:verify
sudo -u postgres dropdb qb_restore
```

復元手順は「復元できること」を確認するまで完了としない。

---

## 10. リリース手順(更新)

```bash
# 1) 事前確認
sudo -u qb -H bash -lc 'cd /srv/qb/app && git fetch --all && git log --oneline HEAD..origin/main'

# 2) ビルド(サービスは稼働したまま)
sudo -u qb -H bash -lc '
  cd /srv/qb/app
  git pull --ff-only
  pnpm install --frozen-lockfile
  pnpm db:generate
  pnpm verify            # test + typecheck + db:verify + build
'

# 3) マイグレーション(後方互換な変更のみ自動適用。破壊的変更は手順を分ける)
sudo -u qb -H bash -lc '
  set -a; . /srv/qb/shared/.env; set +a
  cd /srv/qb/app
  pnpm db:deploy
'

# 4) 再起動
sudo systemctl restart qb-web
sudo systemctl status qb-web --no-pager
curl -fsS https://quiz.example.com/api/books?scope=public >/dev/null && echo "healthy"
```

ロールバック:

```bash
sudo -u qb -H bash -lc 'cd /srv/qb/app && git checkout <前のコミット> && pnpm install --frozen-lockfile && pnpm db:generate && pnpm build'
sudo systemctl restart qb-web
```

破壊的なマイグレーション(列削除・型変更)を含む場合は、
`releases/` 方式(リリースごとにディレクトリを分け、`current` シンボリックリンクを切り替える)
か、メンテナンス時間を設けて `pg_dump` を取得してから適用する。

---

## 11. 監視・運用チェックリスト

```bash
journalctl -u qb-web -f                 # アプリログ
tail -f /var/log/nginx/access.log /var/log/nginx/error.log
sudo systemctl status qb-web nginx postgresql
df -h /srv/qb                            # 画像とバックアップの容量
```

- [ ] `curl -fsS https://ドメイン/api/books?scope=public` が 200
- [ ] `https://ドメイン/og.png` が 200 で画像が返る
- [ ] 共有リンク付きブックが `/s/<token>` で開ける
- [ ] ログイン → ブック作成 → 受験 → 提出 → 結果表示が一通り動く
- [ ] 管理画面 `/admin` が開き、通報一覧が見える
- [ ] `pnpm user:passwd` で管理者のパスワードを再設定できる
- [ ] `cron` / timer が 10 分おきに走り、`journalctl` か `cron.log` にエラーが無い
- [ ] バックアップが取得され、復元テストを実施済み
- [ ] `fail2ban` が SSH の総当たりを遮断している(`sudo fail2ban-client status sshd`)
- [ ] ディスク使用率が 80% 未満

### 11.1 ユーザー対応

```bash
# パスワード再設定(平文は保存していないため、これが唯一の復旧手段)
pnpm user:passwd <loginId> <新しいパスワード>

# 管理者発行の一時パスワード(24 時間で失効、ログイン後に変更を強制)
pnpm user:passwd <loginId> <一時パスワード> --temp

# 停止の解除
pnpm user:passwd <loginId> <新しいパスワード> --unsuspend

# 管理者権限の付与・剥奪
pnpm admin:grant <loginId>
pnpm admin:grant <loginId> --revoke
```

一時パスワードを発行したら、本人に安全な経路で伝え、ログイン後に
`/settings` で自分のパスワードへ変更してもらう(変更するまでブックの作成・保存はできない)。

---

## 12. 水平分割する場合の注意

- **試行制限**は `RateLimit` テーブルで共有されるため、複数台でも一貫する。
- **画像**はローカルディスクにあるため、複数台構成では共有ストレージ(S3 等)へ移すか、
  アップロード先を固定する(未対応。移行時は `lib/assets.ts` の保存先を差し替える)。
- **cron** は 1 台からのみ実行する(全台で実行すると無駄な競合が増える。処理自体は冪等)。
- セッションは DB にあるため、ロードバランサでスティッキーにする必要はない。

---

## 13. トラブルシューティング

| 症状                           | 確認点                                                                                                          |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| 502 Bad Gateway                | `systemctl status qb-web`、`journalctl -u qb-web -n 100`、ポート 3100 の待受                                |
| ログインで 429                 | 試行制限。`RateLimit` テーブルの該当キーを削除するか、時間を置く                                              |
| 画像が 404                     | `UPLOAD_DIR` のパスと systemd の `ReadWritePaths`、`uploads/books/<bookId>/` の存在                       |
| 画像アップロードが 413         | nginx の `client_max_body_size`(12m 以上)                                                                     |
| OGP の URL が localhost        | `.env` の `APP_URL` が本番 URL か。変更後は再起動が必要                                                     |
| 共有カードが出ない             | `/b/<id>` が公開ブックか(`visibility=public`)、`og:title`/`og:image` の有無                             |
| cron が 501                    | `CRON_SECRET` 未設定。403 なら値の不一致(引用符を含めない)                                                    |
| ビルドで `re2` が失敗        | `build-essential python3` を入れ、`pnpm rebuild re2`                                                        |
| マイグレーションで索引が消えた | `prisma migrate diff` の出力に `DROP INDEX` が無いか確認。手動索引はマイグレーション SQL に追記して復元する |

---

## 14. セキュリティ最終チェック

- [ ] `CRON_SECRET` を既定値から変更した
- [ ] nginx で `X-Real-IP` / `X-Forwarded-For` を上書きしている
- [ ] `.env` は 600、リポジトリに含めていない(`.gitignore` 済み)
- [ ] 443 のみ公開(3100・5432 は `127.0.0.1` バインド)
- [ ] HSTS が有効
- [ ] `ALLOW_EXTERNAL_IMAGES=false`(必要な場合のみ true)
- [ ] 管理者パスワードを初期値から変更し、`/settings` でリカバリーコードを保管した
- [ ] バックアップからの復元を 1 回以上実施した
