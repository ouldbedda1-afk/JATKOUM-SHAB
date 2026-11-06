import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, adminFireAction } from '../supabase';

// تبويب «الحرائق» في لوحة الإدارة:
// - صور الحرائق الكبيرة: يضع المشرف الدوائر بيده على النسخة الخام، فتحل محل الدوائر التلقائية
//   في الصورة المنشورة على الموقع (دالة fire-hotspots، الأمر set_marks).
// - بؤر لم تُعدّ حرائق كبيرة (بؤرة واحدة أو ضعيفة): زر «جلب صورة» يطلب صورتها من Sentinel-2 (request_image).

const PX = 600;        // ضلع صورة الحريق بالبكسل (IMAGE_PX في الدالة)
const BAND = 44;       // شريط الشعار أسفل الصورة: لا تُرسم فيه دوائر
const HALF_DEG = 0.05; // نصف ضلع الصورة بالدرجات (IMAGE_HALF_DEG)
const CELL_DEG = 0.03; // تجميع البؤر الصغيرة كما في الدالة (CLUSTER_DEG)
const NEW_R = 30;

const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const fmt = (iso) => { const d = new Date(iso); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
const rawOf = (url) => url.split('?')[0].replace(/\.jpg$/, '-raw.jpg');
const placeLine = (f) => `${f.wilaya} — ${f.distance_km} كم ${f.direction || ''} ${f.place || ''}`;

async function loadFires() {
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const cols = 'id, lat, lon, detected_at, frp, wilaya, place, distance_km, direction, big, image_url, before_image_url';
  const query = (c) => supabase.from('fire_hotspots').select(c).gte('detected_at', since)
    .order('detected_at', { ascending: false }).limit(3000);
  let { data, error } = await query(`${cols}, manual_marks`);
  if (error) ({ data, error } = await query(cols)); // قبل تطبيق 035
  if (error) throw error;
  return data || [];
}

function MarksEditor({ fire, onSaved }) {
  const [which, setWhich] = useState(fire.image_url ? 'after' : 'before');
  const [marks, setMarks] = useState(() => (fire.manual_marks || []).map((m) => ({ ...m })));
  const [sel, setSel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const svgRef = useRef(null);
  const drag = useRef(null);

  const url = which === 'after' ? fire.image_url : fire.before_image_url;
  const toImg = (e) => {
    const b = svgRef.current.getBoundingClientRect();
    return { x: Math.max(0, Math.min(PX, (e.clientX - b.left) / b.width * PX)), y: Math.max(0, Math.min(PX - BAND, (e.clientY - b.top) / b.height * PX)) };
  };

  const onBackground = (e) => {
    const p = toImg(e);
    setMarks((m) => [...m, { x: p.x, y: p.y, r: NEW_R }]);
    setSel(marks.length);
  };
  const onCircleDown = (e, i) => {
    e.stopPropagation();
    setSel(i);
    const p = toImg(e);
    drag.current = { i, dx: marks[i].x - p.x, dy: marks[i].y - p.y };
    svgRef.current.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => {
    if (!drag.current) return;
    const p = toImg(e), { i, dx, dy } = drag.current;
    setMarks((m) => m.map((c, k) => (k === i ? { ...c, x: p.x + dx, y: p.y + dy } : c)));
  };
  const endDrag = () => { drag.current = null; };

  const save = async (value) => {
    setBusy(true); setMsg('');
    try {
      const r = await adminFireAction({ action: 'set_marks', id: fire.id, marks: value && value.map((m) => ({ x: Math.round(m.x), y: Math.round(m.y), r: Math.round(m.r) })) });
      setMsg(value ? '✅ حُفظت الدوائر ورُسمت على الصورة المنشورة' : '✅ عادت الدوائر التلقائية');
      if (!value) setMarks([]);
      onSaved(fire.id, { ...r, manual_marks: value });
    } catch (e) {
      setMsg(`❌ ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="font-black text-gray-900">🔥 {placeLine(fire)}</h3>
          <p className="text-[11px] text-gray-400">رُصد {fmt(fire.detected_at)} · {fire.manual_marks ? 'دوائر المشرف' : 'دوائر تلقائية'}</p>
        </div>
        {fire.image_url && fire.before_image_url && (
          <div className="flex bg-gray-100 p-1 rounded-lg text-xs font-bold">
            <button onClick={() => setWhich('after')} className={`px-3 py-1 rounded-md ${which === 'after' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'}`}>بعد الحريق</button>
            <button onClick={() => setWhich('before')} className={`px-3 py-1 rounded-md ${which === 'before' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'}`}>قبله</button>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-[1fr_200px] gap-3 items-start">
        <div className="relative w-full max-w-[600px] aspect-square select-none touch-none">
          <img src={rawOf(url)} alt="" className="absolute inset-0 w-full h-full" draggable={false} />
          <svg ref={svgRef} viewBox={`0 0 ${PX} ${PX}`} className="absolute inset-0 w-full h-full cursor-crosshair"
            onPointerDown={onBackground} onPointerMove={onMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
            <rect x="0" y={PX - BAND} width={PX} height={BAND} fill="rgba(11,44,94,.55)" pointerEvents="none" />
            {marks.map((m, i) => (
              <g key={i} onPointerDown={(e) => onCircleDown(e, i)} className="cursor-move">
                <circle cx={m.x} cy={m.y} r={m.r} fill="transparent" stroke="rgba(0,0,0,.5)" strokeWidth="5" />
                <circle cx={m.x} cy={m.y} r={m.r} fill="transparent" stroke={sel === i ? '#38bdf8' : '#f97316'} strokeWidth="3" />
              </g>
            ))}
          </svg>
        </div>

        <div className="space-y-2 text-sm">
          <p className="text-xs text-gray-500 leading-relaxed">انقر على الحريق لوضع دائرة، واسحبها لتحريكها، وغيّر حجمها من الشريط. تُطبَّق الدوائر نفسها على صورتي ما قبل الحريق وما بعده.</p>
          {sel != null && marks[sel] && (
            <div className="bg-gray-50 rounded-xl p-2 space-y-2">
              <label className="block text-xs font-bold text-gray-600">حجم الدائرة
                <input type="range" min="10" max="200" value={marks[sel].r}
                  onChange={(e) => setMarks((m) => m.map((c, k) => (k === sel ? { ...c, r: Number(e.target.value) } : c)))}
                  className="w-full" />
              </label>
              <button onClick={() => { setMarks((m) => m.filter((_, k) => k !== sel)); setSel(null); }}
                className="w-full text-xs font-bold bg-red-50 text-red-600 rounded-lg py-1.5 hover:bg-red-100">حذف هذه الدائرة</button>
            </div>
          )}
          <button disabled={busy || !marks.length} onClick={() => save(marks)}
            className="w-full bg-emerald-600 text-white rounded-xl py-2 font-black hover:bg-emerald-700 disabled:opacity-50">
            {busy ? 'جارٍ الرسم…' : `حفظ الدوائر (${marks.length})`}
          </button>
          <button disabled={busy || !marks.length} onClick={() => { setMarks([]); setSel(null); }}
            className="w-full bg-gray-100 text-gray-700 rounded-xl py-1.5 text-xs font-bold hover:bg-gray-200 disabled:opacity-50">مسح كل الدوائر</button>
          {fire.manual_marks && (
            <button disabled={busy} onClick={() => save(null)}
              className="w-full bg-white border border-gray-200 text-gray-600 rounded-xl py-1.5 text-xs font-bold hover:bg-gray-50 disabled:opacity-50">العودة إلى الدوائر التلقائية</button>
          )}
          {msg && <p className="text-xs font-bold">{msg}</p>}
          <a href={url} target="_blank" rel="noreferrer" className="block">
            <img src={url} alt="الصورة المنشورة" className="w-full rounded-lg border border-gray-200" />
            <span className="text-[11px] text-blue-700">الصورة المنشورة الآن ↗</span>
          </a>
        </div>
      </div>
    </div>
  );
}

export default function FireMarksAdmin() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [notes, setNotes] = useState({});

  const load = useCallback(() => {
    loadFires().then(setRows).catch((e) => setError(e.message || 'فشل التحميل'));
  }, []);
  useEffect(load, [load]);

  if (error) return <p className="text-xs font-bold text-red-600">{error}</p>;
  if (!rows) return <div className="bg-white h-64 rounded-2xl animate-pulse border border-gray-100" />;

  const withImages = rows.filter((f) => f.big && (f.image_url || f.before_image_url));
  const bigFires = rows.filter((f) => f.big);
  // بؤر خارج إطار أي حريق كبير، مجمّعة كما تجمّعها الدالة
  const groups = new Map();
  for (const f of rows) {
    if (bigFires.some((b) => Math.abs(b.lat - f.lat) <= HALF_DEG && Math.abs(b.lon - f.lon) <= HALF_DEG)) continue;
    const key = `${Math.round(f.lat / CELL_DEG)},${Math.round(f.lon / CELL_DEG)}`;
    groups.set(key, [...(groups.get(key) || []), f]);
  }
  const small = [...groups.values()]
    .map((g) => ({ top: g.reduce((a, b) => (b.frp > a.frp ? b : a)), count: g.length, last: g[0].detected_at }))
    .sort((a, b) => b.last.localeCompare(a.last));

  const onSaved = (id, patch) => setRows((rs) => rs.map((f) => (f.id === id ? {
    ...f, manual_marks: patch.manual_marks,
    image_url: patch.image_url || f.image_url, before_image_url: patch.before_image_url || f.before_image_url,
  } : f)));

  const requestImage = async (f) => {
    setBusyId(f.id);
    try {
      const r = await adminFireAction({ action: 'request_image', id: f.id });
      setNotes((n) => ({ ...n, [f.id]: r.image_url || r.before_image_url
        ? '✅ جُلبت الصورة، وهي الآن في الأعلى'
        : '⏳ لا مشهد صافياً بعد؛ سيُتابَع الحريق ويُجلب أول مشهد صافٍ تلقائياً' }));
      load();
    } catch (e) {
      setNotes((n) => ({ ...n, [f.id]: `❌ ${e.message}` }));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h2 className="text-lg font-black text-gray-800">🛰️ صور الحرائق ودوائرها</h2>
        {withImages.length === 0
          ? <p className="text-sm text-gray-500 bg-white rounded-2xl border border-gray-100 p-6 text-center">لا صور حرائق في آخر 7 أيام.</p>
          : withImages.map((f) => <MarksEditor key={f.id} fire={f} onSaved={onSaved} />)}
      </section>

      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <h2 className="text-lg font-black text-gray-800">🔥 بؤر بلا صورة</h2>
        <p className="text-xs text-gray-500 mt-1">بؤر لم تبلغ حدّ الحريق الكبير (5 بؤر متقاربة أو 30 ميغاواط). «جلب صورة» يطلب صورتها من Sentinel-2 ويضيفها إلى صفحة المراعي.</p>
        {small.length === 0 ? <p className="text-sm text-gray-400 mt-3">لا شيء.</p> : (
          <ul className="mt-3 divide-y divide-gray-100">
            {small.map(({ top, count, last }) => (
              <li key={top.id} className="py-2 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[12rem]">
                  <p className="text-sm font-bold text-gray-800">{placeLine(top)}</p>
                  <p className="text-[11px] text-gray-400">{count} بؤرة · أقواها {Math.round(top.frp * 10) / 10} ميغاواط · آخرها {fmt(last)}</p>
                  {notes[top.id] && <p className="text-[11px] font-bold mt-0.5">{notes[top.id]}</p>}
                </div>
                <button disabled={busyId != null} onClick={() => requestImage(top)}
                  className="text-xs font-bold bg-orange-50 text-orange-700 hover:bg-orange-100 px-3 py-2 rounded-xl disabled:opacity-50">
                  {busyId === top.id ? 'جارٍ الجلب…' : '🛰️ جلب صورة'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
