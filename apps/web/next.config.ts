import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * リポジトリ直下の `.env` を読み込む。
 *
 * Next.js が既定で読むのはアプリ配下(`apps/web/.env*`)だが、DB 接続先などの
 * 設定は SPEC_v4 §9 に従ってリポジトリ単位で一元管理したいので、ここで明示的に読む。
 * 既に設定済みの環境変数は上書きしない(本番の環境変数が優先)。
 */
const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

function loadRootEnv(file: string) {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadRootEnv(resolve(repoRoot, ".env"));
loadRootEnv(resolve(repoRoot, ".env.local"));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // パーサは TS ソースを直接公開しているため、Next 側で変換する
  transpilePackages: ["@qb/parser"],
  // リポジトリ直下の lockfile を基準にする(ホームディレクトリの lockfile を拾わない)
  outputFileTracingRoot: repoRoot,
  // Prisma は Node ランタイムでのみ動かす(Edge では動かない)
  serverExternalPackages: ["@prisma/client", "re2", "sharp"],
  experimental: {
    // 画像アップロード(ZIP 取り込み)で 50MB を見込む。§9 の上限と整合させる
    serverActions: { bodySizeLimit: "60mb" },
  },
};

export default nextConfig;
