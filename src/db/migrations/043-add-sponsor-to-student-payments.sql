-- Migration 043: Add sponsor tracking to student_payments
-- Track which sponsor made the payment for sponsored students

ALTER TABLE student_payments ADD COLUMN sponsor_name TEXT;
ALTER TABLE student_payments ADD COLUMN sponsor_phone TEXT;
