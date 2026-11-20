import sharp from "sharp";
import { writeFile } from "node:fs/promises";

/**
 * OGP 用の既定画像 `apps/web/public/og.png` を作る。
 *
 * 文字は Latin のみを使い、フォントに依存しない図形中心の構成にしている
 * (Ubuntu の最小構成でも日本語フォント無しで再生成できるようにするため)。
 * 実行: `pnpm og:image`
 */
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0f172a"/>
      <stop offset="1" stop-color="#1e3a8a"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <g opacity="0.14" fill="#93c5fd">
    <circle cx="1030" cy="110" r="150"/>
    <circle cx="120" cy="560" r="190"/>
  </g>
  <!-- ノートのモチーフ -->
  <g transform="translate(96 168)">
    <rect x="0" y="0" width="300" height="300" rx="28" fill="#ffffff" opacity="0.96"/>
    <rect x="40" y="60" width="220" height="14" rx="7" fill="#cbd5e1"/>
    <rect x="40" y="104" width="170" height="14" rx="7" fill="#cbd5e1"/>
    <rect x="40" y="148" width="200" height="14" rx="7" fill="#cbd5e1"/>
    <!-- 空欄(回答欄) -->
    <rect x="40" y="196" width="220" height="46" rx="10" fill="#eff6ff" stroke="#2563eb" stroke-width="4"/>
    <g transform="translate(150 219) rotate(45)">
      <rect x="-14" y="-14" width="28" height="28" rx="6" fill="#2563eb"/>
    </g>
    <!-- 採点のチェック -->
    <circle cx="252" cy="52" r="26" fill="#22c55e"/>
    <path d="M240 52 l9 10 l17 -20" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <text x="452" y="250" font-family="Helvetica, Arial, sans-serif" font-size="86" font-weight="700" fill="#ffffff">QB Markup</text>
  <text x="452" y="320" font-family="Helvetica, Arial, sans-serif" font-size="34" fill="#bfdbfe">write · take · grade · review</text>
  <g transform="translate(452 372)">
    <rect x="0" y="0" width="336" height="64" rx="32" fill="#2563eb"/>
    <text x="168" y="43" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="30" font-weight="700" fill="#ffffff">QUESTION BOOKS</text>
  </g>
</svg>`;

const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
await writeFile(new URL("../apps/web/public/og.png", import.meta.url), png);
console.log("wrote apps/web/public/og.png", png.length, "bytes");
