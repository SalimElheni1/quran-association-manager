#!/usr/bin/env node
/**
 * Turns the recorded video guide (npm run docs:guide) into MP4 files that play everywhere
 * (Windows, phones, WhatsApp): guide-output/guide.mp4 and one clip per chapter in
 * guide-output/chapters/. In captions mode the Arabic captions are already part of the picture;
 * in audio mode the narration track (narration.wav) is added as sound and the captions as
 * subtitles viewers can turn on; in both mode, the narration is added to the captioned picture.
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
const AAC = ['-c:a', 'aac', '-b:a', '128k'];

const source = path.join(OUT_DIR, 'guide.webm');
const timeline = path.join(OUT_DIR, 'chapters.json');
if (!fs.existsSync(source) || !fs.existsSync(timeline)) {
  console.error(`No guide found in ${OUT_DIR}. Record it first: npm run docs:guide`);
  process.exit(1);
}

const { chapters } = JSON.parse(fs.readFileSync(timeline, 'utf8'));
const infoFile = path.join(OUT_DIR, 'guide.json');
const { mode = 'captions' } = fs.existsSync(infoFile)
  ? JSON.parse(fs.readFileSync(infoFile, 'utf8'))
  : {};
const narration = path.join(OUT_DIR, 'narration.wav');
const hasNarration = mode !== 'captions' && fs.existsSync(narration);
const subtitles = path.join(OUT_DIR, 'captions.vtt');
// Soft subtitles only when the captions aren't already drawn in the picture.
const hasSubtitles = mode === 'audio' && fs.existsSync(subtitles);

/** ffmpeg arguments for one output, from `start` (seconds) for `duration` (seconds, or null). */
function encode(output, start = 0, duration = null) {
  const cut = (input) => [
    ...(start > 0 ? ['-ss', start.toFixed(2)] : []),
    ...(duration ? ['-t', duration.toFixed(2)] : []),
    '-i',
    input,
  ];
  const inputs = [...cut(source)];
  const maps = ['-map', '0:v:0'];
  if (hasNarration) {
    inputs.push(...cut(narration));
    maps.push('-map', '1:a:0');
  }
  if (hasSubtitles) {
    inputs.push(...cut(subtitles));
    maps.push('-map', `${hasNarration ? 2 : 1}:s:0`);
  }
  return [
    ...inputs,
    ...maps,
    ...H264,
    ...(hasNarration ? AAC : ['-an']),
    ...(hasSubtitles ? ['-c:s', 'mov_text', '-metadata:s:s:0', 'language=ara'] : []),
    ...(hasNarration ? ['-metadata:s:a:0', 'language=ara'] : []),
    '-movflags',
    '+faststart',
    output,
  ];
}

console.log(`Mode: ${mode}${hasNarration ? ' (with narration)' : ''}`);
console.log('Full guide -> guide.mp4');
run(encode(path.join(OUT_DIR, 'guide.mp4')));

const chaptersDir = path.join(OUT_DIR, 'chapters');
fs.mkdirSync(chaptersDir, { recursive: true });
for (const chapter of chapters) {
  const name = `${String(chapter.number).padStart(2, '0')}-${slug(chapter.title)}.mp4`;
  const start = Math.max(0, chapter.startMs - 300) / 1000;
  const duration = (chapter.endMs - chapter.startMs + 600) / 1000;
  console.log(`Chapter ${chapter.number} -> chapters/${name}`);
  // The same cut on every input keeps the narration and subtitles in step with the picture.
  run(encode(path.join(chaptersDir, name), start, duration));
}
console.log(`Done: ${OUT_DIR}`);
