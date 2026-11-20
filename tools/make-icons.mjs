import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";

/**
 * `apps/web/app/icon.svg` から favicon / Apple touch icon / PWA アイコンを生成する。
 * 実行: `pnpm icons`
 */
const iconPath = new URL("../apps/web/app/icon.svg", import.meta.url);
const source = await readFile(iconPath, "utf8");

// Apple touch icon と PWA アイコンは余白の透明な角を残さない(full-bleed)。
const fullBleed = source
  .replace(
    '<rect width="512" height="512" rx="112" fill="url(#bg)"/>',
    '<rect width="512" height="512" fill="url(#bg)"/>',
  )
  .replace(
    '<rect width="512" height="512" rx="112" fill="url(#glow)"/>',
    '<rect width="512" height="512" fill="url(#glow)"/>',
  )
  .replace(
    /[ \t]*<rect x="3" y="3" width="506" height="506" rx="109" fill="none" stroke="#ffffff" stroke-opacity="0.2" stroke-width="6"\/>\r?\n?/,
    "",
  );

if (
  !fullBleed.includes('<rect width="512" height="512" fill="url(#bg)"/>') ||
  !fullBleed.includes('<rect width="512" height="512" fill="url(#glow)"/>') ||
  fullBleed.includes('x="3" y="3"')
) {
  throw new Error("icon.svg の背景を full-bleed に変換できませんでした");
}

async function png(svg, size) {
  return sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
}

/** PNG を複数サイズ格納した ICO を作る(モダンブラウザ向け)。 */
function ico(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);

  const dir = Buffer.alloc(16 * entries.length);
  let offset = header.length + dir.length;
  entries.forEach(({ size, data }, i) => {
    const p = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, p);
    dir.writeUInt8(size >= 256 ? 0 : size, p + 1);
    dir.writeUInt8(0, p + 2); // palette
    dir.writeUInt8(0, p + 3); // reserved
    dir.writeUInt16LE(1, p + 4); // planes
    dir.writeUInt16LE(32, p + 6); // bpp
    dir.writeUInt32LE(data.length, p + 8);
    dir.writeUInt32LE(offset, p + 12);
    offset += data.length;
  });

  return Buffer.concat([header, dir, ...entries.map((e) => e.data)]);
}

const faviconEntries = [];
for (const size of [16, 32, 48]) {
  faviconEntries.push({ size, data: await png(source, size) });
}

const outputs = [
  ["apps/web/app/favicon.ico", ico(faviconEntries)],
  ["apps/web/app/apple-icon.png", await png(fullBleed, 180)],
  ["apps/web/public/icons/icon-192.png", await png(fullBleed, 192)],
  ["apps/web/public/icons/icon-512.png", await png(fullBleed, 512)],
];

await mkdir(new URL("../apps/web/public/icons/", import.meta.url), { recursive: true });
for (const [path, data] of outputs) {
  await writeFile(new URL(`../${path}`, import.meta.url), data);
  console.log(`wrote ${path} (${data.length} bytes)`);
}
