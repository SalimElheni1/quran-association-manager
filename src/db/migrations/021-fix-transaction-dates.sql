-- Migration: Fix transaction dates stored as timestamps
-- Description: Convert timestamp dates to proper date strings

UPDATE transactions 
SET transaction_date = date(transaction_date / 1000, 'unixepoch')
WHERE typeof(transaction_date) = 'integer';
