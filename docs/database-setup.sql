-- 問題ブック作成サイト用の DB とロールを作成する(SPEC_v4 §6)
-- スーパーユーザー(postgres)で実行してください。
--   psql -U postgres -f docs/database-setup.sql
-- パスワードは必ず変更し、.env の DATABASE_URL と同じ値にしてください。

CREATE ROLE qb LOGIN PASSWORD 'CHANGE_ME';

-- 開発中は prisma migrate dev がシャドー DB を作るため CREATEDB を付与する。
-- 本番では外し、マイグレーションは `pnpm db:deploy` で適用する。
ALTER ROLE qb CREATEDB;

CREATE DATABASE qb OWNER qb ENCODING 'UTF8' TEMPLATE template0;

-- ここから先は `\c qb` で接続してから実行する
\connect qb

-- 日本語の部分一致検索(§6.3)。pg_trgm は trusted extension なので
-- PG13 以降は DB の所有者でも作成できる。
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 既定の public スキーマにテーブルを作れるようにする(PG15 以降で必要)
GRANT ALL ON SCHEMA public TO qb;
ALTER SCHEMA public OWNER TO qb;

-- 確認
SELECT current_database(), current_user;
SELECT extname FROM pg_extension;
