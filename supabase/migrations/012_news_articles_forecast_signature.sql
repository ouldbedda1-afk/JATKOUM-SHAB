-- عمودان تقنيان مخفيان لا يظهران في أي واجهة — يستخدمهما forecast-publisher
-- لمقارنة جولتي AM/PM بدقة اعتماداً على البيانات الخام، لا نص المقال المُولَّد.
--
-- forecast_signature (JSONB): البيانات المعيارية الخام (المدن/الولايات المتأثرة،
--   الشدة، كمية الأمطار) — لأغراض المراجعة، ولإتاحة توليد ملخص "ما الذي تغيّر
--   منذ نشرة الصباح" مستقبلاً.
-- forecast_signature_hash (TEXT): بصمة SHA-256 لنسخة JSON معيارية (مفاتيح
--   مرتّبة) من forecast_signature — تُستخدم للمقارنة السريعة دون الحاجة لمقارنة
--   الـ JSONB الكامل في كل مرة.
ALTER TABLE news_articles DROP COLUMN IF EXISTS forecast_signature;
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS forecast_signature JSONB;
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS forecast_signature_hash TEXT;
