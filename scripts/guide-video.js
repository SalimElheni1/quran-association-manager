#!/usr/bin/env node
/**
 * Turns the recorded video guide (npm run docs:guide) into MP4 files that play everywhere
 * (Windows, phones, WhatsApp): guide-output/guide.mp4 and one clip per chapter in
 * guide-output/chapters/. The Arabic captions are already part of the picture.
 *
 * Needs ffmpeg with H.264 (libx264): set FFMPEG_PATH, or have `ffmpeg` on the PATH.
 * Usage: npm run docs:guide:mp4 [-- <guide-output dir>]
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.resolve(process.argv[2] || path.join(ROOT, 'guide-output'));
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

function run(args) {
  const result = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(
      `ffmpeg not found (${FFMPEG}). Install ffmpeg or set FFMPEG_PATH to an ffmpeg with libx264.`,
    );
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status || 1);
}

/** A file name from a chapter title: keeps Arabic letters and digits, drops the rest. */
function slug(text) {
  return text
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

const H264 = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p'];
const MP4 = ['-movflags', '+faststart', '-an'];

const source = path.join(OUT_DIR, 'guide.webm');
const timeline = path.join(OUT_DIR, 'chapters.json');
if (!fs.existsSync(source) || !fs.existsSync(timeline)) {
  console.error(`No guide found in ${OUT_DIR}. Record it first: npm run docs:guide`);
  process.exit(1);
}

const { chapters } = JSON.parse(fs.readFileSync(timeline, 'utf8'));

console.log('Full guide -> guide.mp4');
run(['-i', source, ...H264, ...MP4, path.join(OUT_DIR, 'guide.mp4')]);

const chaptersDir = path.join(OUT_DIR, 'chapters');
fs.mkdirSync(chaptersDir, { recursive: true });
for (const chapter of chapters) {
  const name = `${String(chapter.number).padStart(2, '0')}-${slug(chapter.title)}.mp4`;
  const start = Math.max(0, chapter.startMs - 300) / 1000;
  const duration = (chapter.endMs - chapter.startMs + 600) / 1000;
  console.log(`Chapter ${chapter.number} -> chapters/${name}`);
  // -ss after -i: frame-accurate cut (the clip is re-encoded anyway).
  run([
    '-i',
    source,
    '-ss',
    start.toFixed(2),
    '-t',
    duration.toFixed(2),
    ...H264,
    ...MP4,
    path.join(chaptersDir, name),
  ]);
}
console.log(`Done: ${OUT_DIR}`);
