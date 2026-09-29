# Import / Export Field Mapping

The Arabic column headers the Excel import expects and the export writes, and the database
columns they map to. The code is the reference: required headers are in
`src/main/importConstants.js` (and `REQUIRED_COLUMNS` in `importManager.js`), row mapping in the
`process…Row` functions of `src/main/importManager.js`, and export columns in
`src/main/exportManager.js`. Update this file when you change them.

- Each sheet is named after its table in Arabic (e.g. «الطلاب»). A workbook can contain any of
  the sheets; the import wizard lets the user pick which to import.
- Rows with a known matricule (الرقم التعريفي) **update** the existing record; rows without one
  are created and get a new matricule.
- Headers marked **required** must be present in the sheet.

---

## Students (ورقة: "الطلاب")

| Arabic header | UI key | DB column / SQL expression | Notes |
|---|---:|---|---|
| الرقم التعريفي | matricule | matricule | Leave blank for new rows; system generates on import |
| الاسم واللقب | name | name | **Required** |
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
| الاسم واللقب | name | name | **Required** |
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
| اسم المستخدم | username | username | **Required**. Unique login name |
| الاسم الأول | first_name | first_name | **Required** |
| اللقب | last_name | last_name | **Required** |
| تاريخ الميلاد | date_of_birth | date_of_birth | |
| رقم الهوية | national_id | national_id | |
| البريد الإلكتروني | email | email | |
| رقم الهاتف | phone_number | phone_number | |
| المهنة | occupation | occupation | |
| الحالة الاجتماعية | civil_status | civil_status | |
| نوع التوظيف | employment_type | employment_type | **Required**. contract / volunteer |
| تاريخ البدء | start_date | start_date | |
| تاريخ الانتهاء | end_date | end_date | |
| الدور | role | `user_roles` | **Required**. A role name (e.g. FinanceManager); stored as a row in `user_roles`, not a column |
| الحالة | status | status | |
| ملاحظات | notes | notes | |

---

## Groups (المجموعات)

| Arabic header | UI key | DB column | Notes |
|---|---:|---|---|
| الرقم التعريفي | matricule | matricule | Optional identifier |
| اسم المجموعة | name | name | **Required** |
| الوصف | description | description | |
| الفئة | category | category | **Required**. e.g. 'رجال' / 'نساء' |

---

## Classes (الفصول)

| Arabic header | UI key | DB column / expression | Notes |
|---|---:|---|---|
| اسم الفصل | name | c.name | **Required** |
| معرف المعلم | teacher_matricule | teacher_id (lookup by `teachers.matricule`) | **Required header**. A row may leave it empty and give اسم المعلم instead |
| اسم المعلم | teacher_name | t.name as teacher_name | Import: teacher looked up by name when there is no matricule. Export: `LEFT JOIN teachers t ON c.teacher_id = t.id` |
| نوع الفصل | class_type | c.class_type | |
| الجدول الزمني | schedule | c.schedule | JSON or free text (the header «الجدول الزمني (JSON)» is also read) |
| تاريخ البدء | start_date | c.start_date | |
| تاريخ الانتهاء | end_date | c.end_date | |
| السعة | capacity | c.capacity | |
| الجنس | gender | c.gender | Mapped to the stored class audience |
| الحالة | status | c.status | Mapped to the stored status |

---|---:|---|---|
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
| اسم العنصر | item_name | item_name | **Required** |
| الفئة | category | category | **Required** |
| الكمية | quantity | quantity | **Required**. Numeric |
| قيمة الوحدة | unit_value | unit_value | **Required**. Numeric |
| تاريخ الاقتناء | acquisition_date | acquisition_date | |
| مصدر الاقتناء | acquisition_source | acquisition_source | |
| الحالة | condition_status | condition_status | e.g., 'جديد', 'مستخدم' |
| موقع التخزين | location | location | |
| ملاحظات | notes | notes | |

---

## Attendance (الحضور)

| Arabic header | UI key | DB column / SQL expression | Notes |
|---|---:|---|---|
| الرقم التعريفي للطالب | student_matricule | s.matricule or s.id lookup by matricule | **Required**. Import uses matricule to resolve student id |
| اسم الفصل | class_name | c.name or c.id lookup | **Required** |
| التاريخ | date | a.date | **Required** |
| الحالة | status | a.status | **Required**. Present/Absent/Late mapped to Arabic |

---

## Financial Operations (العمليات المالية)

Rows become `transactions`. Arabic type, category and payment-method values are mapped to the stored codes (e.g. «مدخول» → `INCOME`, «نقدي» → `CASH`).

| Arabic header | UI key | DB column | Notes |
|---|---:|---|---|
| الرقم التسلسلي | matricule | matricule | Optional |
| النوع | type | type | **Required**. «مدخول» / «مصروف» (or «إيراد» / «مصاريف») |
| الفئة | category | category | **Required** |
| نوع الوصل | receipt_type | receipt_type | |
| المبلغ | amount | amount | **Required**. Numeric |
| التاريخ | transaction_date | transaction_date | **Required** |
| الوصف | description | description | |
| طريقة الدفع | payment_method | payment_method | **Required**. «نقدي» / «شيك» / «تحويل (بنكي)» |
| رقم الشيك | check_number | check_number | |
| رقم الوصل | voucher_number | voucher_number | |
| اسم الشخص | related_person_name | related_person_name | |

---

## Student Fees (رسوم الطلاب)

Each row is recorded as a student payment and applied to the student's charges like a payment
made in the app.

| Arabic header | Field | Notes |
|---|---|---|
| رقم التعريفي | student matricule | **Required**. The student must exist |
| المبلغ | amount | **Required** |
| تاريخ الدفع | payment_date | **Required** |
| طريقة الدفع | payment_method | **Required**. «نقدي» / «شيك» / «تحويل (بنكي)» |
| نوع الدفعة | payment_type | «رسوم شهرية» / «رسوم سنوية» / «رسوم خاصة» (MONTHLY / ANNUAL / SPECIAL) |
| السنة الدراسية | academic_year | `YYYY-YYYY`; defaults to the current academic year |
| رقم تعريفي الفصل | class matricule | For special (class) fees |
| رقم الشيك | check_number | |
| رقم الوصل | receipt_number | Must be unique; generated (`RCP-YYYY-NNNN`) when empty |
| ملاحظات | notes | |
