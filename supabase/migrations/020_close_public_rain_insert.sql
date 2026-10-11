-- إغلاق الإدراج العام في rain_measurements.
--
-- الترحيل 014 أنشأ سياسة "rain_measurements_insert" بـ with check (true) لكل
-- الأدوار، فكان أي حامل للمفتاح العام (المنشور في الموقع) يستطيع إدراج قراءات
-- في الأرشيف الرسمي. الكتابة الوحيدة المقصودة تأتي من دالة ami-rain-scraper
-- وسكربتات الأرشيف، وكلها بمفتاح service_role الذي يتجاوز RLS.
--
-- القراءة العامة (rain_measurements_read) تبقى كما هي.
--
-- للتراجع:
--   create policy "rain_measurements_insert" on public.rain_measurements
--     for insert with check (true);

drop policy if exists "rain_measurements_insert" on public.rain_measurements;
