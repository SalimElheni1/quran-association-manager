-- Migration: Link credit charges back to the payment that created them
-- Description: H10. Overpayment credit is stored as a CREDIT fee_type charge.
-- source_payment_id lets refund/delete reverse only the credit a given payment
-- created, instead of guessing by description text.

ALTER TABLE student_fee_charges ADD COLUMN source_payment_id INTEGER;
