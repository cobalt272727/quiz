# データベースの準備(SPEC_v4 §6)

## 1. 必要なもの

| 項目 | 要件 | 理由 |
| --- | --- | --- |
| PostgreSQL | **15 以上** | `UNIQUE ... NULLS NOT DISTINCT`(`Answer` / `Bookmark` の一意性)を使うため |
| 拡張 | `pg_trgm` | タイトル・説明の日本語部分一致検索(§6.3) |
| ロール | DB の所有者(または同等) | テーブル・索引・拡張の作成 |
| 権限 | 開発時は `CREATEDB` | `prisma migrate dev` がシャドー DB を作るため。無い場合は空 DB を `SHADOW_DATABASE_URL` に指定 |

PG 13/14 や `pg_trgm` が使えない環境でも動かせます。その場合は申し出てください。
- `NULLS NOT DISTINCT` → `COALESCE(blankId,'')` の式インデックスに置き換え
- `pg_trgm` → 索引を外す(検索は `ILIKE` の全走査。小規模なら実用上問題なし)

## 2. 作成手順

`docs/database-setup.sql` をスーパーユーザーで実行します。

```bash
psql -U postgres -f docs/database-setup.sql
```

手動で行う場合の最小手順:

```sql
CREATE ROLE qb LOGIN PASSWORD '<パスワード>';
CREATE DATABASE qb OWNER qb ENCODING 'UTF8' TEMPLATE template0;
-- 以降は qb で接続してから
CREATE EXTENSION IF NOT EXISTS pg_trgm;
ALTER SCHEMA public OWNER TO qb;
```

リモートのサーバを使う場合は、`pg_hba.conf` でこのホストからの接続を許可し
(`scram-sha-256` 推奨)、必要なら `listen_addresses` とファイアウォールも設定してください。
DATABASE_URL に `?sslmode=require` を付けると TLS で接続します。

## 3. `.env`

リポジトリ直下の `.env`(Git 管理外)に接続先を書きます。`.env.example` が雛形です。

```dotenv
DATABASE_URL="postgresql://qb:<パスワード>@<ホスト>:5432/qb?schema=public"
# CREATEDB 権限が無い場合のみ
# SHADOW_DATABASE_URL="postgresql://qb:<パスワード>@<ホスト>:5432/qb_shadow?schema=public"
```

パスワードに `@ : / ? # %` を含む場合は URL エンコードが必要です(例: `@` → `%40`)。

## 4. 適用と確認

```bash
pnpm db:validate    # スキーマの構文・整合性
pnpm db:migrate     # マイグレーション適用(開発)
pnpm db:generate    # Prisma Client の生成(.env 変更後)
```

本番・CI では `pnpm db:deploy`(`prisma migrate deploy`)。

```bash
psql "postgresql://qb:<パスワード>@<ホスト>:5432/qb" -c '\dt'          # テーブル一覧
psql "postgresql://qb:<パスワード>@<ホスト>:5432/qb" -c '\d "Answer"'  # 制約の確認
```

## 5. マイグレーションの内容

| ファイル | 内容 |
| --- | --- |
| `20260101000000_init` | 全テーブル・enum・基本索引(`prisma migrate diff` の生成物) |
| `20260101000001_constraints` | `lower("loginId")` の部分 UNIQUE、`Answer` / `Bookmark` の `NULLS NOT DISTINCT`、公開ブックの部分索引、`tags` GIN、trigram 検索索引、期限切れ検索・パージ用の部分索引 |
| `20260102000000_guest_token_multi` | `Attempt.guestTokenHash` の UNIQUE を外し、索引に変更(同じブラウザで複数回受験できるようにする) |

`pnpm db:verify` はこの 2 つを PGlite(WASM 版 PostgreSQL)に適用し、制約が意図どおり
効くことまで確認します(Docker 不要)。ただし `pg_trgm` は PGlite に無いため、その索引だけ
検証対象から外しています。実 DB では `pnpm db:migrate` の成功をもって確認してください。
