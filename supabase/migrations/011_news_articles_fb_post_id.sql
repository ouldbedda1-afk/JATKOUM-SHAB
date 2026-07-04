-- ربط كل خبر بمعرّف منشوره المقابل على فيسبوك، لعرض عدد المشاهدات لكل منشور لاحقاً
alter table news_articles add column if not exists fb_post_id text;
