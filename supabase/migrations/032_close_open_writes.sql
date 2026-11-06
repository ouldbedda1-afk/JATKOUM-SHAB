-- سدّ الكتابة المفتوحة للزوار (فحص 2026-11-06)
--
-- 1. تبشيرات المطر وبلاغات الظالة وأخبار الزوار: لكل جدول سياسة إدخال صحيحة تفرض «pending»،
--    وبجانبها سياستان قديمتان check(true). السياسات المتساهلة تُجمع بـ OR، فكان أي زائر يستطيع إدخال
--    بلاغ «approved» يظهر على الموقع دون مراجعة. تُحذف القديمتان وتبقى سياسة «pending».
-- 2. weather_snapshots: يكتبها wilaya-publisher بمفتاح الخدمة (يتجاوز RLS)؛ الموقع يقرأ فقط.
-- 3. favorites وsearch_history: لا تستعملهما أي صفحة، وكانتا مفتوحتين للقراءة والكتابة.

drop policy if exists rain_reports_ins       on public.rain_reports;
drop policy if exists rain_reports_insert    on public.rain_reports;
drop policy if exists livestock_reports_ins  on public.livestock_reports;
drop policy if exists livestock_reports_insert on public.livestock_reports;
drop policy if exists news_submissions_ins   on public.news_submissions;
drop policy if exists news_submissions_insert on public.news_submissions;

drop policy if exists snapshots_insert on public.weather_snapshots;
drop policy if exists snapshots_update on public.weather_snapshots;
revoke insert, update, delete on public.weather_snapshots from anon, authenticated;

drop policy if exists favorites_all on public.favorites;
drop policy if exists search_history_all on public.search_history;
revoke all on public.favorites, public.search_history from anon, authenticated;

-- للتحقق: لا سياسة إدخال check(true) على الجداول الثلاثة
-- select tablename, policyname, with_check from pg_policies
-- where tablename in ('rain_reports','livestock_reports','news_submissions') and cmd = 'INSERT';
