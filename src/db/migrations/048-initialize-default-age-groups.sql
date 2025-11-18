-- Migration: Initialize default age groups
-- Description: Creates standard age groups for class categorization
-- Created: 2025-11-15

INSERT OR IGNORE INTO age_groups (uuid, name, description, min_age, max_age, gender, gender_policy, is_active)
VALUES
  ('children-6-11', 'الأطفال (6-11 سنة)', 'فئة الأطفال من 6 إلى 11 سنة', 6, 11, 'any', 'mixed', 1),
  ('teens-12-17', 'المراهقون (12-17 سنة)', 'فئة المراهقين من 12 إلى 17 سنة', 12, 17, 'any', 'mixed', 1),
  ('men-18-plus', 'الرجال (18+ سنة)', 'فئة الرجال البالغين من 18 سنة فما فوق', 18, NULL, 'male_only', 'single_gender', 1),
  ('women-18-plus', 'النساء (18+ سنة)', 'فئة النساء البالغات من 18 سنة فما فوق', 18, NULL, 'female_only', 'single_gender', 1);
