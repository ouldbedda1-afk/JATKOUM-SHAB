-- صورة المكان قبل الحريق: أحدث صورة Sentinel-2 صافية قبل رصد الحريق الكبير، تُعرض حتى تصل صورة
-- ما بعده، ثم معها للمقارنة. تملؤها دالة fire-hotspots في الحاوية fire-images (‎<id>-before.jpg).
--
-- ترتيب التطبيق: هذا الملف، ثم انشر fire-hotspots.

alter table public.fire_hotspots
  add column if not exists before_image_url  text,
  add column if not exists before_image_date timestamptz;
