CREATE OR REPLACE FUNCTION t_ok(desc_ text, cond boolean, got text DEFAULT NULL)
RETURNS text LANGUAGE sql IMMUTABLE AS $f$
  SELECT CASE WHEN cond THEN '  PASS  ' ELSE '  ** FAIL **  ' END || desc_
      || CASE WHEN got IS NOT NULL THEN '   [' || got || ']' ELSE '' END $f$;
