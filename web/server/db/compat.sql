-- SQLite functions used by the shared handlers (src/main), so their SQL runs unchanged on
-- PostgreSQL. Branch requests search `branch_<id>, compat`. Idempotent: runs at every start.

CREATE SCHEMA IF NOT EXISTS compat;

-- CURRENT_TIMESTAMP / date('now') as SQLite writes them: UTC text.
CREATE OR REPLACE FUNCTION compat.sqlite_now() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') $$;

CREATE OR REPLACE FUNCTION compat.sqlite_today() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD') $$;

-- A SQLite time value (text) as a timestamp; NULL when it is not a date, as in SQLite.
CREATE OR REPLACE FUNCTION compat.to_ts(v text) RETURNS timestamp
  LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF v IS NULL OR btrim(v) = '' THEN
    RETURN NULL;
  END IF;
  IF lower(btrim(v)) = 'now' THEN
    RETURN now() AT TIME ZONE 'UTC';
  END IF;
  RETURN v::timestamp;
EXCEPTION WHEN others THEN
  RETURN NULL;
END $$;

-- Applies SQLite date modifiers: '+N days|months|years|hours|minutes|seconds',
-- 'start of month|year|day'.
CREATE OR REPLACE FUNCTION compat.apply_modifiers(ts timestamp, mods text[]) RETURNS timestamp
  LANGUAGE plpgsql STABLE AS $$
DECLARE
  m text;
  parts text[];
BEGIN
  IF ts IS NULL OR mods IS NULL THEN
    RETURN ts;
  END IF;
  FOREACH m IN ARRAY mods LOOP
    m := lower(btrim(m));
    IF m = 'start of month' THEN
      ts := date_trunc('month', ts);
    ELSIF m = 'start of year' THEN
      ts := date_trunc('year', ts);
    ELSIF m = 'start of day' THEN
      ts := date_trunc('day', ts);
    ELSIF m IN ('localtime', 'utc') THEN
      ts := ts;
    ELSE
      parts := regexp_match(m, '^([+-]?[0-9]+(?:\.[0-9]+)?)\s+(day|days|month|months|year|years|hour|hours|minute|minutes|second|seconds)$');
      IF parts IS NULL THEN
        RETURN NULL;
      END IF;
      ts := ts + (parts[1] || ' ' || parts[2])::interval;
    END IF;
  END LOOP;
  RETURN ts;
END $$;

CREATE OR REPLACE FUNCTION compat.strftime(fmt text, v text, VARIADIC mods text[] DEFAULT '{}')
  RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE
  ts timestamp := compat.apply_modifiers(compat.to_ts(v), mods);
  r text := '';
  i int := 1;
  c text;
BEGIN
  IF ts IS NULL OR fmt IS NULL THEN
    RETURN NULL;
  END IF;
  WHILE i <= length(fmt) LOOP
    c := substr(fmt, i, 1);
    IF c = '%' AND i < length(fmt) THEN
      i := i + 1;
      c := substr(fmt, i, 1);
      r := r || CASE c
        WHEN 'Y' THEN to_char(ts, 'YYYY')
        WHEN 'm' THEN to_char(ts, 'MM')
        WHEN 'd' THEN to_char(ts, 'DD')
        WHEN 'H' THEN to_char(ts, 'HH24')
        WHEN 'M' THEN to_char(ts, 'MI')
        WHEN 'S' THEN to_char(ts, 'SS')
        WHEN 'j' THEN to_char(ts, 'DDD')
        WHEN 'w' THEN extract(dow FROM ts)::int::text
        WHEN 's' THEN extract(epoch FROM ts)::bigint::text
        WHEN 'f' THEN to_char(ts, 'SS.MS')
        WHEN '%' THEN '%'
        ELSE '%' || c
      END;
    ELSE
      r := r || c;
    END IF;
    i := i + 1;
  END LOOP;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION compat.date(v text, VARIADIC mods text[] DEFAULT '{}') RETURNS text
  LANGUAGE sql STABLE AS $$
  SELECT to_char(compat.apply_modifiers(compat.to_ts(v), mods), 'YYYY-MM-DD')
$$;

CREATE OR REPLACE FUNCTION compat.datetime(v text, VARIADIC mods text[] DEFAULT '{}') RETURNS text
  LANGUAGE sql STABLE AS $$
  SELECT to_char(compat.apply_modifiers(compat.to_ts(v), mods), 'YYYY-MM-DD HH24:MI:SS')
$$;

CREATE OR REPLACE FUNCTION compat.julianday(v text) RETURNS double precision
  LANGUAGE sql STABLE AS $$
  SELECT extract(epoch FROM compat.to_ts(v)) / 86400.0 + 2440587.5
$$;

CREATE OR REPLACE FUNCTION compat.ifnull(a anyelement, b anyelement) RETURNS anyelement
  LANGUAGE sql IMMUTABLE AS $$ SELECT COALESCE(a, b) $$;

CREATE OR REPLACE FUNCTION compat.instr(haystack text, needle text) RETURNS integer
  LANGUAGE sql IMMUTABLE AS $$ SELECT strpos(haystack, needle) $$;

-- SQLite's scalar MAX(a, b) / MIN(a, b) (the one-argument forms stay aggregates).
CREATE OR REPLACE FUNCTION compat.max(a double precision, b double precision) RETURNS double precision
  LANGUAGE sql IMMUTABLE AS $$ SELECT CASE WHEN a IS NULL OR b IS NULL THEN NULL ELSE GREATEST(a, b) END $$;

CREATE OR REPLACE FUNCTION compat.min(a double precision, b double precision) RETURNS double precision
  LANGUAGE sql IMMUTABLE AS $$ SELECT CASE WHEN a IS NULL OR b IS NULL THEN NULL ELSE LEAST(a, b) END $$;

CREATE OR REPLACE FUNCTION compat.round(v double precision, digits integer) RETURNS double precision
  LANGUAGE sql IMMUTABLE AS $$ SELECT round(v::numeric, digits)::double precision $$;

-- GROUP_CONCAT(x) and GROUP_CONCAT(x, separator), skipping NULLs like SQLite.
CREATE OR REPLACE FUNCTION compat.group_concat_step(state text, val anyelement, sep text) RETURNS text
  LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN val IS NULL THEN state
              WHEN state IS NULL THEN val::text
              ELSE state || sep || val::text END
$$;

CREATE OR REPLACE FUNCTION compat.group_concat_step(state text, val anyelement) RETURNS text
  LANGUAGE sql IMMUTABLE AS $$ SELECT compat.group_concat_step(state, val, ',') $$;

CREATE OR REPLACE AGGREGATE compat.group_concat(anyelement) (
  SFUNC = compat.group_concat_step,
  STYPE = text
);

CREATE OR REPLACE AGGREGATE compat.group_concat(anyelement, text) (
  SFUNC = compat.group_concat_step,
  STYPE = text
);

-- `COLLATE NOCASE`: case-insensitive comparison.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_collation c JOIN pg_namespace n ON n.oid = c.collnamespace
    WHERE n.nspname = 'compat' AND c.collname = 'nocase'
  ) THEN
    CREATE COLLATION compat.nocase (provider = icu, locale = 'und-u-ks-level2', deterministic = false);
  END IF;
END $$;

-- Moves every serial sequence of the current schema past the highest id (after rows were
-- inserted with explicit ids: seed data, desktop imports).
CREATE OR REPLACE FUNCTION compat.reset_sequences() RETURNS void
  LANGUAGE plpgsql AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl, a.attname AS col,
           pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) AS seq
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = current_schema() AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
  LOOP
    IF r.seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM %I.%I), 0) + 1, false)',
                     r.seq, r.col, current_schema(), r.tbl);
    END IF;
  END LOOP;
END $$;

-- sqlite_master: the handlers check that a table exists before using it.
CREATE OR REPLACE VIEW compat.sqlite_master AS
  SELECT 'table'::text AS type, t.table_name::text AS name, t.table_name::text AS tbl_name,
         0 AS rootpage, NULL::text AS sql
    FROM information_schema.tables t
   WHERE t.table_schema = current_schema() AND t.table_type = 'BASE TABLE';

-- PRAGMA table_info(<table>), which sql.js rewrites to SELECT * FROM compat.table_info('<table>').
CREATE OR REPLACE FUNCTION compat.table_info(tbl text)
  RETURNS TABLE (cid integer, name text, type text, notnull integer, dflt_value text, pk integer)
  LANGUAGE sql STABLE AS $$
  SELECT (c.ordinal_position - 1)::integer,
         c.column_name::text,
         upper(c.data_type)::text,
         CASE WHEN c.is_nullable = 'NO' THEN 1 ELSE 0 END,
         c.column_default::text,
         COALESCE((SELECT k.ordinal_position::integer
                     FROM information_schema.table_constraints tc
                     JOIN information_schema.key_column_usage k
                       ON k.constraint_name = tc.constraint_name AND k.table_schema = tc.table_schema
                    WHERE tc.table_schema = c.table_schema AND tc.table_name = c.table_name
                      AND tc.constraint_type = 'PRIMARY KEY' AND k.column_name = c.column_name), 0)
    FROM information_schema.columns c
   WHERE c.table_schema = current_schema() AND c.table_name = tbl
   ORDER BY c.ordinal_position
$$;
