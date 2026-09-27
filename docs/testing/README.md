# Manual test campaign

- `test-plan-1.4.0-beta.1.xlsx`: the test plan (Arabic). 139 tests in 13 areas, instructions,
  bug reports and automatic progress per area and per tester.
- `form-setup.gs`: a Google Apps Script that turns it into a form-based campaign. Testers only
  **view** the plan and answer a **Google Form** (no Google account needed): register, claim an
  area, report each test result, report bugs. The script writes every answer into the plan, so
  nobody but the coordinator can edit (or break) it.

## Setup (once, about 5 minutes)

1. Upload `test-plan-1.4.0-beta.1.xlsx` to Google Drive, open it, **File → Save as Google Sheets**.
2. In that Google Sheet: **Extensions → Apps Script**. Delete the sample code, paste the whole
   content of `form-setup.gs`, and click **Save** (disk icon).
3. Back in the sheet, reload the page. A menu **«خطة الاختبار»** appears next to «Help».
4. **خطة الاختبار → إعداد النموذج (مرة واحدة)**. Google asks for permissions: choose your
   account, then **Advanced → Go to … (unsafe) → Allow** (it is your own script, running in
   your account; Google shows this warning for any script it hasn't reviewed).
5. A window shows the links. Send testers:
   - the **form link** (they register, claim areas and report everything there);
   - the **plan link** (view only: steps of each test, progress).

   The third link opens the private spreadsheet «ردود المختبرين (خاص)» with every raw answer,
   the testers' phone numbers and a processing log. Only you can open it.

The links stay available in **خطة الاختبار → روابط المشاركة**.

## What happens on each answer

| Tester chooses | Written into the plan |
|---|---|
| «أنا مختبِر جديد» | name and device in «ابدأ هنا» (the phone number stays in the private file) |
| «حجز قسم» | their name as the area's tester, with the date (only free areas are offered) |
| «تسجيل نتيجة اختبار» | the status, date and a dated note on the test |
| … with «فشل» | the bug details in «الأخطاء والملاحظات», and its number (B-…) on the test |
| «الإبلاغ عن خطأ أو ملاحظة» | a bug/remark without a test number |

The form's lists (testers, free areas, tests) update after each registration or claim, or from
**خطة الاختبار → تحديث قوائم النموذج** after you edit the plan by hand.

You, as the owner, can still edit everything: update «حالة المعالجة» and «رد المطوّر» in the bug
tab, fix a status, or remove a tester. **File → Version history** restores any earlier state.
