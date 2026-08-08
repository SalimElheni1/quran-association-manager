-- Migration 051: Add structured billing_month to student_fee_charges
-- Fixes duplicate charge generation: charges were deduplicated by
-- strftime('%m', charge_date), but charge_date is the CREATION date, not the
-- billed month, so charges generated early for the next month (e.g. on the
-- 25th) never matched the dedupe and were duplicated on every scheduler run.
--
-- billing_month stores a stable per-period key in the form "YYYY-YYYY-MM"
-- (academic year + month), allowing exact dedupe and deletes per period.

ALTER TABLE student_fee_charges ADD COLUMN billing_month TEXT;

-- Backfill existing rows from charge_date using the same "YYYY-YYYY-MM"
-- (academic year + month) key the code now generates, so dedupe and the
-- regeneration deletes also match legacy rows. The academic year is derived
-- from the configured academic_year_start_month setting (default September).
UPDATE student_fee_charges
SET billing_month =
  CASE
    WHEN CAST(substr(charge_date, 6, 2) AS INTEGER) >= (
      SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'academic_year_start_month'
    )
    THEN printf(
      '%d-%d-%s',
      CAST(substr(charge_date, 1, 4) AS INTEGER),
      CAST(substr(charge_date, 1, 4) AS INTEGER) + 1,
      substr(charge_date, 6, 2)
    )
    ELSE printf(
      '%d-%d-%s',
      CAST(substr(charge_date, 1, 4) AS INTEGER) - 1,
      CAST(substr(charge_date, 1, 4) AS INTEGER),
      substr(charge_date, 6, 2)
    )
  END
WHERE billing_month IS NULL AND charge_date IS NOT NULL;

CREATE INDEX idx_student_fee_charges_billing_month
  ON student_fee_charges(student_id, billing_month);
