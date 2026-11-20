/**
 * サーバ設定(SPEC_v4 §9)。値は環境変数で一元管理し、既定値はここに置く。
 */

const num = (key: string, fallback: number): number => {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

const bool = (key: string, fallback: boolean): boolean => {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  return raw === "true" || raw === "1";
};

export const serverEnv = {
  get sessionTtlDays() {
    return num("SESSION_TTL_DAYS", 30);
  },
  /** 期限直前の送信を許す猶予(§7.6) */
  get submitGraceSeconds() {
    return num("SUBMIT_GRACE_SECONDS", 5);
  },
  get guestAttemptTtlDays() {
    return num("GUEST_ATTEMPT_TTL_DAYS", 7);
  },
  get bookRetentionDays() {
    return num("BOOK_RETENTION_DAYS", 30);
  },
  get answerMaxChars() {
    return num("ANSWER_MAX_CHARS", 10000);
  },
  get allowExternalImages() {
    return bool("ALLOW_EXTERNAL_IMAGES", false);
  },
  /** 外部公開 URL。OGP の絶対 URL とメタデータの基準に使う(§8) */
  get appUrl() {
    return (process.env.APP_URL ?? "http://localhost:3100").replace(/\/+$/, "");
  },
  /** 運営者名(規約・フッター表示用) */
  get operatorName() {
    return process.env.OPERATOR_NAME ?? "問題ブック運営";
  },
  get uploadDir() {
    return process.env.UPLOAD_DIR ?? "./data/uploads";
  },
  get nodeEnv() {
    return process.env.NODE_ENV ?? "development";
  },
};
