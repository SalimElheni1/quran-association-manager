# Import System Update Plan - Financial & Inventory

## Current Issues

The import system uses legacy financial tables (donations, expenses, payments, salaries) but the new system uses a unified `transactions` table.

## Required Changes

### 1. Export Template (exportManager.js)

**Remove legacy sheets:**
- التبرعات (donations)
- المصاريف (expenses)  
- الرسوم الدراسية (payments)
- الرواتب (salaries)

**Add new sheet:**
- العمليات المالية (transactions) with columns:
  - الرقم التسلسلي (matricule) - auto-generated
  - النوع (type): INCOME / EXPENSE
  - الفئة (category): from categories table
  - نوع الوصل (receipt_type): for cash donations only
  - المبلغ (amount)
  - التاريخ (transaction_date)
  - الوصف (description) - optional
  - طريقة الدفع (payment_method): CASH / CHECK / TRANSFER
  - رقم الشيك (check_number) - if CHECK
  - رقم الوصل (voucher_number) - unique per type
  - اسم الشخص (related_person_name)
  - نوع الجهة (related_entity_type): student / teacher / donor / other
  - معرف الجهة (related_entity_id) - matricule reference

**Update المخزون sheet:**
- الحالة (condition_status): should show Arabic values (جديد، جيد، مقبول، رديء) not English
- Add total_value column (calculated or manual)

### 2. Import Processor (importManager.js)

**Remove legacy processors:**
- processDonationRow
- processExpenseRow
- processPaymentRow
- processSalaryRow

**Add new processor:**
- processTransactionRow:
  - Generate matricule automatically
  - Validate type (INCOME/EXPENSE)
  - Validate category exists in categories table
  - Validate receipt_type if category is "التبرعات النقدية"
  - Validate 500 TND rule (amount > 500 requires CHECK or TRANSFER)
  - Generate voucher_number if not provided
  - Set account_id = 1 (default cash account)
  - Set requires_dual_signature = 1 if amount > 500
  - Update account balance

**Update processInventoryRow:**
- Translate condition_status from Arabic to English before insert:
  - جديد → New
  - جيد → Good
  - مقبول → Fair
  - رديء → Poor
- Calculate total_value = quantity * unit_value if not provided
- Generate matricule automatically

### 3. Required Columns Update

```javascript
const REQUIRED_COLUMNS = {
  // Remove these:
  // 'الرسوم الدراسية': [...],
  // الرواتب: [...],
  // التبرعات: [...],
  // المصاريف: [...],
  
  // Add this:
  'العمليات المالية': ['النوع', 'الفئة', 'المبلغ', 'التاريخ', 'طريقة الدفع'],
  
  // Update this:
  المخزون: ['اسم العنصر', 'الفئة', 'الكمية', 'قيمة الوحدة'],
};
```

### 4. Template Dummy Data

**العمليات المالية examples:**
```javascript
[
  {
    type: 'INCOME',
    category: 'التبرعات النقدية',
    receipt_type: 'تبرع',
    amount: 100,
    transaction_date: '2024-09-10',
    payment_method: 'CASH',
    voucher_number: 'R-001',
    related_person_name: 'فاعل خير'
  },
  {
    type: 'EXPENSE',
    category: 'فواتير',
    amount: 150,
    transaction_date: '2024-09-03',
    payment_method: 'CASH',
    voucher_number: 'P-001',
    description: 'فاتورة الكهرباء'
  }
]
```

**المخزون examples:**
```javascript
[
  {
    item_name: 'مصحف',
    category: 'مواد تعليمية',
    quantity: 50,
    unit_value: 15.0,
    acquisition_date: '2024-01-10',
    condition_status: 'جديد',  // Arabic in template
    acquisition_source: 'تبرع'
  }
]
```

## Implementation Steps

1. Update exportManager.js - remove legacy sheets, add transactions sheet
2. Update importManager.js - remove legacy processors, add processTransactionRow
3. Update REQUIRED_COLUMNS mapping
4. Test import with sample data
5. Update documentation

## Notes

- Matricule is auto-generated, users should leave it empty for new records
- Voucher numbers must be unique per transaction type
- Receipt type is required only for "التبرعات النقدية" category
- Condition status stored as English in DB, displayed as Arabic in UI/exports
