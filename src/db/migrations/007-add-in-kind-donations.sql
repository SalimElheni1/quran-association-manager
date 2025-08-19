-- Migration: Add support for in-kind donations

-- Add donation_type to distinguish between 'Cash' and 'In-kind'
ALTER TABLE donations ADD COLUMN donation_type TEXT NOT NULL DEFAULT 'Cash';

-- Add description for in-kind items
ALTER TABLE donations ADD COLUMN description TEXT;
