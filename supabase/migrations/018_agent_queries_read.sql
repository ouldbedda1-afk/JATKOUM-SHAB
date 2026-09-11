-- agent_queries كان قابلاً للكتابة فقط (insert) بلا سياسة قراءة، فلوحة
-- الأدمن لا تستطيع عرض إحصاءات أسئلة البوّاه عن البلديات. لا بيانات حسّاسة
-- في الجدول (نص السؤال والبلدية فقط، بلا معرّف مستخدم)، فالقراءة العامة
-- آمنة — بنفس نمط page_visits_read (013).
create policy "agent_queries_read" on public.agent_queries for select using (true);
