# Import / Export Field Mapping

This document lists the canonical mapping between Excel template headers (Arabic), the renderer UI logical keys (used by `ExportModal` and `ImportModal`), and the database column names / SQL expressions used by the backend.

Purpose
- Ensure exports use the correct DB columns and joins.
- Ensure import templates keep the same Arabic headers expected by `importManager`.
- Provide a single source of truth when adding new fields or debugging mismatches.

Assumptions
- The authoritative DB schema is in `src/db/schema.js`.
- UI keys used by pages (e.g., `studentsAdultFields`, `classesFields`) are the logical keys used by `ExportModal` and passed to the backend.
- For joined/derived fields we indicate SQL expression (alias) to be used in `SELECT` (e.g., `t.name as teacher_name`).

If a DB column doesn't exist yet, add a note under "Notes" and coordinate a migration.

---

## Students (ورقة: "الطلاب")

| Arabic header | UI key | DB column / SQL expression | Notes |
|---|---:|---|---|
| الرقم التعريفي | matricule | matricule | Leave blank for new rows; system generates on import |
| الاسم واللقب | name | name | |
| تاريخ الميلاد | date_of_birth | date_of_birth | ISO yyyy-mm-dd |
| الجنس | gender | gender | Values: 'Male'/'Female' internally; templates use Arabic 'ذكر'/'أنثى' |
| العنوان | address | address | |
| رقم الهاتف | contact_info | contact_info | |
| البريد الإلكتروني | email | email | |
| الحالة | status | status | e.g., 'active','inactive' mapped to Arabic by exporters |
| مستوى الحفظ | memorization_level | memorization_level | Free text or normalized values |
| ملاحظات | notes | notes | |
| اسم ولي الأمر (طفل) | parent_name | parent_name | For child records |
| صلة القرابة (طفل) | guardian_relation | guardian_relation | |
| هاتف ولي الأمر (طفل) | parent_contact | parent_contact | |
| البريد الإلكتروني للولي (طفل) | guardian_email | guardian_email | |
| جهة الاتصال في حالات الطوارئ (طفل) | emergency_contact_name | emergency_contact_name | |
| هاتف الطوارئ (طفل) | emergency_contact_phone | emergency_contact_phone | |
| الحالة الصحية (طفل) | health_conditions | health_conditions | |
| رقم الهوية | national_id | national_id | |
| اسم المدرسة (طفل) | school_name | school_name | |
| المستوى الدراسي (طفل) | grade_level | grade_level | |
| المستوى التعليمي (راشد) | educational_level | educational_level | |
| المهنة (راشد) | occupation | occupation | |
| الحالة الاجتماعية (راشد) | civil_status | civil_status | |
| أفراد العائلة المسجلون (راشد) | related_family_members | related_family_members | |
| فئة الرسوم | fee_category | fee_category | Values: CAN_PAY / SPONSORED / EXEMPT (legacy codes) |
| اسم الكفيل | sponsor_name | sponsor_name | |
| هاتف الكفيل | sponsor_phone | sponsor_phone | |
| رقم هوية الكفيل | sponsor_cin | sponsor_cin | |
| ملاحظات المساعدة المالية | financial_assistance_notes | financial_assistance_notes | |

---

## Teachers (المعلمون)

| Arabic header | UI key | DB column / SQL expression | Notes |
|---|---:|---|---|
| الرقم التعريفي | matricule | matricule | Optional; used to update existing teacher |
| الاسم واللقب | name | name | |
| رقم الهوية | national_id | national_id | |
| رقم الهاتف | contact_info | contact_info | |
| البريد الإلكتروني | email | email | |
| العنوان | address | address | |
| تاريخ الميلاد | date_of_birth | date_of_birth | |
| الجنس | gender | gender | |
| المستوى التعليمي | educational_level | educational_level | |
| التخصص | specialization | specialization | |
| سنوات الخبرة | years_of_experience | years_of_experience | |
| أوقات التوفر | availability | availability | Free text (e.g., 'morning', 'evening') |
| ملاحظات | notes | notes | |

---

## Users (المستخدمون)

| Arabic header | UI key | DB column / SQL expression | Notes |
|---|---:|---|---|
| الرقم التعريفي | matricule | matricule | If present, used to update existing user |
| اسم المستخدم | username | username | Unique login name |
| الاسم الأول | first_name | first_name | |
| اللقب | last_name | last_name | |
| تاريخ الميلاد | date_of_birth | date_of_birth | |
| رقم الهوية | national_id | national_id | |
| البريد الإلكتروني | email | email | |
| رقم الهاتف | phone_number | phone_number | |
| المهنة | occupation | occupation | |
| الحالة الاجتماعية | civil_status | civil_status | |
| نوع التوظيف | employment_type | employment_type | e.g., contract/volunteer |
| تاريخ البدء | start_date | start_date | |
| تاريخ الانتهاء | end_date | end_date | |
| الدور | role | role | DB stores normalized role codes (e.g., 'FinanceManager') |
| الحالة | status | status | |
| ملاحظات | notes | notes | |

---

## Groups (المجموعات)

| Arabic header | UI key | DB column | Notes |
|---|---:|---|---|
| الرقم التعريفي | matricule | matricule | Optional identifier |
| اسم المجموعة | name | name | |
| الوصف | description | description | |
| الفئة | category | category | e.g., 'رجال' / 'نساء' |

---

## Classes (الفصول)

Note: `classes` sheet/exports typically join `classes` and `teachers` (teacher_id). Use `c.` and `t.` aliases.

| Arabic header / UI label | UI key | DB column / expression | Notes |
|---|---:|---|---|
| اسم الفصل | name | c.name | |
| اسم المعلم | teacher_name | t.name as teacher_name | Requires LEFT JOIN teachers t ON c.teacher_id = t.id |
| الجدول الزمني | schedule | c.schedule | Free text or JSON depending on schema |
| الجنس | gender | c.gender | Class audience (men/women/kids) |
| الحالة | status | c.status | |

---

## Inventory (المخزون)

| Arabic header | UI key | DB column | Notes |
|---|---:|---|---|
| الرقم التعريفي | matricule | matricule | Optional |
| اسم العنصر | item_name | item_name | |
| الفئة | category | category | |
| الكمية | quantity | quantity | Numeric |
| قيمة الوحدة | unit_value | unit_value | Numeric |
| تاريخ الاقتناء | acquisition_date | acquisition_date | |
| مصدر الاقتناء | acquisition_source | acquisition_source | |
| الحالة | condition_status | condition_status | e.g., 'جديد', 'مستخدم' |
| موقع التخزين | location | location | |
| ملاحظات | notes | notes | |

---

## Attendance (الحضور)

| Arabic header | UI key | DB column / SQL expression | Notes |
|---|---:|---|---|
| الرقم التعريفي للطالب | student_matricule | s.matricule or s.id lookup by matricule | Import uses matricule to resolve student id |
| اسم الفصل | class_name | c.name or c.id lookup | |
| التاريخ | date | a.date | |
| الحالة | status | a.status | Present/Absent/Late mapped to Arabic |

---

## Financial Operations (العمليات المالية)

Financial sheet mapping can vary; include the most common fields used in `generateFinancialXlsx`.

| Arabic header | UI key | DB column | Notes |
|---|---:|---|---|
| الرقم التسلسلي | matricule | matricule | Optional |
| النوع | type | type | e.g., 'income'/'expense' (localized texts used in templates)
| الفئة | category | category | |
| نوع الوصل | receipt_type | receipt_type | |
| المبلغ | amount | amount | Numeric |
| التاريخ | transaction_date | transaction_date | |
| الوصف | description | description | |
| طريقة الدفع | payment_method | payment_method | |
| رقم الشيك | check_number | check_number | |
| رقم الوصل | voucher_number | voucher_number | |
| اسم الشخص | related_person_name | related_person_name | |

---

## Notes & Next Steps

- If any UI key listed above does not match your actual renderer field arrays (e.g., `studentsAdultFields`), update the mapping here and adjust `buildFieldSelectionFor` in `src/main/exportManager.js` to match.
- For joined/aggregated fields (e.g., user role aggregation), prefer using SQL expressions and explicit JOINs rather than trying to compute in JS after a generic `SELECT`.
- After this file is reviewed, I recommend:
  1. Updating `buildFieldSelectionFor` to fully cover the UI keys for all pages.
  2. Adding minimal unit tests for `fetchExportData` for `classes` and `inventory` on a local test DB or using mocked `allQuery`.
  3. Implementing an import dry-run/validate mode in `importManager` and wiring it into `ImportWizard` UI.

If you'd like, I can now:
- update `buildFieldSelectionFor` to include any missing UI keys, or
- add tests that exercise the new `classes` and `inventory` export branches.

---

Generated: 2025-10-28
