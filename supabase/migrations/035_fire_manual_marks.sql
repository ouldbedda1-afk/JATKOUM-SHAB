-- دوائر صور الحرائق التي يضعها المشرف بيده من لوحة الإدارة (تبويب «الحرائق»).
-- مصفوفة [{x, y, r}] بكسلات الصورة 600×600؛ null = الدوائر التلقائية (marks.ts في دالة fire-hotspots).
-- تكتبها الدالة وحدها بمفتاح الخدمة بعد التحقق من توكن الإدارة.
alter table public.fire_hotspots add column if not exists manual_marks jsonb;
