-- إغلاق جدول الأخبار أمام الكتابة بالمفتاح العام.
--
-- كانت السياسة news_write (ALL, true) تسمح لأي شخص يملك المفتاح العام — وهو ظاهر
-- في كود الموقع — بإنشاء الأخبار وتعديلها وحذفها. صار النشر كله من دوال الخادم
-- (بمفتاح الخدمة، الذي يتجاوز RLS):
--   admin-news        لوحة الإدارة وأزرار "نشر كخبر" (بتوكن الإدارة)
--   wilaya-publisher  توقعات الولايات والتحذيرات (بدل متصفح أول زائر)
--   forecast-publisher / hazard-publisher
-- ويبقى للزوار: قراءة الأخبار المنشورة، وزيادة عدّاد المشاهدات عبر دالة لا تمسّ
-- غير ذلك العمود.
--
-- ترتيب التطبيق: انشر الدوال ثم الموقع أولاً، ثم هذا الملف.

drop policy if exists news_write on public.news_articles;
drop policy if exists news_read on public.news_articles;

create policy news_read_published on public.news_articles
  for select to anon, authenticated
  using (is_published = true);

revoke insert, update, delete, truncate on public.news_articles from anon, authenticated;

-- عدّاد المشاهدات
create or replace function public.increment_news_views(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.news_articles set views = coalesce(views, 0) + 1
  where id = p_id and is_published;
$$;

revoke all on function public.increment_news_views(uuid) from public;
grant execute on function public.increment_news_views(uuid) to anon, authenticated;

-- جدولة wilaya-publisher: بعد توفر تشغيلة ECMWF 00Z، ومنتصف النهار، ومساءً
select cron.unschedule('wilaya-publisher')
where exists (select 1 from cron.job where jobname = 'wilaya-publisher');

select cron.schedule(
  'wilaya-publisher',
  '0 7,13,20 * * *',
  $$
    select net.http_post(
      url     := 'https://udtdfkvtmqfxjezhxaah.supabase.co/functions/v1/wilaya-publisher',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer sb_publishable_tS-r6elQa1GomTr_XEoYgA_bzCWCfFb'
      ),
      body    := '{}'::jsonb
    ) as request_id;
  $$
);

-- للتحقق:
-- select policyname, cmd, qual from pg_policies where tablename = 'news_articles';
-- select * from cron.job where jobname = 'wilaya-publisher';
