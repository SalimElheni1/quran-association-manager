-- Add new columns for structured memorization tracking
ALTER TABLE students ADD COLUMN memorization_surah_id INTEGER;
ALTER TABLE students ADD COLUMN memorization_juz_id INTEGER;

-- Optional: Add foreign key constraints if you have surah and juz tables.
-- For this implementation, we are using IDs from the frontend data source.
-- A future migration could create these tables and establish formal relationships.
-- Example:
-- CREATE TABLE surahs (id INTEGER PRIMARY KEY, name TEXT UNIQUE);
-- ALTER TABLE students ADD FOREIGN KEY (memorization_surah_id) REFERENCES surahs(id);