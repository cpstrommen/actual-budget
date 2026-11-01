// Rasterize the code-native CFM mark. Run from the repository root:
// npm exec --yes --package=sharp-cli@5.2.0 -- node scripts/generate-brand-assets.cjs
const fs = require('node:fs');
const path = require('node:path');
let sharp;
try {
  // oxlint-disable-next-line actual/no-extraneous-dependencies -- Optional generator uses the pinned sharp-cli environment above.
  sharp = require('sharp');
} catch {
  const bin = process.env.PATH.split(path.delimiter).find(
    p => p.includes('/_npx/') && p.endsWith('/node_modules/.bin'),
  );
  if (!bin) {
    throw new Error(
      'Run with sharp installed, or use the npm exec command above.',
    );
  }
  sharp = require(path.join(bin, '..', 'sharp'));
}
const root = path.resolve(__dirname, '..');
const icon = fs.readFileSync(path.join(root, 'assets/brand/icon.svg'));
async function raster(relative, width, height = width, background) {
  const output = path.join(root, relative);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  await sharp(icon)
    .resize(width, height, {
      fit: 'contain',
      background: background || '#1f1f1f',
    })
    .toFile(output);
}
async function main() {
  const web = 'packages/desktop-client/public/';
  const sizes = {
    'favicon-16x16.png': 16,
    'favicon-32x32.png': 32,
    'apple-touch-icon.png': 180,
    'mstile-150x150.png': 150,
    'android-chrome-192x192.png': 192,
    'android-chrome-512x512.png': 512,
    'maskable-192x192.png': 192,
    'maskable-512x512.png': 512,
  };
  for (const [name, size] of Object.entries(sizes)) {
    await raster(web + name, size);
  }
  await raster('packages/desktop-electron/icons/icon.png', 1024);
  await raster('packages/docs/static/img/favicon.webp', 96);
  await raster('packages/docs/static/img/logo.webp', 192);
  await sharp(path.join(root, 'assets/brand/social.svg'))
    .png()
    .toFile(path.join(root, 'packages/docs/static/img/cfm-social.png'));
  const frames = [];
  for (const size of [16, 32, 48, 64, 256]) {
    frames.push({
      size,
      data: await sharp(icon).resize(size, size).png().toBuffer(),
    });
  }
  const header = Buffer.alloc(6 + frames.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  let offset = header.length;
  frames.forEach(({ size, data }, i) => {
    const pos = 6 + i * 16;
    header[pos] = size === 256 ? 0 : size;
    header[pos + 1] = header[pos];
    header.writeUInt16LE(1, pos + 4);
    header.writeUInt16LE(32, pos + 6);
    header.writeUInt32LE(data.length, pos + 8);
    header.writeUInt32LE(offset, pos + 12);
    offset += data.length;
  });
  const ico = Buffer.concat([header, ...frames.map(f => f.data)]);
  fs.writeFileSync(path.join(root, web, 'favicon.ico'), ico);
  fs.writeFileSync(
    path.join(root, 'packages/docs/static/img/favicon.ico'),
    ico,
  );
  const chunks = [];
  for (const [type, size] of [
    ['icp4', 16],
    ['icp5', 32],
    ['icp6', 64],
    ['ic07', 128],
    ['ic08', 256],
    ['ic09', 512],
    ['ic10', 1024],
  ]) {
    const data = await sharp(icon).resize(size, size).png().toBuffer();
    const chunk = Buffer.alloc(8);
    chunk.write(type);
    chunk.writeUInt32BE(data.length + 8, 4);
    chunks.push(chunk, data);
  }
  const icnsHeader = Buffer.alloc(8);
  icnsHeader.write('icns');
  icnsHeader.writeUInt32BE(8 + chunks.reduce((n, b) => n + b.length, 0), 4);
  fs.writeFileSync(
    path.join(root, 'packages/desktop-electron/icons/icon.icns'),
    Buffer.concat([icnsHeader, ...chunks]),
  );
  // Preserve platform asset sizes while replacing every active launcher/splash image.
  async function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(file);
      } else if (
        file.endsWith('.png') &&
        /(?:ic_launcher|AppIcon|splash)/i.test(file)
      ) {
        const { width, height } = await sharp(file).metadata();
        await raster(path.relative(root, file), width, height);
      }
    }
  }
  await walk(path.join(root, 'packages/mobile-client'));
  console.log('Generated CFM web, desktop, documentation, and mobile assets.');
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
