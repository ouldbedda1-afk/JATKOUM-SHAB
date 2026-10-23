-- دالة ترجع التقارير الفريدة مع دعم فلتر الولاية والسنة والترقيم
CREATE OR REPLACE FUNCTION get_rain_reports(
  p_wilaya  TEXT    DEFAULT NULL,
  p_year    INT     DEFAULT NULL,
  p_limit   INT     DEFAULT 10,
  p_offset  INT     DEFAULT 0
)
RETURNS TABLE (
  report_url          TEXT,
  report_title        TEXT,
  report_published_at TIMESTAMPTZ,
  total_count         BIGINT
)
LANGUAGE sql STABLE AS $$
  WITH filtered AS (
    SELECT DISTINCT ON (report_url)
      report_url,
      report_title,
      report_published_at
    FROM rain_measurements
    WHERE
      (p_wilaya IS NULL OR wilaya = p_wilaya)
      AND (p_year  IS NULL OR EXTRACT(YEAR FROM report_published_at) = p_year)
    ORDER BY report_url, report_published_at DESC
  ),
  counted AS (
    SELECT *, COUNT(*) OVER () AS total_count
    FROM filtered
    ORDER BY report_published_at DESC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT * FROM counted;
$$;

GRANT EXECUTE ON FUNCTION get_rain_reports(TEXT, INT, INT, INT) TO anon, authenticated;
