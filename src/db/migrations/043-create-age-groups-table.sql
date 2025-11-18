-- Migration: Create Age Groups Table
-- Description: Adds flexible age group system replacing simple threshold
-- Created: 2025-11-14
-- Run: This should be executed on existing databases to add the age_groups table

CREATE TABLE IF NOT EXISTS age_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    min_age INTEGER NOT NULL CHECK(min_age >= 0),
    max_age INTEGER NULL CHECK(max_age IS NULL OR max_age >= min_age),
    gender TEXT NOT NULL CHECK(gender IN ('male_only', 'female_only', 'any')),
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default age groups for Tunisian Quranic associations
INSERT OR IGNORE INTO age_groups (uuid, name, description, min_age, max_age, gender, is_active) VALUES
  ('children-6-11', 'الأطفال', 'الأطفال وهم الذين تتراوح أعمارهم بين 6 و 11 سنة', 6, 11, 'any', 1),
  ('youth-boys-12-14', 'الناشئون (ذكور)', 'الناشئون الذكور من 12 إلى 14 سنة', 12, 14, 'male_only', 1),
  ('youth-girls-12-14', 'الناشئون (إناث)', 'الناشئون الإناث من 12 إلى 14 سنة', 12, 14, 'female_only', 1),
  ('young-adults-boys-15-17', 'الشباب (ذكور)', 'الشباب الذكور من 15 إلى 17 سنة', 15, 17, 'male_only', 1),
  ('young-adults-girls-15-17', 'الشباب (إناث)', 'الشباب الإناث من 15 إلى 17 سنة', 15, 17, 'female_only', 1),
  ('men-18-plus', 'الرجال', 'الرجال البالغون (18 سنة فما فوق)', 18, NULL, 'male_only', 1),
  ('women-18-plus', 'النساء', 'النساء البالغات (18 سنة فما فوق)', 18, NULL, 'female_only', 1);
