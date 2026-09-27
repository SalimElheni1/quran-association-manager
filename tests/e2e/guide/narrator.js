/**
 * Arabic narration for the video guide: turns each explanation into speech with a
 * text-to-speech engine, as a WAV clip (24 kHz, mono, 16-bit) whose length sets the pause of
 * the step, so every action happens right after it is announced.
 *
 * Engines (QBM_GUIDE_TTS):
 * - edge (default): Microsoft neural voices through the `edge-tts` command
 *   (pip install edge-tts). Natural Arabic, including Tunisian voices; needs internet.
 *   Voice: QBM_GUIDE_VOICE (default ar-TN-ReemNeural; also ar-TN-HediNeural,
 *   ar-SA-HamedNeural, ar-EG-SalmaNeural...). Speed: QBM_GUIDE_TTS_RATE, e.g. "-5%".
 * - espeak: `espeak-ng`, fully offline but robotic. Voice: QBM_GUIDE_VOICE (default mb-ar1,
 *   an MBROLA voice, or "ar" without MBROLA). Speed: QBM_GUIDE_TTS_RATE in words per minute.
 * - command: any engine, through QBM_GUIDE_TTS_CMD, a command run by the shell with
 *   {text} (a UTF-8 file with the sentence) and {out} (the audio file to write), e.g.
 *   'piper -m ar_JO-kareem-medium.onnx -f {out} < {text}'.
 *
 * Clips are converted with ffmpeg (FFMPEG_PATH or `ffmpeg` on the PATH) and cached by
 * engine, voice, speed and text, so later runs don't synthesize again.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SAMPLE_RATE = 24000;
const BYTES_PER_SECOND = SAMPLE_RATE * 2;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.error) {
    throw new Error(`${command} could not be started: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${(result.stderr || result.stdout || '').slice(-600)}`);
  }
  return result;
}

/**
 * Reads the PCM samples of a 16-bit WAV file.
 * @param {string} file
 * @returns {Buffer}
 */
function readWavSamples(file) {
  const wav = fs.readFileSync(file);
  let offset = 12;
  while (offset + 8 <= wav.length) {
    const id = wav.toString('ascii', offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    if (id === 'data') return wav.subarray(offset + 8, Math.min(wav.length, offset + 8 + size));
    offset += 8 + size + (size % 2);
  }
  throw new Error(`No audio data in ${file}`);
}

/**
 * Writes 16-bit mono PCM samples as a WAV file.
 * @param {string} file
 * @param {Buffer} samples
 */
function writeWav(file, samples) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + samples.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(BYTES_PER_SECOND, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(samples.length, 40);
  fs.writeFileSync(file, Buffer.concat([header, samples]));
}

class Narrator {
  /**
   * @param {{ cacheDir: string, engine?: string, voice?: string, rate?: string,
   *   command?: string, ffmpeg?: string }} options
   */
  constructor({
    cacheDir,
    engine = process.env.QBM_GUIDE_TTS || 'edge',
    voice = process.env.QBM_GUIDE_VOICE,
    rate = process.env.QBM_GUIDE_TTS_RATE,
    command = process.env.QBM_GUIDE_TTS_CMD,
    ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg',
  }) {
    this.cacheDir = cacheDir;
    this.engine = engine;
    this.command = command;
    this.ffmpeg = ffmpeg;
    if (engine === 'edge') {
      this.voice = voice || 'ar-TN-ReemNeural';
      this.rate = rate || '-5%';
    } else if (engine === 'espeak') {
      this.voice = voice || 'mb-ar1';
      this.rate = rate || '140';
    } else if (engine === 'command') {
      if (!command) throw new Error('QBM_GUIDE_TTS=command needs QBM_GUIDE_TTS_CMD.');
      this.voice = voice || 'custom';
      this.rate = rate || '';
    } else {
      throw new Error(`Unknown QBM_GUIDE_TTS engine "${engine}" (edge, espeak or command).`);
    }
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  /** The cached WAV file of a sentence. */
  clipPath(text) {
    const key = crypto
      .createHash('sha1')
      .update([this.engine, this.voice, this.rate, this.command || '', text].join('\u0000'))
      .digest('hex')
      .slice(0, 16);
    return path.join(this.cacheDir, `${key}.wav`);
  }

  /** Converts any audio file to the guide's WAV format. */
  toWav(input, output) {
    run(this.ffmpeg, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      input,
      '-ac',
      '1',
      '-ar',
      String(SAMPLE_RATE),
      '-sample_fmt',
      's16',
      output,
    ]);
  }

  /** Synthesizes one sentence with the configured engine into `out` (any audio format). */
  synthesizeRaw(text, out) {
    if (this.engine === 'edge') {
      const textFile = `${out}.txt`;
      fs.writeFileSync(textFile, text, 'utf8');
      try {
        run('edge-tts', [
          '--voice',
          this.voice,
          `--rate=${this.rate}`,
          '--file',
          textFile,
          '--write-media',
          out,
        ]);
      } finally {
        fs.rmSync(textFile, { force: true });
      }
    } else if (this.engine === 'espeak') {
      try {
        run('espeak-ng', ['-v', this.voice, '-s', this.rate, '-w', out, text]);
      } catch (error) {
        // MBROLA voices need the mbrola package; fall back to espeak's own Arabic voice.
        if (!this.voice.startsWith('mb-')) throw error;
        this.voice = 'ar';
        run('espeak-ng', ['-v', 'ar', '-s', this.rate, '-w', out, text]);
      }
    } else {
      const textFile = `${out}.txt`;
      fs.writeFileSync(textFile, text, 'utf8');
      try {
        const cmd = this.command
          .replaceAll('{text}', JSON.stringify(textFile))
          .replaceAll('{out}', JSON.stringify(out));
        run(cmd, [], { shell: true });
      } finally {
        fs.rmSync(textFile, { force: true });
      }
    }
  }

  /**
   * The narration clip of a sentence, synthesized on first use.
   * @param {string} text
   * @returns {{ file: string, durationMs: number }}
   */
  clip(text) {
    const file = this.clipPath(text);
    if (!fs.existsSync(file)) {
      const raw = `${file}.${this.engine === 'edge' ? 'mp3' : 'raw.wav'}`;
      try {
        this.synthesizeRaw(text, raw);
        this.toWav(raw, file);
      } finally {
        fs.rmSync(raw, { force: true });
      }
    }
    return {
      file,
      durationMs: Math.round((readWavSamples(file).length / BYTES_PER_SECOND) * 1000),
    };
  }

  /** Synthesizes sentences ahead of the recording, so steps don't wait for the engine. */
  prefetch(texts) {
    for (const text of texts) this.clip(text);
  }
}

/**
 * Builds one narration track: each clip placed at its time in the video.
 * @param {Array<{ file: string, startMs: number }>} clips
 * @param {number} totalMs Length of the track.
 * @param {string} out WAV file to write.
 */
function writeNarrationTrack(clips, totalMs, out) {
  const bytes = (ms) => Math.max(0, Math.round((ms / 1000) * SAMPLE_RATE)) * 2;
  const endMs = clips.reduce((end, c) => {
    const len = (readWavSamples(c.file).length / BYTES_PER_SECOND) * 1000;
    return Math.max(end, c.startMs + len);
  }, totalMs);
  const track = Buffer.alloc(bytes(endMs));
  for (const clip of clips) {
    const samples = readWavSamples(clip.file);
    const at = bytes(clip.startMs);
    // Mix (clips never overlap in practice, but adding keeps an overlap audible).
    for (let i = 0; i + 1 < samples.length && at + i + 1 < track.length; i += 2) {
      const mixed = track.readInt16LE(at + i) + samples.readInt16LE(i);
      track.writeInt16LE(Math.max(-32768, Math.min(32767, mixed)), at + i);
    }
  }
  writeWav(out, track);
}

/**
 * Finds the sentences a guide script will narrate: the literal strings passed to
 * guide.say(...) and guide.chapter(...), so they can be synthesized before recording.
 * @param {string} source The guide script.
 * @param {(n: number, title: string, subtitle: string) => string} chapterText
 * @returns {string[]}
 */
function extractNarration(source, chapterText) {
  const str = String.raw`(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|\x60([^\x60$]*)\x60)`;
  const pattern = new RegExp(String.raw`guide\.(say|chapter)\(\s*${str}(?:\s*,\s*${str})?`, 'g');
  const texts = [];
  let chapter = 0;
  for (const m of source.matchAll(pattern)) {
    const first = m[2] ?? m[3] ?? m[4];
    const second = m[5] ?? m[6] ?? m[7];
    if (m[1] === 'say') texts.push(first);
    else texts.push(chapterText((chapter += 1), first, second || ''));
  }
  return texts;
}

module.exports = { Narrator, writeNarrationTrack, extractNarration, readWavSamples };
