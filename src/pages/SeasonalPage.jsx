import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import MauritaniaMap from '../components/MauritaniaMap';
import ArticleContent from '../components/ArticleContent';
import { getSeasonalBulletins, getSeasonalOutlook } from '../supabase';

// النشرة الموسمية: تُعدّها دالة seasonal-bulletin يوم 7 من الأشهر الفردية، وتنشرها الإدارة بعد مراجعتها
const ISSUE_MONTHS = [0, 2, 4, 6, 8, 10];
const ISSUE_DAY = 7;

const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const monthOf = (iso) => MONTHS[Number(iso.slice(5, 7)) - 1];
const monthYear = (iso) => `${monthOf(iso)} ${iso.slice(0, 4)}`;
const twoMonths = (a, b) => (a.slice(0, 4) === b.slice(0, 4) ? `${monthOf(a)} و${monthOf(b)} ${a.slice(0, 4)}` : `${monthYear(a)} و${monthYear(b)}`);
const fmtDate = (iso) => { const d = new Date(iso); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

// موعد الإصدار القادم: من اليوم، أو بعد آخر نشرة منشورة إن صدرت نشرة هذه الدورة
function nextIssue(latestPublishedAt) {
  const today = new Date();
  const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (latestPublishedAt) {
    const after = new Date(latestPublishedAt);
    after.setUTCDate(after.getUTCDate() + 1);
    if (after > from) from.setTime(after.getTime());
  }
  for (let i = 0; i < 13; i++) {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + i, ISSUE_DAY));
    if (ISSUE_MONTHS.includes(d.getUTCMonth()) && d >= from) return d;
  }
  return null;
}

// ألوان اتجاه الأمطار، كما تصنّفها دالة seasonal-bulletin
const RAIN_CLASSES = {
  above:   { label: 'أمطار أعلى من المعدل',  color: '#4ade80', badge: 'bg-green-100 text-green-800' },
  near:    { label: 'أمطار قريبة من المعدل', color: '#cbd5e1', badge: 'bg-slate-100 text-slate-700' },
  below:   { label: 'أمطار أقل من المعدل',   color: '#fb923c', badge: 'bg-orange-100 text-orange-800' },
  showers: { label: 'هطولات خفيفة متفرقة',    color: '#fde68a', badge: 'bg-amber-50 text-amber-800' },
  dry:     { label: 'فصل جاف',               color: '#f1ece2', badge: 'bg-stone-100 text-stone-600' },
};
const tempTone = (a) => (a >= 0.5 ? 'text-red-600' : a <= -0.5 ? 'text-blue-600' : 'text-gray-600');

function Outlook({ outlook }) {
  const [m0, m1, m2, , , m5] = outlook.months;
  const fills = Object.fromEntries(outlook.groups.map((g) => [g.name, RAIN_CLASSES[g.rain_class]?.color]));
  const used = [...new Set(outlook.groups.map((g) => g.rain_class))];
  const later = {};
  for (const g of outlook.groups) (later[g.rain_later_class] ||= []).push(g.name);
  const laterDry = Object.keys(later).every((k) => k === 'dry' || k === 'showers');

  return (
    <>
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 pb-3">
          <h2 className="text-lg font-black text-gray-800">🌧️ الأمطار والحرارة المتوقعة: {twoMonths(m0, m1)}</h2>
          <p className="text-sm text-gray-500 mt-1">الاتجاه المتوقع في كل ولاية مقارنةً بمعدل الشهرين.</p>
        </div>
        <MauritaniaMap fills={fills} />
        <div className="flex flex-wrap gap-3 px-5 py-2 text-[11px] text-gray-600">
          {Object.entries(RAIN_CLASSES).filter(([k]) => used.includes(k)).map(([k, c]) => (
            <span key={k} className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm inline-block border border-black/10" style={{ background: c.color }} />{c.label}
            </span>
          ))}
        </div>
        <div className="divide-y divide-gray-100 border-t border-gray-100">
          {outlook.groups.map((g) => (
            <div key={g.name} className="px-5 py-3 flex items-center gap-3 flex-wrap">
              <span className="font-bold text-gray-800 w-28 shrink-0">{g.name}</span>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${RAIN_CLASSES[g.rain_class]?.badge || ''}`}>🌧️ {g.rain_text}</span>
              <span className={`text-xs font-bold ${tempTone(g.temp_anomaly)}`}>🌡️ {g.temp_text}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-lg font-black text-gray-800">📅 نظرة أبعد: من {monthYear(m2)} إلى {monthYear(m5)}</h2>
        {laterDry ? (
          <p className="text-sm text-gray-600 mt-2">فصل جاف عموماً في كل الولايات، دون أمطار تُذكر إلا هطولات خفيفة متفرقة.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {['above', 'near', 'below'].filter((k) => later[k]?.length).map((k) => (
              <p key={k} className="text-sm text-gray-700">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ml-2 ${RAIN_CLASSES[k].badge}`}>{RAIN_CLASSES[k].label}</span>
                {later[k].join('، ')}
              </p>
            ))}
            {[...(later.dry || []), ...(later.showers || [])].length > 0 && (
              <p className="text-sm text-gray-700">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ml-2 ${RAIN_CLASSES.dry.badge}`}>فصل جاف</span>
                {[...(later.dry || []), ...(later.showers || [])].join('، ')}
              </p>
            )}
          </div>
        )}
      </section>

      {outlook.accumulation?.lines?.some((l) => l.text) && (
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-lg font-black text-gray-800">📊 {outlook.accumulation.label}</h2>
          <p className="text-sm text-gray-500 mt-1">نسبة ما هطل إلى معدل الفترة نفسها (1991–2020) في عاصمة كل ولاية. الخط العمودي = المعدل.</p>
          <div className="mt-4 space-y-3">
            {outlook.accumulation.lines.filter((l) => l.text).map((l) => {
              const pct = Math.round((l.recorded / l.reference) * 100);
              return (
                <div key={l.name}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-bold text-gray-800">{l.name}</span>
                    <span className="text-xs text-gray-600">{l.text}</span>
                  </div>
                  {/* المقياس حتى 200% من المعدل، والمعدل في منتصفه */}
                  <div className="relative h-2.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                    <div className={`absolute inset-y-0 right-0 rounded-full ${pct >= 100 ? 'bg-green-500' : 'bg-orange-400'}`}
                      style={{ width: `${Math.min(100, pct / 2)}%` }} />
                    <div className="absolute inset-y-0 right-1/2 w-0.5 bg-gray-700" />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}

export default function SeasonalPage() {
  const [bulletins, setBulletins] = useState(null);
  const [outlook, setOutlook] = useState(undefined);
  const latest = bulletins?.[0];
  const next = bulletins === null ? null : nextIssue(latest?.published_at);

  useEffect(() => {
    document.title = 'النشرة الموسمية | جاتكم اسحاب';
    getSeasonalBulletins().then(setBulletins);
    return () => { document.title = 'جاتكم اسحاب | الطقس في موريتانيا'; };
  }, []);

  useEffect(() => {
    if (latest) getSeasonalOutlook(latest.slug).then(setOutlook);
  }, [latest]);

  return (
    <div className="min-h-screen bg-gray-50 pb-20" dir="rtl">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 mt-6 space-y-5">
        <header>
          <h1 className="text-2xl font-black text-gray-900">النشرة الموسمية</h1>
          <p className="text-sm text-gray-500 mt-1">
            تصدر كل شهرين، وتتناول توقعات الأمطار والحرارة للأشهر القادمة في كل ولاية مقارنةً بالمعدل، وحصيلة الأمطار حتى الآن.
            {next && <> النشرة القادمة نحو <strong className="text-gray-700">{fmtDate(next.toISOString())}</strong>.</>}
          </p>
        </header>

        {bulletins === null ? (
          <div className="bg-white rounded-2xl h-96 animate-pulse border border-gray-100" />
        ) : !latest ? (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
            <p className="text-4xl mb-2">📅</p>
            <p className="font-bold text-gray-800">لم تصدر أول نشرة بعد.</p>
            {next && <p className="text-sm text-gray-500 mt-1">تصدر نحو {fmtDate(next.toISOString())}.</p>}
          </section>
        ) : (
          <>
            <section className="bg-gradient-to-l from-[#0b2c5e] to-[#103a78] text-white rounded-2xl p-5 shadow-sm">
              <p className="text-xs text-blue-200">صدرت في {fmtDate(latest.published_at)}</p>
              <h2 className="text-lg font-black mt-1 leading-snug">{latest.title}</h2>
              <Link to={`/news/${latest.slug}`} className="inline-block mt-3 text-xs font-bold bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-full">
                صفحة النشرة للمشاركة ←
              </Link>
            </section>

            {outlook && <Outlook outlook={outlook} />}

            <details className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 group" open={outlook === null}>
              <summary className="font-black text-gray-800 cursor-pointer">📄 النص الكامل للنشرة</summary>
              <div className="mt-4"><ArticleContent content={latest.content} /></div>
            </details>
          </>
        )}

        {bulletins?.length > 1 && (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-lg font-black text-gray-800">🗂️ النشرات السابقة</h2>
            <ul className="mt-3 divide-y divide-gray-100">
              {bulletins.slice(1).map((b) => (
                <li key={b.slug} className="py-2.5 flex items-center justify-between gap-3">
                  <Link to={`/news/${b.slug}`} className="text-sm font-bold text-blue-700 hover:underline">{b.title}</Link>
                  <span className="text-xs text-gray-400 shrink-0">{fmtDate(b.published_at)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="text-[11px] text-gray-400 leading-relaxed px-1 space-y-1">
          <p>
            التوقعات من النموذج الموسمي للمركز الأوروبي للتوقعات الجوية (ECMWF SEAS5) عبر Open-Meteo، وهي احتمالية: تصف الاتجاه العام
            للأشهر القادمة ولا تحدد أحوال يوم بعينه، ومهارتها في منطقة الساحل متوسطة. تُتابع مع التوقعات اليومية والنشرات الرسمية
            للأرصاد الجوية الموريتانية.
          </p>
          <p>الحصيلة من إعادة التحليل ERA5 مقارنةً بمعدل 1991–2020؛ والنسبة أدق من الكمية، لأن ERA5 يقلّ عن قراءات المقاييس.</p>
        </footer>
      </main>
    </div>
  );
}
