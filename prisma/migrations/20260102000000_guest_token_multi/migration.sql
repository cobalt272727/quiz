-- ゲストは同じブラウザで複数の Attempt を持てる(§7.6)。
-- 資格情報は Attempt 行にハッシュで保存するが、ハッシュ自体は一意ではない。
DROP INDEX IF EXISTS "Attempt_guestTokenHash_key";
CREATE INDEX IF NOT EXISTS "Attempt_guestTokenHash_idx" ON "Attempt" ("guestTokenHash");
