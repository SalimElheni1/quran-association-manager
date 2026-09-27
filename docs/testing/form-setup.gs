/**
 * Tester form for the manual test campaign.
 *
 * Testers never edit the test plan: they answer a Google Form (no account needed), and this
 * script writes each answer into the test plan, which they only view. Setup, once:
 *   1. Import test-plan-1.4.0-beta.1.xlsx into Google Sheets (File → Save as Google Sheets).
 *   2. In that Google Sheet: Extensions → Apps Script, replace the code with this file, save.
 *   3. Reload the Google Sheet. A «خطة الاختبار» menu appears: choose «إعداد النموذج (مرة
 *      واحدة)» and accept the permissions (Google warns the app isn't verified: Advanced →
 *      Go to … (unsafe) → Allow; it is your own script, running in your account).
 *   4. A window shows the two links to send to testers (also: menu → «روابط المشاركة»).
 *
 * What it creates:
 *   - The form: register (first time), claim an area, report a test result (with the bug
 *     details when it failed), or report a bug/remark on its own.
 *   - A private spreadsheet «ردود المختبرين (خاص)» with the raw answers (phone numbers stay
 *     there) and a processing log. Only you can open it.
 *   - A trigger that writes every answer into this sheet: tester list, area owner, test status,
 *     date and notes, bug reports. Progress and the dashboard follow from the formulas.
 *   - View-only sharing of this sheet for anyone with the link.
 */

const SHEETS = {
  start: 'ابدأ هنا',
  help: 'التعليمات',
  areas: 'الأقسام',
  tests: 'الاختبارات',
  bugs: 'الأخطاء والملاحظات',
  dash: 'المتابعة',
};

// Layout of the test plan (see docs/testing/README.md).
const START_FIRST_ROW = 8; // tester rows: A name, B registered, C device
const START_LAST_ROW = 47;
const AREAS_FIRST_ROW = 2; // A code, B name, H owner, I date claimed
const TESTS_FIRST_ROW = 2; // A id, D title, J status, K date, L notes, M bug id
const BUGS_FIRST_ROW = 2; // A id, B date, C reporter, D test, E severity, F did, G happened, H expected, I screenshot

const Q = {
  name: 'اسمك',
  regName: 'الاسم واللقب',
  regPhone: 'رقم الهاتف (يراه المنسق فقط)',
  regDevice: 'جهازك',
  action: 'ماذا تريد أن تفعل الآن؟',
  area: 'القسم الذي تريد حجزه',
  test: 'رقم الاختبار',
  result: 'النتيجة',
  notes: 'ملاحظات (اختياري)',
  did: 'ماذا فعلت؟ (الخطوات)',
  happened: 'ماذا حدث؟',
  expected: 'ماذا كنت تتوقع؟',
  severity: 'درجة الخطورة',
  screenshot: 'لقطة الشاشة',
};
const NEW_TESTER = '✚ أنا مختبِر جديد — سجّلني';
const ACTIONS = {
  claim: 'حجز قسم لاختباره',
  result: 'تسجيل نتيجة اختبار',
  bug: 'الإبلاغ عن خطأ أو ملاحظة (بدون رقم اختبار)',
};
const RESULTS = ['نجح', 'فشل', 'متوقف'];
const SEVERITIES = ['عاجل', 'مهم', 'بسيط', 'اقتراح'];
const SEP = ' — ';

// ------------------------------------------------------------------------------------ menu

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('خطة الاختبار')
    .addItem('روابط المشاركة', 'showLinks')
    .addItem('تحديث قوائم النموذج', 'refreshFormLists')
    .addSeparator()
    .addItem('إعداد النموذج (مرة واحدة)', 'setupTesterForm')
    .addToUi();
}

function props_() {
  // Script properties: also readable when the form (not the sheet) runs the trigger.
  return PropertiesService.getScriptProperties();
}

function planSpreadsheet_() {
  const id = props_().getProperty('PLAN_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(ss, key) {
  const sheet = ss.getSheetByName(SHEETS[key]);
  if (!sheet) throw new Error(`التبويب «${SHEETS[key]}» غير موجود. استورد آخر نسخة من ملف خطة الاختبار.`);
  return sheet;
}

// ------------------------------------------------------------------------------------ setup

function setupTesterForm() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach((key) => sheet_(ss, key));

  const props = props_();
  if (props.getProperty('FORM_ID')) {
    const again = ui.alert(
      'النموذج موجود',
      'تم إعداد النموذج من قبل. هل تريد إنشاء نموذج جديد؟ (القديم يبقى في Drive ويتوقف ربطه)',
      ui.ButtonSet.YES_NO,
    );
    if (again !== ui.Button.YES) return;
    ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  }

  const form = FormApp.create('نموذج المختبرين — برنامج إدارة فروع القرآن الكريم');
  form
    .setDescription(
      'سجّل هنا كل ما تقوم به أثناء الاختبار: التسجيل كمختبِر، حجز قسم، نتيجة كل اختبار، والأخطاء. ' +
        'خطوات كل اختبار موجودة في ملف خطة الاختبار (رابط للقراءة فقط). يمكنك إرسال النموذج مرات كثيرة.',
    )
    .setCollectEmail(false)
    .setAllowResponseEdits(false)
    .setShowLinkToRespondAgain(true)
    .setProgressBar(false)
    .setConfirmationMessage(
      'شكراً! تم التسجيل، ويظهر في ملف المتابعة خلال دقيقة. لتسجيل نتيجة أخرى اضغط «إرسال رد آخر».',
    );
  try {
    form.setRequireLogin(false); // Google Workspace accounts only; personal accounts never require it
  } catch (e) {
    // not applicable
  }

  // Section 1: who are you
  const nameItem = form.addListItem().setTitle(Q.name).setRequired(true);

  // Section 2: registration (first time only)
  const regPage = form.addPageBreakItem().setTitle('التسجيل كمختبِر جديد');
  form.addTextItem().setTitle(Q.regName).setHelpText('كما تريد أن يظهر في ملف المتابعة').setRequired(true);
  form.addTextItem().setTitle(Q.regPhone).setRequired(false);
  form
    .addMultipleChoiceItem()
    .setTitle(Q.regDevice)
    .setChoiceValues(['Windows 11', 'Windows 10', 'غير ذلك'])
    .setRequired(true);

  // Section 3: what to do
  const actionPage = form.addPageBreakItem().setTitle('ماذا تريد أن تفعل؟');
  const actionItem = form.addMultipleChoiceItem().setTitle(Q.action).setRequired(true);

  // Section 4: claim an area
  const claimPage = form
    .addPageBreakItem()
    .setTitle('حجز قسم')
    .setHelpText('تظهر هنا الأقسام المتاحة فقط. بعد الحجز ستجد اسمك على اختبارات القسم في ملف خطة الاختبار.');
  const areaItem = form.addListItem().setTitle(Q.area).setRequired(true);

  // Section 5: test result
  const resultPage = form
    .addPageBreakItem()
    .setTitle('نتيجة اختبار')
    .setHelpText('اختر رقم الاختبار كما هو في ملف خطة الاختبار (مثلاً FEE-02).');
  resultPage.setGoToPage(FormApp.PageNavigationType.SUBMIT); // after «حجز قسم»: send
  const testItem = form.addListItem().setTitle(Q.test).setRequired(true);
  const resultItem = form.addMultipleChoiceItem().setTitle(Q.result).setRequired(true);
  form.addParagraphTextItem().setTitle(Q.notes).setRequired(false);

  // Section 6: bug details
  const bugPage = form
    .addPageBreakItem()
    .setTitle('تفاصيل الخطأ أو الملاحظة')
    .setHelpText('كلما كانت التفاصيل أوضح، كان إصلاح الخطأ أسرع.');
  form.addParagraphTextItem().setTitle(Q.did).setRequired(true);
  form.addParagraphTextItem().setTitle(Q.happened).setRequired(true);
  form.addParagraphTextItem().setTitle(Q.expected).setRequired(false);
  form
    .addMultipleChoiceItem()
    .setTitle(Q.severity)
    .setChoiceValues(SEVERITIES)
    .setHelpText('عاجل: يمنع العمل أو يضيّع بيانات أو مبالغ خاطئة • مهم: وظيفة لا تعمل • بسيط: شكل أو نص • اقتراح: فكرة')
    .setRequired(true);
  form
    .addTextItem()
    .setTitle(Q.screenshot)
    .setHelpText('أرسل الصورة على واتساب واكتب هنا «واتساب»، أو ضع رابط الصورة')
    .setRequired(false);

  actionItem.setChoices([
    actionItem.createChoice(ACTIONS.claim, claimPage),
    actionItem.createChoice(ACTIONS.result, resultPage),
    actionItem.createChoice(ACTIONS.bug, bugPage),
  ]);
  resultItem.setChoices([
    resultItem.createChoice('نجح', FormApp.PageNavigationType.SUBMIT),
    resultItem.createChoice('فشل', bugPage),
    resultItem.createChoice('متوقف', FormApp.PageNavigationType.SUBMIT),
  ]);

  props.setProperties({
    PLAN_ID: ss.getId(),
    FORM_ID: form.getId(),
    ITEM_NAME: String(nameItem.getId()),
    ITEM_AREA: String(areaItem.getId()),
    ITEM_TEST: String(testItem.getId()),
    PAGE_REG: String(regPage.getId()),
    PAGE_ACTION: String(actionPage.getId()),
  });
  refreshFormLists();

  // Raw answers go to a private spreadsheet: phone numbers never reach the shared sheet.
  const responses = SpreadsheetApp.create('ردود المختبرين (خاص) — خطة الاختبار');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, responses.getId());
  const log = responses.insertSheet('سجل المعالجة');
  log.appendRow(['الوقت', 'المختبِر', 'العملية', 'النتيجة']);
  log.setRightToLeft(true);
  props.setProperty('RESPONSES_ID', responses.getId());

  ScriptApp.newTrigger('onTesterFormSubmit').forForm(form).onFormSubmit().create();

  // The plan: view-only for anyone with the link; the form: open to anyone.
  DriveApp.getFileById(ss.getId()).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  adaptPlanForForm_(ss, form);
  Logger.log(`Form: ${form.getPublishedUrl()}\nPlan (view only): ${ss.getUrl()}`);
  showLinks();
}

/** Refreshes the form's dropdowns: registered testers, available areas, tests. */
function refreshFormLists() {
  const props = props_();
  const formId = props.getProperty('FORM_ID');
  if (!formId) throw new Error('شغّل «إعداد النموذج» أولاً.');
  const form = FormApp.openById(formId);
  const ss = planSpreadsheet_();

  const regPage = form.getItemById(Number(props.getProperty('PAGE_REG'))).asPageBreakItem();
  const actionPage = form.getItemById(Number(props.getProperty('PAGE_ACTION'))).asPageBreakItem();

  const nameItem = form.getItemById(Number(props.getProperty('ITEM_NAME'))).asListItem();
  const names = testerNames_(ss);
  nameItem.setChoices(
    [nameItem.createChoice(NEW_TESTER, regPage)].concat(
      names.map((n) => nameItem.createChoice(n, actionPage)),
    ),
  );

  const areaItem = form.getItemById(Number(props.getProperty('ITEM_AREA'))).asListItem();
  const available = areaChoices_(ss).filter((a) => !a.owner);
  areaItem.setChoiceValues(
    available.length ? available.map((a) => a.label) : ['كل الأقسام محجوزة — تواصل مع المنسق'],
  );

  const testItem = form.getItemById(Number(props.getProperty('ITEM_TEST'))).asListItem();
  testItem.setChoiceValues(testChoices_(ss));
}

function showLinks() {
  const props = props_();
  const formId = props.getProperty('FORM_ID');
  if (!formId) {
    SpreadsheetApp.getUi().alert('لم يتم إعداد النموذج بعد: خطة الاختبار ← إعداد النموذج.');
    return;
  }
  const form = FormApp.openById(formId);
  const ss = planSpreadsheet_();
  const html = HtmlService.createHtmlOutput(
    `<div dir="rtl" style="font-family:Arial;line-height:1.8">
      <p><b>1. رابط النموذج</b> (يسجل به المختبرون كل شيء، بدون حساب):<br>
      <a href="${form.getPublishedUrl()}" target="_blank">${form.getPublishedUrl()}</a></p>
      <p><b>2. رابط خطة الاختبار</b> (للقراءة فقط):<br>
      <a href="${ss.getUrl()}" target="_blank">${ss.getUrl()}</a></p>
      <p><b>3. الردود الخام وأرقام الهواتف</b> (خاص بك فقط):<br>
      <a href="${SpreadsheetApp.openById(props.getProperty('RESPONSES_ID')).getUrl()}" target="_blank">افتح ملف الردود</a></p>
      <p style="color:#555">أرسل الرابطين 1 و2 إلى المختبرين.</p></div>`,
  )
    .setWidth(560)
    .setHeight(330);
  SpreadsheetApp.getUi().showModalDialog(html, 'روابط المشاركة');
}

/** Rewrites the plan's instructions for the form, and greys out the cells testers used to fill. */
function adaptPlanForForm_(ss, form) {
  const url = form.getPublishedUrl();
  const start = sheet_(ss, 'start');
  start.getRange('A1').setValue('ابدأ هنا — كل ما تسجله يكون عبر النموذج، وهذا الملف للقراءة والمتابعة');
  const steps = [
    ['افتح النموذج واختر «أنا مختبِر جديد» لتسجيل اسمك (مرة واحدة فقط).', 'افتح النموذج'],
    ['في النموذج اختر «حجز قسم»، ثم ارجع إلى تبويب «الأقسام» لقراءة ما يغطيه.', 'افتح النموذج'],
    ['اقرأ خطوات كل اختبار في تبويب «الاختبارات»، ونفّذها في البرنامج، ثم سجّل النتيجة في النموذج.', 'افتح النموذج'],
    ['إن فشل اختبار، يطلب منك النموذج تفاصيل الخطأ. سطرك في الجدول أدناه يعرض تقدمك.', 'افتح النموذج'],
  ];
  steps.forEach(([text, label], i) => {
    start.getRange(2 + i, 2).setValue(text);
    start.getRange(2 + i, 8).setFormula(`=HYPERLINK("${url}","${label}")`);
  });
  start.getRange(START_FIRST_ROW - 1, 2, 1, 2).setValues([['مسجّل', 'الجهاز']]);

  const grey = '#EEF1F0';
  start.getRange(START_FIRST_ROW, 1, START_LAST_ROW - START_FIRST_ROW + 1, 3).setBackground(grey);
  const areas = sheet_(ss, 'areas');
  areas.getRange(AREAS_FIRST_ROW, 8, Math.max(1, areas.getLastRow() - 1), 2).setBackground(grey);
  const tests = sheet_(ss, 'tests');
  tests.getRange(TESTS_FIRST_ROW, 10, Math.max(1, tests.getLastRow() - 1), 4).setBackground(grey);
  const bugs = sheet_(ss, 'bugs');
  bugs.getRange(BUGS_FIRST_ROW, 2, Math.max(1, bugs.getLastRow() - 1), 8).setBackground(grey);

  const help = sheet_(ss, 'help');
  const replacements = [
    ['في تبويب «ابدأ هنا» (أول تبويب) اكتب اسمك وهاتفك ونوع جهازك في أول سطر فارغ. سطرك يعرض بعدها أقسامك وتقدمك وأخطاءك.',
      'افتح النموذج (الرابط في تبويب «ابدأ هنا») واختر «أنا مختبِر جديد». يظهر اسمك بعدها في جدول «ابدأ هنا» مع أقسامك وتقدمك.'],
    ['في تبويب «الأقسام» اختر قسماً حالته «متاح للحجز»، واختر اسمك في عمود «المختبِر المسؤول». ابدأ بقسم «التثبيت وأول تشغيل» إن كان جهازك جديداً. يمكنك حجز أكثر من قسم.',
      'في النموذج اختر «حجز قسم» (تظهر الأقسام المتاحة فقط). ابدأ بقسم «التثبيت وأول تشغيل» إن كان جهازك جديداً. يمكنك حجز أكثر من قسم.'],
    ['اختر الحالة من القائمة في عمود «الحالة» واكتب تاريخ اليوم. إن كان هناك شيء غريب اكتبه في «ملاحظات المختبِر» حتى لو نجح الاختبار.',
      'في النموذج اختر «تسجيل نتيجة اختبار»، ثم رقم الاختبار والنتيجة. إن كان هناك شيء غريب اكتبه في الملاحظات حتى لو نجح الاختبار.'],
    ['إن فشل اختبار: أضف سطراً في «الأخطاء والملاحظات» واكتب رقم الخطأ (مثلاً B-004) في عمود «رقم الخطأ» في سطر الاختبار.',
      'إن اخترت «فشل» يطلب منك النموذج تفاصيل الخطأ، ويُسجَّل تلقائياً في «الأخطاء والملاحظات» مع رقمه.'],
    ['لا تحذف أسطراً ولا أعمدة في هذا الملف. الخلايا الصفراء لك، والخلايا الرمادية تُحسب تلقائياً.',
      'هذا الملف للقراءة فقط: كل ما تسجله في النموذج يظهر هنا تلقائياً خلال دقيقة.'],
    ['الخلايا الصفراء يملؤها المختبِر أو المنسق', 'الخلايا الصفراء يملؤها المنسق'],
  ];
  replacements.forEach(([from, to]) => help.createTextFinder(from).matchEntireCell(true).replaceAllWith(to));
}

// ------------------------------------------------------------------------------------ lists

function testerNames_(ss) {
  const values = sheet_(ss, 'start')
    .getRange(START_FIRST_ROW, 1, START_LAST_ROW - START_FIRST_ROW + 1, 1)
    .getValues();
  return values.map((r) => String(r[0]).trim()).filter(Boolean);
}

function areaChoices_(ss) {
  const sheet = sheet_(ss, 'areas');
  const rows = sheet.getLastRow() - AREAS_FIRST_ROW + 1;
  if (rows < 1) return [];
  return sheet
    .getRange(AREAS_FIRST_ROW, 1, rows, 8)
    .getValues()
    .map((r, i) => ({
      row: AREAS_FIRST_ROW + i,
      code: String(r[0]).trim(),
      label: `${String(r[0]).trim()}${SEP}${String(r[1]).trim()}`,
      owner: String(r[7]).trim(),
    }))
    .filter((a) => a.code);
}

function testChoices_(ss) {
  const sheet = sheet_(ss, 'tests');
  const rows = sheet.getLastRow() - TESTS_FIRST_ROW + 1;
  if (rows < 1) return [];
  return sheet
    .getRange(TESTS_FIRST_ROW, 1, rows, 4)
    .getValues()
    .filter((r) => r[0])
    .map((r) => `${String(r[0]).trim()}${SEP}${String(r[3]).trim()}`);
}

// ------------------------------------------------------------------------------------ answers

/** Installable trigger: runs for every form submission. */
function onTesterFormSubmit(e) {
  const answers = {};
  e.response.getItemResponses().forEach((ir) => {
    answers[ir.getItem().getTitle()] = ir.getResponse();
  });
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = planSpreadsheet_();
    const outcome = applyAnswers_(ss, answers, e.response.getTimestamp());
    logOutcome_(outcome);
    if (outcome.refreshLists) refreshFormLists();
  } finally {
    lock.releaseLock();
  }
}

/**
 * Writes one form submission into the plan. Pure spreadsheet work, so it can be tested.
 * @returns {{tester: string, action: string, result: string, refreshLists: boolean}}
 */
function applyAnswers_(ss, answers, when) {
  const get = (title) => {
    const v = answers[title];
    return v === undefined || v === null ? '' : String(v).trim();
  };
  const notes = [];
  let refreshLists = false;

  let tester = get(Q.name);
  if (tester === NEW_TESTER || tester === '') {
    tester = get(Q.regName);
    if (!tester) return { tester: '', action: 'تسجيل', result: 'بدون اسم — لم يُسجَّل', refreshLists };
    const registered = registerTester_(ss, tester, get(Q.regDevice));
    notes.push(registered);
    refreshLists = true;
  }

  const action = get(Q.action);
  if (action === ACTIONS.claim) {
    notes.push(claimArea_(ss, tester, get(Q.area), when));
    refreshLists = true;
  } else if (action === ACTIONS.result) {
    const testId = get(Q.test).split(SEP)[0].trim();
    const result = get(Q.result);
    let bugId = '';
    if (result === 'فشل') bugId = addBug_(ss, tester, testId, answers, when);
    notes.push(recordResult_(ss, tester, testId, result, get(Q.notes), bugId, when));
  } else if (action === ACTIONS.bug) {
    const bugId = addBug_(ss, tester, '', answers, when);
    notes.push(bugId ? `سُجّل الخطأ ${bugId}` : 'جدول الأخطاء ممتلئ');
  }
  return { tester, action: action || 'تسجيل', result: notes.join(' • '), refreshLists };
}

function registerTester_(ss, name, device) {
  const sheet = sheet_(ss, 'start');
  const count = START_LAST_ROW - START_FIRST_ROW + 1;
  const values = sheet.getRange(START_FIRST_ROW, 1, count, 1).getValues();
  if (values.some((r) => String(r[0]).trim() === name)) return `${name} مسجّل من قبل`;
  const free = values.findIndex((r) => String(r[0]).trim() === '');
  if (free < 0) return 'جدول المختبرين ممتلئ';
  sheet.getRange(START_FIRST_ROW + free, 1, 1, 3).setValues([[name, '✓', device]]);
  return `تسجيل ${name}`;
}

function claimArea_(ss, tester, areaLabel, when) {
  const code = areaLabel.split(SEP)[0].trim();
  const area = areaChoices_(ss).find((a) => a.code === code);
  if (!area) return `قسم غير معروف: ${areaLabel}`;
  if (area.owner && area.owner !== tester) return `القسم ${code} محجوز من قبل ${area.owner}`;
  const sheet = sheet_(ss, 'areas');
  sheet.getRange(area.row, 8, 1, 2).setValues([[tester, when]]);
  return `حجز القسم ${code}`;
}

function recordResult_(ss, tester, testId, result, note, bugId, when) {
  const sheet = sheet_(ss, 'tests');
  const rows = sheet.getLastRow() - TESTS_FIRST_ROW + 1;
  const ids = sheet.getRange(TESTS_FIRST_ROW, 1, rows, 1).getValues();
  const index = ids.findIndex((r) => String(r[0]).trim() === testId);
  if (index < 0) return `اختبار غير معروف: ${testId}`;
  const row = TESTS_FIRST_ROW + index;
  const current = sheet.getRange(row, 12, 1, 2).getValues()[0];
  const stamp = Utilities.formatDate(when, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const line = note ? `[${stamp} ${tester}] ${note}` : '';
  const notes = [String(current[0] || '').trim(), line].filter(Boolean).join('\n');
  const bugs = [String(current[1] || '').trim(), bugId].filter(Boolean).join('، ');
  sheet.getRange(row, 10, 1, 4).setValues([[result, when, notes, bugs]]);
  return `${testId}: ${result}${bugId ? ` (${bugId})` : ''}`;
}

function addBug_(ss, tester, testId, answers, when) {
  const sheet = sheet_(ss, 'bugs');
  const rows = sheet.getLastRow() - BUGS_FIRST_ROW + 1;
  const values = sheet.getRange(BUGS_FIRST_ROW, 1, rows, 9).getValues();
  // A row is free when nobody wrote in it yet (the bug number in column A is pre-filled).
  const free = values.findIndex((r) => r.slice(1).every((v) => String(v).trim() === ''));
  if (free < 0) return '';
  const get = (title) => (answers[title] === undefined ? '' : String(answers[title]).trim());
  sheet
    .getRange(BUGS_FIRST_ROW + free, 2, 1, 8)
    .setValues([[when, tester, testId, get(Q.severity), get(Q.did), get(Q.happened), get(Q.expected), get(Q.screenshot)]]);
  return String(values[free][0]).trim();
}

function logOutcome_(outcome) {
  const id = props_().getProperty('RESPONSES_ID');
  if (!id) return;
  const log = SpreadsheetApp.openById(id).getSheetByName('سجل المعالجة');
  if (log) log.appendRow([new Date(), outcome.tester, outcome.action, outcome.result]);
}

// For the local tests (Node); ignored by Apps Script.
if (typeof module !== 'undefined') {
  module.exports = { applyAnswers_, Q, NEW_TESTER, ACTIONS, SEP, SHEETS };
}
