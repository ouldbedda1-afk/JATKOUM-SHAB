import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  adminGetAllNews, adminCreateNews, adminUpdateNews,
  adminDeleteNews, uploadNewsImage, getLivestockReports, supabase,
  cleanupDuplicateNews, addImagesToExistingNews,
} from '../supabase';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';

const { FiPlus, FiEdit2, FiTrash2, FiEye, FiEyeOff, FiSearch, FiX,
        FiImage, FiRefreshCw, FiExternalLink, FiChevronLeft, FiChevronRight } = FiIcons;

const CATEGORIES = ['عام', 'أمطار', 'عواصف', 'حرارة', 'رياح', 'فيضانات', 'جفاف', 'بيئة', 'زراعة'];
const WILAYAS = [
  'نواكشوط الشمالية','نواكشوط الغربية','نواكشوط الجنوبية',
  'الحوض الشرقي','الحوض الغربي','آسابه','كوركول','لبراكنه',
  'الترارزة','البراكنه','كيدي ماغا','لعصابه','تكانت','آدرار',
  'إينشيري','تيرس زمور','داخلت نواذيبو',
];

const EMPTY = {
  title: '', slug: '', excerpt: '', content: '',
  featured_image: '', category: 'عام', wilaya: '',
  moughataa: '', municipality: '', tags: '',
  author: 'جاتكم اسحاب', is_published: false,
};

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('ar', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function NewsAdmin() {
  const [tab, setTab]               = useState('news'); // 'news' | 'livestock'
  const [articles, setArticles]     = useState([]);
  const [count, setCount]           = useState(0);
  const [page, setPage]             = useState(0);
  const [search, setSearch]         = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [editing, setEditing]       = useState(null);
  const [form, setForm]             = useState(EMPTY);
  const [uploading, setUploading]   = useState(false);
  const [saving, setSaving]         = useState(false);
  const [preview, setPreview]       = useState(false);
  const [busyId, setBusyId]         = useState(null);
  const [cleanupStatus, setCleanupStatus] = useState('');
  const [imagesStatus, setImagesStatus]   = useState('');
  // الظالة
  const [livestock, setLivestock]   = useState([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveBusy, setLiveBusy]     = useState(null);
  const fileRef = useRef();
  const PER_PAGE = 15;

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data, count: c } = await adminGetAllNews({ limit: PER_PAGE, offset: page * PER_PAGE, search: search || null });
      setArticles(data); setCount(c);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [page, search]);

  const loadLivestock = useCallback(async () => {
    setLiveLoading(true);
    try {
      const data = await getLivestockReports();
      setLivestock(data || []);
    } catch (e) { console.error(e); }
    finally { setLiveLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (tab === 'livestock') loadLivestock(); }, [tab, loadLivestock]);

  function openNew() {
    setForm(EMPTY); setEditing('new'); setPreview(false);
  }

  function openEdit(a) {
    setForm({
      ...a,
      tags: Array.isArray(a.tags) ? a.tags.join(', ') : (a.tags || ''),
    });
    setEditing(a); setPreview(false);
  }

  function closeEditor() { setEditing(null); setError(''); }

  function onChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  }

  async function handleImageUpload(e) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    try {
      const url = await uploadNewsImage(file);
      setForm((f) => ({ ...f, featured_image: url }));
    } catch (err) { setError(err.message); }
    finally { setUploading(false); fileRef.current.value = ''; }
  }

  async function handleSave() {
    if (!form.title.trim()) { setError('العنوان مطلوب'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        ...form,
        tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      };
      if (editing === 'new') {
        await adminCreateNews(payload);
      } else {
        await adminUpdateNews(editing.id, payload);
      }
      closeEditor(); load();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function handleTogglePublish(a) {
    setBusyId(a.id);
    try {
      await adminUpdateNews(a.id, { is_published: !a.is_published });
      load();
    } catch (e) { setError(e.message); }
    finally { setBusyId(null); }
  }

  async function handleDelete(a) {
    if (!window.confirm(`حذف "${a.title}"؟`)) return;
    setBusyId(a.id);
    try { await adminDeleteNews(a.id); load(); }
    catch (e) { setError(e.message); }
    finally { setBusyId(null); }
  }

  async function handleCleanupDuplicates() {
    if (!window.confirm('سيتم حذف التكرارات (نفس الولاية أو نفس العنوان + نفس اليوم) — المتابعة؟')) return;
    setCleanupStatus('⏳ جارٍ...');
    try {
      const { deleted, kept } = await cleanupDuplicateNews();
      setCleanupStatus(`✅ حُذف ${deleted} مقالة مكررة — بقي ${kept}`);
      load();
    } catch (e) {
      setCleanupStatus(`❌ ${e.message}`);
    }
  }

  async function handleAddImages() {
    setImagesStatus('⏳ جارٍ...');
    try {
      const { updated } = await addImagesToExistingNews();
      setImagesStatus(`✅ أُضيفت الصور لـ ${updated} مقالة`);
      load();
    } catch (e) {
      setImagesStatus(`❌ ${e.message}`);
    }
  }

  const totalPages = Math.ceil(count / PER_PAGE);

  // ── Editor view ──────────────────────────────────────────
  if (editing !== null) {
    return (
      <div className="space-y-4" dir="rtl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-gray-800">
            {editing === 'new' ? '➕ خبر جديد' : `✏️ تعديل: ${editing.title?.slice(0, 40)}`}
          </h2>
          <div className="flex gap-2">
            <button onClick={() => setPreview((p) => !p)}
              className="flex items-center gap-1 text-sm px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg font-bold">
              <SafeIcon icon={FiEye} /> {preview ? 'إخفاء المعاينة' : 'معاينة'}
            </button>
            <button onClick={closeEditor}
              className="flex items-center gap-1 text-sm px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg font-bold">
              <SafeIcon icon={FiX} /> إلغاء
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 font-bold bg-red-50 p-3 rounded-xl">{error}</p>}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Form */}
          <div className="space-y-3">
            <input name="title" value={form.title} onChange={onChange} placeholder="العنوان *"
              className="w-full border border-gray-200 rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none" />

            <textarea name="excerpt" value={form.excerpt} onChange={onChange} placeholder="ملخص قصير (سطر أو سطران)" rows={2}
              className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none" />

            <textarea name="content" value={form.content} onChange={onChange} placeholder="محتوى الخبر الكامل..." rows={10}
              className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-y font-mono" />

            {/* Image */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-600">الصورة الرئيسية</label>
              <div className="flex gap-2">
                <input name="featured_image" value={form.featured_image} onChange={onChange} placeholder="رابط الصورة أو ارفع ملفاً"
                  className="flex-1 border border-gray-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                <button onClick={() => fileRef.current.click()} disabled={uploading}
                  className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50">
                  <SafeIcon icon={FiImage} /> {uploading ? '...' : 'رفع'}
                </button>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              </div>
              {form.featured_image && (
                <img src={form.featured_image} alt="" className="h-24 object-cover rounded-lg border" />
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">التصنيف</label>
                <select name="category" value={form.category} onChange={onChange}
                  className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">الولاية</label>
                <select name="wilaya" value={form.wilaya} onChange={onChange}
                  className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="">— كل موريتانيا —</option>
                  {WILAYAS.map((w) => <option key={w}>{w}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <input name="moughataa" value={form.moughataa} onChange={onChange} placeholder="المقاطعة"
                className="border border-gray-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              <input name="municipality" value={form.municipality} onChange={onChange} placeholder="البلدية"
                className="border border-gray-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>

            <input name="author" value={form.author} onChange={onChange} placeholder="الكاتب"
              className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />

            <input name="tags" value={form.tags} onChange={onChange} placeholder="الوسوم (مفصولة بفاصلة)"
              className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" name="is_published" checked={form.is_published} onChange={onChange}
                className="w-4 h-4 accent-green-600" />
              <span className="text-sm font-bold text-gray-700">نشر الخبر الآن</span>
            </label>

            <div className="flex gap-3 pt-2">
              <button onClick={handleSave} disabled={saving}
                className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl font-black text-sm hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'جارٍ الحفظ...' : (editing === 'new' ? 'إنشاء الخبر' : 'حفظ التعديلات')}
              </button>
              <button onClick={closeEditor}
                className="px-5 bg-gray-100 text-gray-700 py-2.5 rounded-xl font-bold text-sm hover:bg-gray-200">
                إلغاء
              </button>
            </div>
          </div>

          {/* Preview */}
          {preview && (
            <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200 overflow-y-auto max-h-[700px]">
              <p className="text-xs text-gray-400 font-bold mb-3">👁️ معاينة الخبر</p>
              {form.featured_image && (
                <img src={form.featured_image} alt="" className="w-full h-48 object-cover rounded-xl mb-3" />
              )}
              <span className="text-[11px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">{form.category}</span>
              {form.wilaya && <span className="text-[11px] text-gray-500 mr-2">📍 {form.wilaya}</span>}
              <h1 className="text-xl font-black text-gray-900 mt-2 leading-snug">{form.title || 'العنوان'}</h1>
              <p className="text-sm text-gray-500 mt-1">{form.author} · {fmtDate(new Date())}</p>
              {form.excerpt && <p className="text-gray-600 mt-3 text-sm leading-relaxed border-r-4 border-blue-400 pr-3">{form.excerpt}</p>}
              <div className="mt-4 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{form.content}</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────
  return (
    <div className="space-y-4" dir="rtl">
      {/* Tab switcher */}
      <div className="flex bg-gray-100 p-1 rounded-xl w-fit">
        <button onClick={() => setTab('news')}
          className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${tab === 'news' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'}`}>
          📰 الأخبار
        </button>
        <button onClick={() => setTab('livestock')}
          className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${tab === 'livestock' ? 'bg-white shadow-sm text-amber-600' : 'text-gray-500'}`}>
          🐄 الظالة {livestock.length > 0 && <span className="mr-1 text-xs bg-amber-100 text-amber-700 px-1.5 rounded-full">{livestock.length}</span>}
        </button>
      </div>

      {/* ═══ قسم الظالة ═══ */}
      {tab === 'livestock' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-gray-500">{livestock.length} بلاغ معتمد</p>
            <button onClick={loadLivestock} className="p-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50">
              <SafeIcon icon={FiRefreshCw} className={`text-gray-600 ${liveLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          {liveLoading ? (
            [...Array(3)].map((_,i) => <div key={i} className="h-20 bg-white rounded-2xl animate-pulse border border-gray-100" />)
          ) : livestock.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400">
              لا توجد بلاغات معتمدة
            </div>
          ) : livestock.map((r) => {
            const isLost = r.report_type === 'lost';
            const loc = [r.village, r.region].filter(Boolean).join('، ');
            return (
              <div key={r.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex gap-3 items-start">
                {r.image_url ? (
                  <img src={r.image_url} alt="" className="w-20 h-16 object-cover rounded-xl shrink-0" />
                ) : (
                  <div className="w-20 h-16 rounded-xl bg-amber-50 flex items-center justify-center text-2xl shrink-0">🐄</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isLost ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                      {isLost ? '🔴 ضالة' : '🟢 وُجدت'}
                    </span>
                    <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">{r.animal_type}</span>
                  </div>
                  <p className="font-bold text-gray-800 text-sm">{r.animal_type} — {loc || 'غير محدد'}</p>
                  {r.description ? <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">{r.description}</p> : null}
                  <p className="text-[11px] text-gray-400 mt-1">📞 {r.contact_phone || '—'} · {fmtDate(r.created_at)}</p>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <Link to={`/althala/${r.id}`} target="_blank"
                    className="flex items-center gap-1 bg-amber-50 text-amber-700 px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-amber-100 transition-all">
                    <SafeIcon icon={FiExternalLink} /> عرض
                  </Link>
                  <button
                    disabled={liveBusy === r.id}
                    onClick={async () => {
                      if (!window.confirm('حذف هذا البلاغ نهائياً؟')) return;
                      setLiveBusy(r.id);
                      await supabase.from('livestock_reports').delete().eq('id', r.id);
                      setLivestock(prev => prev.filter(x => x.id !== r.id));
                      setLiveBusy(null);
                    }}
                    className="flex items-center gap-1 bg-red-50 text-red-600 px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-red-600 hover:text-white transition-all disabled:opacity-50">
                    <SafeIcon icon={FiTrash2} /> حذف
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'news' && <>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-black text-gray-800">📰 إدارة الأخبار</h2>
          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{count} خبر</span>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50">
            <SafeIcon icon={FiRefreshCw} className={`text-gray-600 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={openNew}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-black hover:bg-blue-700">
            <SafeIcon icon={FiPlus} /> خبر جديد
          </button>
        </div>
      </div>

      {/* أدوات الصيانة */}
      <div className="flex flex-wrap gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4">
        <p className="w-full text-xs font-black text-amber-800 mb-1">🛠️ أدوات الصيانة</p>

        <div className="flex flex-col gap-1">
          <button onClick={handleCleanupDuplicates}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-sm font-black transition-colors">
            🗑️ حذف التكرارات
          </button>
          {cleanupStatus && <span className="text-xs font-bold text-amber-900">{cleanupStatus}</span>}
        </div>

        <div className="flex flex-col gap-1">
          <button onClick={handleAddImages}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-black transition-colors">
            🖼️ إضافة صور للمقالات
          </button>
          {imagesStatus && <span className="text-xs font-bold text-amber-900">{imagesStatus}</span>}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <SafeIcon icon={FiSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          placeholder="بحث في الأخبار..."
          className="w-full bg-gray-50 border border-gray-200 rounded-xl pr-10 pl-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
      </div>

      {error && <p className="text-sm text-red-600 font-bold">{error}</p>}

      {loading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="bg-white h-14 rounded-xl animate-pulse border border-gray-100" />)}</div>
      ) : articles.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <p className="text-gray-400 font-bold text-4xl mb-3">📰</p>
          <p className="text-gray-500 font-bold">لا توجد أخبار. أضف أول خبر الآن.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {articles.map((a, i) => (
            <div key={a.id} className={`flex items-center gap-3 p-3 ${i > 0 ? 'border-t border-gray-50' : ''} hover:bg-gray-50`}>
              {a.featured_image
                ? <img src={a.featured_image} alt="" className="w-12 h-10 object-cover rounded-lg shrink-0" />
                : <div className="w-12 h-10 bg-gray-100 rounded-lg shrink-0 flex items-center justify-center text-gray-400 text-lg">📰</div>
              }
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">{a.title}</p>
                <p className="text-[11px] text-gray-400 flex items-center gap-2 flex-wrap mt-0.5">
                  <span className={`px-1.5 py-0.5 rounded-full font-bold ${a.is_published ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    {a.is_published ? 'منشور' : 'مسودة'}
                  </span>
                  <span>{a.category}</span>
                  {a.wilaya && <span>📍 {a.wilaya}</span>}
                  <span>{fmtDate(a.published_at || a.created_at)}</span>
                  <span>👁️ {a.views}</span>
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => handleTogglePublish(a)} disabled={busyId === a.id} title={a.is_published ? 'إلغاء النشر' : 'نشر'}
                  className={`p-2 rounded-lg text-sm transition-all ${a.is_published ? 'bg-green-50 text-green-600 hover:bg-green-100' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  <SafeIcon icon={a.is_published ? FiEye : FiEyeOff} />
                </button>
                <a href={`/#/news/${a.slug}`} target="_blank" rel="noreferrer" title="فتح الخبر"
                  className="p-2 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200">
                  <SafeIcon icon={FiExternalLink} />
                </a>
                <button onClick={() => openEdit(a)} title="تعديل"
                  className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100">
                  <SafeIcon icon={FiEdit2} />
                </button>
                <button onClick={() => handleDelete(a)} disabled={busyId === a.id} title="حذف"
                  className="p-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 disabled:opacity-50">
                  <SafeIcon icon={FiTrash2} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
            className="p-2 bg-white border border-gray-200 rounded-xl disabled:opacity-40 hover:bg-gray-50">
            <SafeIcon icon={FiChevronRight} />
          </button>
          <span className="text-sm text-gray-600 font-bold">{page + 1} / {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
            className="p-2 bg-white border border-gray-200 rounded-xl disabled:opacity-40 hover:bg-gray-50">
            <SafeIcon icon={FiChevronLeft} />
          </button>
        </div>
      )}
      </> /* end tab === 'news' */}
    </div>
  );
}
