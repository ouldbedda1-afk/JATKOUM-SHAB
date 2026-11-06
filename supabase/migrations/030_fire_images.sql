-- صور Sentinel-2 للحرائق الكبيرة (دالة fire-hotspots، عبر Copernicus Data Space).
-- big: البؤرة الممثِّلة لحريق كبير (تجمّع 5 بؤر فأكثر أو 30 ميغاواط فأكثر)، cluster_size: عدد بؤره.
-- image_url/image_date: أول صورة صافية بعد رصد الحريق، في الحاوية العامة fire-images.
--
-- ترتيب التطبيق: هذا الملف، ثم اضبط السرّين SH_CLIENT_ID وSH_CLIENT_SECRET وانشر fire-hotspots.

alter table public.fire_hotspots
  add column if not exists big          boolean not null default false,
  add column if not exists cluster_size int,
  add column if not exists image_url    text,
  add column if not exists image_date   timestamptz,
  add column if not exists image_tries  int not null default 0;   -- محاولات البحث عن صورة (تتوقف بعد 10 أيام)

create index if not exists fire_hotspots_big_idx on public.fire_hotspots (big) where big;

-- حاوية عامة للصور: يقرؤها الجميع برابطها، والكتابة لمفتاح الخدمة وحده
insert into storage.buckets (id, name, public)
values ('fire-images', 'fire-images', true)
on conflict (id) do nothing;

-- للتحقق:
-- select id, wilaya, place, cluster_size, image_date, image_url from public.fire_hotspots where big order by detected_at desc;
