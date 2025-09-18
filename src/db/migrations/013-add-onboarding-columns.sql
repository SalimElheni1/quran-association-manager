-- 013-add-onboarding-columns.sql
ALTER TABLE users ADD COLUMN need_guide INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN current_step INTEGER DEFAULT 0;
-- For existing users (pre-migration), set guide enabled and reset step to 0
UPDATE users SET need_guide = 1 WHERE need_guide IS NULL OR need_guide NOT IN (0,1);
UPDATE users SET current_step = 0 WHERE current_step IS NULL;
