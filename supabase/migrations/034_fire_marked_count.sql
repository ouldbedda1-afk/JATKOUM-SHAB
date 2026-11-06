-- عدد بؤر الحريق المعلَّمة على صورة الحريق الكبير. حين يزيد عدد البؤر المرصودة داخل إطار الصورة
-- تعيد دالة fire-hotspots رسم الدوائر من النسخة الخام المحفوظة.
alter table public.fire_hotspots add column if not exists marked_count int not null default 0;
