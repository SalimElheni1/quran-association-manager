-- Migration: Track refunded student payments
-- Description: H10. Refunded payments stay in the audit trail but are marked
-- refunded so the balance/ledger views and charge allocation ignore them.

ALTER TABLE student_payments ADD COLUMN refunded INTEGER NOT NULL DEFAULT 0;
