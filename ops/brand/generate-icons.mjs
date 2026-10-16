import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// Committed outputs keep image generation out of production builds.
const root = fileURLToPath(new URL('../../', import.meta.url));
const source = `${root}public/images/brand/app-icon.svg`;
await copyFile(source, `${root}src/app/icon.svg`);
for (const [size, target] of [
  [180, 'src/app/apple-icon.png'],
  [1024, 'public/images/brand/app-icon-1024.png'],
  [1024, 'mobile/prototype/native/ios/AppIcon.appiconset/AppIcon-512@2x.png'],
]) {
  await sharp(source).resize(size, size).removeAlpha().png().toFile(root + target);
}

// ICO directory with PNG-encoded images; no extra image dependency is needed.
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map(size => sharp(source).resize(size, size).removeAlpha().png().toBuffer()));
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
images.forEach((bytes, i) => {
  const entry = 6 + i * 16;
  header[entry] = sizes[i];
  header[entry + 1] = sizes[i];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(24, entry + 6);
  header.writeUInt32LE(bytes.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += bytes.length;
});
await writeFile(`${root}src/app/favicon.ico`, Buffer.concat([header, ...images]));
if (!(await readFile(source)).equals(await readFile(`${root}src/app/icon.svg`))) throw new Error('Icon source mismatch');
// The adaptive foreground keeps the B mark inside Android's circular mask.
// Android applies the launcher shape; do not bake rounded corners into the art.
const android = `${root}mobile/prototype/native/android/res`;
for (const [density, scale] of [['mdpi', 1], ['hdpi', 1.5], ['xhdpi', 2], ['xxhdpi', 3], ['xxxhdpi', 4]]) {
  const directory = `${android}/mipmap-${density}`;
  await mkdir(directory, { recursive: true });
  const size = 48 * scale;
  const icon = await sharp(source).resize(size, size).removeAlpha().png().toBuffer();
  await writeFile(`${directory}/ic_launcher.png`, icon);
  await writeFile(`${directory}/ic_launcher_round.png`, icon);
  const canvas = 108 * scale;
  const art = await sharp(source).resize(Math.round(canvas * 0.74)).png().toBuffer();
  await sharp({ create: { width: canvas, height: canvas, channels: 4, background: '#174c3c' } })
    .composite([{ input: art, gravity: 'centre' }]).png().toFile(`${directory}/ic_launcher_foreground.png`);
}
console.log('Rally On B: web, iOS and Android icons generated.');
