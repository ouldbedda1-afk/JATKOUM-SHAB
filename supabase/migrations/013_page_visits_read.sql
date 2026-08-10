-- page_visits كان قابلاً للكتابة فقط (insert) بلا سياسة قراءة، فلوحة
-- الأدمن لا تستطيع عرض عدد الزيارات. لا بيانات حسّاسة في الجدول (طابع
-- زمني فقط، بلا معرّف مستخدم)، فالقراءة العامة آمنة — بنفس نمط
-- weather_snapshots.
create policy "page_visits_read" on public.page_visits for select using (true);
