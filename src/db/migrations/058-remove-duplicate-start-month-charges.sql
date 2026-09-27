-- Migration 058: remove the duplicate charge of the academic year's first month
--
-- Until this release, next month's charges billed from the generation day (e.g. 25 August)
-- took the academic year of the day they were billed, so the first month of a new academic
-- year was billed under the ending year ("2025-2026-09") and billed again when the month
-- started ("2026-2027-09"). This removes the first of those two charges, only when:
--   - it is for the configured start month and was billed in the later calendar year of its
--     academic year (the charge of a genuine "2025-2026-09" is billed in 2025),
--   - the student also has the correctly dated charge of the same month, and
--   - nothing was paid or allocated on it.
-- Charges already paid are left as they are.

DELETE FROM student_fee_charges
WHERE fee_type = 'MONTHLY'
  AND status = 'UNPAID'
  AND COALESCE(amount_paid, 0) = 0
  AND billing_month IS NOT NULL
  AND length(billing_month) = 12
  AND CAST(substr(billing_month, 11, 2) AS INTEGER) = COALESCE(
    (SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'academic_year_start_month'), 9)
  AND CAST(substr(charge_date, 1, 4) AS INTEGER) >= CAST(substr(billing_month, 6, 4) AS INTEGER)
  AND NOT EXISTS (
    SELECT 1 FROM student_payment_breakdown b WHERE b.student_fee_charge_id = student_fee_charges.id
  )
  AND EXISTS (
    SELECT 1 FROM student_fee_charges twin
    WHERE twin.student_id = student_fee_charges.student_id
      AND twin.fee_type = 'MONTHLY'
      AND twin.id != student_fee_charges.id
      AND twin.billing_month =
        (CAST(substr(student_fee_charges.billing_month, 1, 4) AS INTEGER) + 1) || '-' ||
        (CAST(substr(student_fee_charges.billing_month, 6, 4) AS INTEGER) + 1) || '-' ||
        substr(student_fee_charges.billing_month, 11, 2)
  );

-- A charge billed that way whose month has not started yet has no correctly dated twin; it
-- moves to the new academic year so the month is not billed a second time when it starts.
UPDATE student_fee_charges
SET academic_year =
      (CAST(substr(billing_month, 1, 4) AS INTEGER) + 1) || '-' ||
      (CAST(substr(billing_month, 6, 4) AS INTEGER) + 1),
    description = replace(
      description,
      substr(billing_month, 1, 9),
      (CAST(substr(billing_month, 1, 4) AS INTEGER) + 1) || '-' ||
      (CAST(substr(billing_month, 6, 4) AS INTEGER) + 1)),
    billing_month =
      (CAST(substr(billing_month, 1, 4) AS INTEGER) + 1) || '-' ||
      (CAST(substr(billing_month, 6, 4) AS INTEGER) + 1) || '-' ||
      substr(billing_month, 11, 2)
WHERE fee_type = 'MONTHLY'
  AND status = 'UNPAID'
  AND COALESCE(amount_paid, 0) = 0
  AND billing_month IS NOT NULL
  AND length(billing_month) = 12
  AND CAST(substr(billing_month, 11, 2) AS INTEGER) = COALESCE(
    (SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'academic_year_start_month'), 9)
  AND CAST(substr(charge_date, 1, 4) AS INTEGER) >= CAST(substr(billing_month, 6, 4) AS INTEGER)
  AND NOT EXISTS (
    SELECT 1 FROM student_payment_breakdown b WHERE b.student_fee_charge_id = student_fee_charges.id
  );
