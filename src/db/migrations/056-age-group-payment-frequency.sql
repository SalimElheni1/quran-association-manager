-- Migration 056: payment system (monthly/annual) per age group
--
-- Branches define their own age groups now, so the payment system moves from
-- the three fixed men/women/kids settings onto each age group; classes take it
-- from their age group. Those settings never reached classes created in the
-- app (their gender column stays 'all'), so this is where they start to apply.
--
-- Starting values come from the old settings: groups under 18 from the kids
-- setting, adult male-only and female-only groups from the men/women settings,
-- adult mixed groups only when men and women agree. Anything else: MONTHLY.

ALTER TABLE age_groups ADD COLUMN payment_frequency TEXT NOT NULL DEFAULT 'MONTHLY'
  CHECK (payment_frequency IN ('MONTHLY', 'ANNUAL'));

UPDATE age_groups SET payment_frequency = 'ANNUAL'
WHERE min_age < 18
  AND (SELECT UPPER(value) FROM settings WHERE key = 'kids_payment_frequency') = 'ANNUAL';

UPDATE age_groups SET payment_frequency = 'ANNUAL'
WHERE min_age >= 18 AND gender = 'male_only'
  AND (SELECT UPPER(value) FROM settings WHERE key = 'men_payment_frequency') = 'ANNUAL';

UPDATE age_groups SET payment_frequency = 'ANNUAL'
WHERE min_age >= 18 AND gender = 'female_only'
  AND (SELECT UPPER(value) FROM settings WHERE key = 'women_payment_frequency') = 'ANNUAL';

UPDATE age_groups SET payment_frequency = 'ANNUAL'
WHERE min_age >= 18 AND gender = 'any'
  AND (SELECT UPPER(value) FROM settings WHERE key = 'men_payment_frequency') = 'ANNUAL'
  AND (SELECT UPPER(value) FROM settings WHERE key = 'women_payment_frequency') = 'ANNUAL';

-- A month is now billed only when it starts (next month may still be billed from
-- the configured generation day). Earlier versions billed two months ahead when a
-- student was added; remove those untouched future monthly charges. Only charges
-- two or more months ahead, with nothing paid or allocated, are removed; they are
-- recreated when their month arrives. billing_month is "YYYY-YYYY-MM"
-- (academic year + month); the calendar year is the academic start year, plus one
-- for months before the configured start month.
DELETE FROM student_fee_charges
WHERE fee_type = 'MONTHLY'
  AND status = 'UNPAID'
  AND COALESCE(amount_paid, 0) = 0
  AND billing_month IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM student_payment_breakdown b WHERE b.student_fee_charge_id = student_fee_charges.id
  )
  AND (
    (CAST(substr(billing_month, 1, 4) AS INTEGER)
      + CASE
          WHEN CAST(substr(billing_month, 11, 2) AS INTEGER) < COALESCE(
            (SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'academic_year_start_month'), 9)
          THEN 1 ELSE 0
        END) * 12
    + CAST(substr(billing_month, 11, 2) AS INTEGER)
  ) - (
    CAST(strftime('%Y', 'now', 'localtime') AS INTEGER) * 12
    + CAST(strftime('%m', 'now', 'localtime') AS INTEGER)
  ) >= 2;
