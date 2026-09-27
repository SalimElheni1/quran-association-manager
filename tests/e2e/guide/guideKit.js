/**
 * Video guide toolkit: drives the real app at a human pace and draws Arabic explanations on
 * screen, so the recorded video reads as a tutorial.
 *
 * - chapter(title, subtitle): a full-screen title card that opens a chapter.
 * - say(text): a caption bar at the bottom of the window, shown before the action it explains.
 * - click / type / select: highlight the target, then act on it slowly.
 *
 * Everything is drawn in the page (not added afterwards), so the captions are part of the video
 * with no extra tool. The timeline is also saved, to write subtitles (WebVTT), chapter timings
 * (to cut the video per chapter) and a written guide in Markdown.
 */
const fs = require('fs');
const path = require('path');

const OVERLAY_ID = 'qbm-guide-overlay';
const CAPTION_ID = 'qbm-guide-caption';
const RING_ID = 'qbm-guide-ring';
const CARD_ID = 'qbm-guide-card';

/** Time to read a caption: about 60 ms per character, between 2.5 and 6.5 seconds. */
function readingTime(text) {
  return Math.min(6500, Math.max(2500, 1200 + text.length * 60));
}

function formatVttTime(ms) {
  const total = Math.max(0, Math.round(ms));
  const h = String(Math.floor(total / 3600000)).padStart(2, '0');
  const m = String(Math.floor((total % 3600000) / 60000)).padStart(2, '0');
  const s = String(Math.floor((total % 60000) / 1000)).padStart(2, '0');
  const msPart = String(total % 1000).padStart(3, '0');
  return `${h}:${m}:${s}.${msPart}`;
}

function formatClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

class Guide {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {{ pace?: number }} [options] pace multiplies every pause (1 = normal).
   */
  constructor(page, { pace = 1 } = {}) {
    this.page = page;
    this.pace = pace;
    this.start = Date.now();
    this.chapters = [];
    this.captions = [];
    this.stepNumber = 0;
  }

  now() {
    return Date.now() - this.start;
  }

  async pause(ms) {
    await this.page.waitForTimeout(Math.round(ms * this.pace));
  }

  /** Adds the overlay styles and containers once (the app is a single page, they persist). */
  async ensureOverlay() {
    await this.page.evaluate(
      ({ OVERLAY_ID, CAPTION_ID, RING_ID, CARD_ID }) => {
        if (document.getElementById(OVERLAY_ID)) return;
        const style = document.createElement('style');
        style.textContent = `
          #${OVERLAY_ID} { position: fixed; inset: 0; pointer-events: none; z-index: 2147483646;
            font-family: 'Cairo', 'Tajawal', 'Segoe UI', 'DejaVu Sans', sans-serif; direction: rtl; }
          #${CAPTION_ID} { position: absolute; left: 50%; bottom: 28px; transform: translate(-50%, 20px);
            max-width: 82%; min-width: 40%; padding: 14px 26px 16px; border-radius: 14px;
            background: rgba(15, 42, 38, 0.92); color: #fff; font-size: 23px; line-height: 1.7;
            text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,.35); opacity: 0;
            transition: opacity .35s ease, transform .35s ease; border-top: 4px solid #d4a72c; }
          #${CAPTION_ID}.visible { opacity: 1; transform: translate(-50%, 0); }
          #${CAPTION_ID}.top { bottom: auto; top: 76px; }
          #${CAPTION_ID} .step { display: inline-block; margin-inline-end: 12px; padding: 0 12px;
            border-radius: 999px; background: #d4a72c; color: #10302b; font-size: 17px;
            font-weight: 700; vertical-align: middle; }
          #${RING_ID} { position: fixed; border: 4px solid #d4a72c; border-radius: 10px;
            box-shadow: 0 0 0 9999px rgba(0,0,0,.18), 0 0 18px 4px rgba(212,167,44,.8);
            opacity: 0; transition: all .3s ease; }
          #${RING_ID}.visible { opacity: 1; }
          #${CARD_ID} { position: absolute; inset: 0; display: flex; flex-direction: column;
            align-items: center; justify-content: center; gap: 18px; color: #fff; opacity: 0;
            background: linear-gradient(135deg, rgba(16,48,43,.97), rgba(28,86,74,.97));
            transition: opacity .45s ease; text-align: center; padding: 40px; }
          #${CARD_ID}.visible { opacity: 1; }
          #${CARD_ID} .num { font-size: 22px; color: #d4a72c; font-weight: 700; letter-spacing: 1px; }
          #${CARD_ID} .title { font-size: 44px; font-weight: 800; }
          #${CARD_ID} .subtitle { font-size: 24px; max-width: 70%; line-height: 1.8; opacity: .9; }
        `;
        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.innerHTML = `<div id="${CARD_ID}"></div><div id="${RING_ID}"></div><div id="${CAPTION_ID}"></div>`;
        document.head.appendChild(style);
        document.body.appendChild(overlay);
      },
      { OVERLAY_ID, CAPTION_ID, RING_ID, CARD_ID },
    );
  }

  /**
   * Opens a chapter with a full-screen title card.
   * @param {string} title
   * @param {string} [subtitle]
   */
  async chapter(title, subtitle = '') {
    await this.ensureOverlay();
    await this.hideCaption();
    const number = this.chapters.length + 1;
    this.closeChapter();
    this.chapters.push({ number, title, subtitle, start: this.now(), end: null, steps: [] });
    await this.page.evaluate(
      ({ CARD_ID, number, title, subtitle }) => {
        const card = document.getElementById(CARD_ID);
        card.innerHTML = '';
        const num = document.createElement('div');
        num.className = 'num';
        num.textContent = `الفصل ${number}`;
        const t = document.createElement('div');
        t.className = 'title';
        t.textContent = title;
        card.append(num, t);
        if (subtitle) {
          const s = document.createElement('div');
          s.className = 'subtitle';
          s.textContent = subtitle;
          card.append(s);
        }
        card.classList.add('visible');
      },
      { CARD_ID, number, title, subtitle },
    );
    await this.pause(Math.max(3500, readingTime(`${title} ${subtitle}`)));
    await this.page.evaluate(
      (id) => document.getElementById(id).classList.remove('visible'),
      CARD_ID,
    );
    await this.pause(600);
  }

  closeChapter() {
    const current = this.chapters[this.chapters.length - 1];
    if (current && current.end === null) current.end = this.now();
  }

  /**
   * Shows a caption and leaves time to read it. The caption stays until the next one, so it
   * explains the action that follows.
   * @param {string} text
   * @param {{ hold?: number }} [options] hold: extra milliseconds to keep it before moving on.
   */
  async say(text, { hold = 0 } = {}) {
    await this.ensureOverlay();
    this.stepNumber += 1;
    const chapter = this.chapters[this.chapters.length - 1];
    const stepInChapter = chapter ? chapter.steps.length + 1 : this.stepNumber;
    const entry = { text, step: stepInChapter, start: this.now(), end: null };
    const last = this.captions[this.captions.length - 1];
    if (last && last.end === null) last.end = entry.start;
    this.captions.push(entry);
    if (chapter) chapter.steps.push(text);

    await this.page.evaluate(
      async ({ CAPTION_ID, text, step }) => {
        const caption = document.getElementById(CAPTION_ID);
        if (caption.classList.contains('visible')) {
          caption.classList.remove('visible');
          await new Promise((r) => setTimeout(r, 250));
        }
        caption.innerHTML = '';
        const badge = document.createElement('span');
        badge.className = 'step';
        badge.textContent = `الخطوة ${step}`;
        caption.append(badge, document.createTextNode(text));
        caption.classList.add('visible');
      },
      { CAPTION_ID, text, step: stepInChapter },
    );
    await this.pause(readingTime(text) + hold);
  }

  async hideCaption() {
    const last = this.captions[this.captions.length - 1];
    if (last && last.end === null) last.end = this.now();
    await this.page
      .evaluate((id) => {
        const caption = document.getElementById(id);
        if (caption) caption.classList.remove('visible');
      }, CAPTION_ID)
      .catch(() => {});
  }

  /** Draws a highlight ring around an element for a moment. */
  async point(locator, ms = 900) {
    await this.ensureOverlay();
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    if (!box) return;
    await this.page.evaluate(
      ({ RING_ID, CAPTION_ID, box }) => {
        const ring = document.getElementById(RING_ID);
        // Keep the caption clear of the target: move it to the top when the target is low.
        const caption = document.getElementById(CAPTION_ID);
        caption.classList.toggle('top', box.y + box.height > window.innerHeight - 200);
        const pad = 6;
        Object.assign(ring.style, {
          left: `${box.x - pad}px`,
          top: `${box.y - pad}px`,
          width: `${box.width + pad * 2}px`,
          height: `${box.height + pad * 2}px`,
        });
        ring.classList.add('visible');
      },
      { RING_ID, CAPTION_ID, box },
    );
    await this.pause(ms);
    await this.page.evaluate(
      (id) => document.getElementById(id).classList.remove('visible'),
      RING_ID,
    );
  }

  /** Highlights, then clicks. */
  async click(locator, { after = 700 } = {}) {
    await locator.waitFor({ state: 'visible' });
    await this.point(locator);
    await locator.click();
    await this.pause(after);
  }

  /** Highlights, then types the text key by key so it is visible in the video. */
  async type(locator, text, { delay = 55 } = {}) {
    await locator.waitFor({ state: 'visible' });
    await this.point(locator, 500);
    await locator.click();
    await locator.fill('');
    await locator.pressSequentially(String(text), { delay });
    await this.pause(400);
  }

  /** Highlights, then fills at once (dates and other inputs that don't accept key presses). */
  async fill(locator, value) {
    await locator.waitFor({ state: 'visible' });
    await this.point(locator, 500);
    await locator.fill(String(value));
    await this.pause(400);
  }

  /** Highlights, then picks an option in a select. */
  async select(locator, option) {
    await locator.waitFor({ state: 'visible' });
    await this.point(locator, 500);
    await locator.selectOption(option);
    await this.pause(500);
  }

  /** Ends the guide: closes the timeline and hides the overlay. */
  async finish() {
    await this.hideCaption();
    this.closeChapter();
    this.end = this.now();
  }

  /**
   * Writes the timeline: captions.vtt (Arabic subtitles), chapters.json (to cut the video per
   * chapter) and guide.md (the written guide with the time of each chapter).
   * @param {string} dir
   * @param {{ offsetMs?: number, videoFile?: string }} [options] offsetMs: time between the start
   *   of the video and the start of the guide clock.
   */
  writeTimeline(dir, { offsetMs = 0, videoFile = 'guide.webm' } = {}) {
    fs.mkdirSync(dir, { recursive: true });
    const shift = (ms) => ms + offsetMs;

    const vtt = ['WEBVTT', ''];
    this.captions.forEach((c, i) => {
      vtt.push(String(i + 1));
      vtt.push(`${formatVttTime(shift(c.start))} --> ${formatVttTime(shift(c.end ?? this.end))}`);
      vtt.push(`الخطوة ${c.step}: ${c.text}`, '');
    });
    fs.writeFileSync(path.join(dir, 'captions.vtt'), vtt.join('\n'), 'utf8');

    const chapters = this.chapters.map((c) => ({
      number: c.number,
      title: c.title,
      subtitle: c.subtitle,
      startMs: shift(c.start),
      endMs: shift(c.end ?? this.end),
      steps: c.steps,
    }));
    fs.writeFileSync(
      path.join(dir, 'chapters.json'),
      JSON.stringify({ video: videoFile, chapters }, null, 2),
      'utf8',
    );

    const md = [
      '# دليل استخدام برنامج إدارة الفرع (فيديو)',
      '',
      `الفيديو الكامل: \`${videoFile}\` — الترجمة: \`captions.vtt\`. كل فصل متوفر أيضاً كمقطع منفصل.`,
      '',
    ];
    chapters.forEach((c) => {
      md.push(`## الفصل ${c.number}: ${c.title} (${formatClock(c.startMs)})`, '');
      if (c.subtitle) md.push(c.subtitle, '');
      c.steps.forEach((s, i) => md.push(`${i + 1}. ${s}`));
      md.push('');
    });
    fs.writeFileSync(path.join(dir, 'guide.md'), md.join('\n'), 'utf8');
    return chapters;
  }
}

module.exports = { Guide, readingTime, formatVttTime };
