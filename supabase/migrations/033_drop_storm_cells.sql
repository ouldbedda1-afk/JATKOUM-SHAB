-- حذف خلايا العواصف من قاعدة البيانات (2026-11-06، بطلب الإدارة: الميزة غير مستعملة)
--
-- storm_cells كان يكتبها متصفح كل زائر (أي زائر يستطيع إضافة خلية أو حذفها)، وstorm_suppressions
-- يكتبها زر «إخماد» في تيليغرام، وكانت دالة storm-notifier (غير المجدولة) تنشر الخلايا آلياً.
-- تتبع سحب العواصف من صور Meteosat يبقى في المتصفح وحده (cellTracking.js) دون حفظ.
--
-- ترتيب التطبيق: انشر telegram-webhook واحذف الدالة storm-notifier أولاً، ثم هذا الملف.

drop table if exists public.storm_suppressions;
drop table if exists public.storm_cells;
