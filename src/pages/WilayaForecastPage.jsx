import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../supabase';
import Navbar from '../components/Navbar';
import { slugToWilaya, wilayaToSlug } from '../wilayaUrlSlugs';
import { getImageForAlert } from '../weatherImages';
import { useWeatherContext } from '../WeatherContext';
import { fetchWilayaCommunes } from '../weatherApi';
import { buildForecastDays, groupThunderByLevel } from '../wilayaForecastBuilder';
import { toArabicCommune } from '../mauritaniaCommuneNamesAr';
import { normalizeMauritaniaWilayaName } from '../mauritaniaPlaceNames';

const BUCKET_META = {
  heavy:    { icon: '🌧️', label: 'أمطار غزيرة' },
  moderate: { icon: '🌦️', label: 'أمطار متوسطة' },
  weak:     { icon: '🌂', label: 'أمطار خفيفة' },
  wind:     { icon: '💨', label: 'رياح قوية' },
};

const SITE_URL   = 'https://www.jatkoumshab.com';
const WORKER_URL = 'https://jatkoumshab-share.workers.dev';

const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const DAYS_AR   = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

function dayName(dateStr) {
  return DAYS_AR[new Date(dateStr).getDay()];
}

function fmtArabicDate(dateStr) {
  const d = new Date(dateStr);
  return `${DAYS_AR[d.getDay()]} ${d.getDate()} ${MONTHS_AR[d.getMonth()]} ${d.getFullYear()}`;
}

function fmtDMY(dateStr) {
  const d = new Date(dateStr);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function ArticleContent({ content }) {
  if (!content) return null;
  return (
    <div className="space-y-3 text-[15px] leading-8 text-slate-800" dir="rtl">
      {content.split(/\n\n+/).filter(Boolean).map((para, i) => (
        <p key={i}>
          {para.split('\n').map((line, j, arr) => (
            <React.Fragment key={j}>{line}{j < arr.length - 1 && <br />}</React.Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}

function CommuneChip({ item }) {
  return (
    <span className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-sm">
      <span className="font-bold text-slate-700">{toArabicCommune(item.city) || item.city}</span>
      {item.w != null && <span className="text-[10px] text-slate-500">{item.w} كم/س</span>}
      {item.confirmed && <span className="text-[10px] text-emerald-700">🛰️ مؤكدة</span>}
    </span>
  );
}

/* يوم واحد من التفاصيل الكاملة — نفس تصنيف بطاقة الصفحة الرئيسية، لكن غير مختصر */
function DayBreakdown({ day, forecast }) {
  const thunderGroups = groupThunderByLevel(forecast.thunder);
  const restBuckets = ['heavy', 'moderate', 'weak', 'wind'].filter(
    key => (forecast[key]?.length || 0) > 0
  );

  return (
    <div className="space-y-4">
      <p className="text-sm font-black text-slate-800">📅 {dayName(day.dateStr)} {fmtDMY(day.dateStr)}</p>

      {thunderGroups.map(group => (
        <div key={group.level || 'جافة'}>
          <p className="text-sm font-black text-slate-800 mb-2">⛈️ أمطار {group.label} مع عواصف رعدية</p>
          <div className="flex flex-wrap gap-2">
            {group.items.map((item, i) => <CommuneChip key={`${item.city}-${i}`} item={item} />)}
          </div>
        </div>
      ))}

      {restBuckets.map(key => {
        const meta = BUCKET_META[key];
        return (
          <div key={key}>
            <p className="text-sm font-black text-slate-800 mb-2">{meta.icon} {meta.label}</p>
            <div className="flex flex-wrap gap-2">
              {forecast[key].map((item, i) => <CommuneChip key={`${item.city}-${i}`} item={item} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* محتوى حيّ — نفس بيانات بطاقة "النشرة الجوية" في الصفحة الرئيسية، لكن لكل الأيام وبالقائمة الكاملة غير المختصرة */
function LiveForecastContent({ wilaya, entries }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-slate-600 leading-8">
        لا توقعات أمطار بارزة على ولاية {wilaya} خلال الأيام القادمة، بإذن الله.
      </p>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {entries.map(({ day, forecast }) => (
        <DayBreakdown key={day.dateStr} day={day} forecast={forecast} />
      ))}
    </div>
  );
}

function ShareRow({ wilaya, date, title, image }) {
  const [copied, setCopied] = useState(false);
  const slug       = wilayaToSlug(wilaya);
  const pageUrl    = `${SITE_URL}/forecast/${date}/${slug}`;
  const fbUrl      = encodeURIComponent(`${WORKER_URL}/forecast/${date}/${slug}`);
  const waText     = encodeURIComponent(`${title}\n\n📍 التفاصيل الكاملة:\n${pageUrl}\n\n— جاتكم اسحاب 🌦️`);

  const copy = () => {
    navigator.clipboard?.writeText(pageUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap" dir="rtl">
      <span className="text-xs font-bold text-slate-500">شارك:</span>
      <a href={`https://www.facebook.com/sharer/sharer.php?u=${fbUrl}`}
        target="_blank" rel="noreferrer"
        className="flex items-center gap-1.5 bg-[#1877F2] text-white px-3 py-1.5 rounded-xl text-xs font-black hover:bg-[#166FE5] transition-colors">
        <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M24 12.07C24 5.41 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.5 0-1.96.93-1.96 1.89v2.26h3.32l-.53 3.5h-2.8V24C19.62 23.1 24 18.1 24 12.07z"/></svg>
        Facebook
      </a>
      <a href={`https://wa.me/?text=${waText}`}
        target="_blank" rel="noreferrer"
        className="flex items-center gap-1.5 bg-[#25D366] text-white px-3 py-1.5 rounded-xl text-xs font-black hover:bg-[#1ebe5d] transition-colors">
        <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97s-.47-.15-.67.15-.77.97-.94 1.17-.35.22-.64.07a8.08 8.08 0 0 1-2.38-1.47 8.96 8.96 0 0 1-1.65-2.05c-.17-.3 0-.46.13-.6s.3-.35.44-.52a2 2 0 0 0 .3-.5.55.55 0 0 0 0-.52c-.07-.15-.67-1.62-.92-2.22s-.49-.5-.67-.5h-.57a1.1 1.1 0 0 0-.8.37 3.37 3.37 0 0 0-1.04 2.5 5.84 5.84 0 0 0 1.22 3.1c.15.2 2.1 3.2 5.08 4.49a17.2 17.2 0 0 0 1.7.63 4.1 4.1 0 0 0 1.87.12 3.1 3.1 0 0 0 2.03-1.43 2.5 2.5 0 0 0 .17-1.43c-.07-.13-.27-.2-.57-.35zM12 0A12 12 0 0 0 1.05 17.6L0 24l6.57-1.72A12 12 0 1 0 12 0zm0 21.82a9.82 9.82 0 0 1-5-1.37l-.36-.21-3.7.97.99-3.6-.23-.37A9.84 9.84 0 1 1 12 21.82z"/></svg>
        WhatsApp
      </a>
      <a href={`https://t.me/share/url?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(title)}`}
        target="_blank" rel="noreferrer"
        className="flex items-center gap-1.5 bg-[#229ED9] text-white px-3 py-1.5 rounded-xl text-xs font-black hover:bg-[#1a8bbf] transition-colors">
        ✈️ Telegram
      </a>
      <button onClick={copy}
        className="flex items-center gap-1.5 bg-slate-100 text-slate-600 px-3 py-1.5 rounded-xl text-xs font-black hover:bg-slate-200 transition-colors">
        {copied ? '✅ تم النسخ' : '🔗 نسخ الرابط'}
      </button>
    </div>
  );
}

export default function WilayaForecastPage() {
  const { date, wilayaSlug } = useParams();
  const wilaya = slugToWilaya(wilayaSlug);

  const { weatherData, loading: weatherLoading } = useWeatherContext();

  // بلديات هذه الولاية قد لا تكون قد وصل دورها بعد في التغطية الدورية للصفحة
  // الرئيسية (تناوب عشوائي لتوفير حصة الاستعلامات) — نجلبها مباشرة هنا حتى
  // لا تعتمد هذه الصفحة على الحظ في التوقيت.
  const [supplementCities, setSupplementCities] = useState([]);
  const [supplementReady, setSupplementReady] = useState(false);

  useEffect(() => {
    setSupplementReady(false);
    if (weatherLoading || !wilaya) return;

    const alreadyPresent = weatherData.some(
      c => normalizeMauritaniaWilayaName(c.wilaya) === wilaya
    );
    if (alreadyPresent) {
      setSupplementCities([]);
      setSupplementReady(true);
      return;
    }

    let cancelled = false;
    fetchWilayaCommunes(wilaya).then(results => {
      if (cancelled) return;
      setSupplementCities(results || []);
      setSupplementReady(true);
    });
    return () => { cancelled = true; };
  }, [weatherLoading, weatherData, wilaya]);

  const cities = useMemo(() => {
    if (supplementCities.length === 0) return weatherData;
    const existing = new Set(weatherData.map(c => c.city));
    return [...weatherData, ...supplementCities.filter(c => !existing.has(c.city))];
  }, [weatherData, supplementCities]);

  // ── نفس منطق البطاقة على الصفحة الرئيسية بالضبط (WeatherAlerts.jsx) ──
  // نعطي الأولوية لهذه البيانات الحيّة كي تكون هذه الصفحة امتداداً مباشراً للبطاقة،
  // وتعرض كل الأيام التي للولاية توقعات فيها (وليس يوماً واحداً فقط)
  const days = useMemo(() => buildForecastDays(cities), [cities]);
  const wilayaEntries = useMemo(() => {
    const list = [];
    days.forEach(day => {
      const forecast = day.forecasts.find(f => f.wilaya === wilaya);
      if (forecast) list.push({ day, forecast });
    });
    return list;
  }, [days, wilaya]);
  const hasLiveData = wilayaEntries.length > 0;

  const anyThunder = wilayaEntries.some(e => e.forecast.thunder.length > 0);
  const hasHeavyThunder = wilayaEntries.some(e =>
    e.forecast.thunder.some(t => t.level === 'غزيرة' || t.level === 'غزيرة جداً')
  );
  const topCities = [...new Set([
    ...wilayaEntries.flatMap(e => e.forecast.thunder.map(t => toArabicCommune(t.city))),
    ...wilayaEntries.flatMap(e => e.forecast.heavy.map(c => toArabicCommune(c.city))),
    ...wilayaEntries.flatMap(e => e.forecast.moderate.map(c => toArabicCommune(c.city))),
  ])].filter(Boolean).slice(0, 3);
  const daysLabel = [...new Set(wilayaEntries.map(e => dayName(e.day.dateStr)))].join(' و');

  // ── أرشيف: يُستخدم فقط للتواريخ التي خرجت من نافذة الأيام الثلاثة الحيّة ──
  const [article,  setArticle]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!date || !wilayaSlug) { setNotFound(true); setLoading(false); return; }

    // ننتظر استقرار البيانات الحيّة (بما فيها جلب بلديات هذه الولاية تحديداً) قبل اللجوء للأرشيف
    if (weatherLoading || !supplementReady) { setLoading(true); return; }

    if (hasLiveData) {
      setArticle(null);
      setNotFound(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setNotFound(false);

    // البحث بالولاية + التاريخ (يوم كامل) — أرشيف فقط
    const dayStart = `${date}T00:00:00`;
    const dayEnd   = `${date}T23:59:59`;

    supabase
      .from('news_articles')
      .select('*')
      .eq('wilaya', wilaya)
      .gte('published_at', dayStart)
      .lte('published_at', dayEnd)
      .eq('is_published', true)
      .order('published_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data?.length) {
          setArticle(data[0]);
        } else {
          setNotFound(true);
        }
        setLoading(false);
      });
  }, [date, wilayaSlug, wilaya, weatherLoading, supplementReady, hasLiveData]);

  const liveTitle = anyThunder
    ? `⛈️ عواصف رعدية مع أمطار — ${wilaya}`
    : `🌧️ أمطار متوقعة — ${wilaya}`;

  const prose = hasLiveData
    ? (anyThunder
        ? `يتوقع بإذن الله هطول أمطار من خفيفة إلى غزيرة، قد تصحبها عواصف رعدية، على عدد من مناطق ولاية ${wilaya} خلال ${wilayaEntries.length > 1 ? `يومي ${daysLabel}` : `يوم ${daysLabel}`}.`
        : `يتوقع بإذن الله هطول أمطار متفاوتة الشدة على عدد من مناطق ولاية ${wilaya} خلال ${wilayaEntries.length > 1 ? `يومي ${daysLabel}` : `يوم ${daysLabel}`}.`)
    : '';

  const pageTitle = article?.title || (hasLiveData ? liveTitle : '');

  useEffect(() => {
    document.title = pageTitle ? `${pageTitle} | جاتكم اسحاب` : 'جاتكم اسحاب | الطقس في موريتانيا';
    return () => { document.title = 'جاتكم اسحاب | الطقس في موريتانيا'; };
  }, [pageTitle]);

  const heroImage = article?.featured_image || getImageForAlert('أمطار', wilaya);

  if (loading) return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 mt-8 space-y-4">
        <div className="bg-white rounded-2xl h-56 animate-pulse border border-gray-100" />
        <div className="bg-white rounded-2xl h-8 animate-pulse border border-gray-100 w-3/4" />
        <div className="bg-white rounded-2xl h-48 animate-pulse border border-gray-100" />
      </main>
    </div>
  );

  if (notFound) return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 mt-16 text-center">
        <p className="text-5xl mb-4">🌦️</p>
        <h1 className="text-xl font-black text-gray-800 mb-2">
          لا توقعات منشورة لولاية {wilaya} بتاريخ {date}
        </h1>
        <p className="text-sm text-gray-500 mb-6">ربما لم تُنشر بعد أو التاريخ قد مضى.</p>
        <Link to="/" className="inline-flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-blue-700 transition-colors">
          ← العودة للصفحة الرئيسية
        </Link>
      </main>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-20" dir="rtl">
      <Navbar />

      <main className="max-w-2xl mx-auto px-4 mt-6">
        {/* Breadcrumb */}
        <nav className="text-sm text-gray-500 mb-4 flex items-center gap-2 flex-wrap">
          <Link to="/" className="hover:text-blue-600">الرئيسية</Link>
          <span>/</span>
          <span className="text-gray-800 font-bold">{wilaya}</span>
          <span>/</span>
          <span className="text-gray-500">{fmtArabicDate(date)}</span>
        </nav>

        <article className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          {/* صورة الغلاف */}
          <div className="relative h-52 overflow-hidden">
            <img src={heroImage} alt={pageTitle}
              className="w-full h-full object-cover"
              onError={e => { e.target.style.display='none'; }} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <div className="absolute bottom-0 right-0 left-0 p-5">
              <span className="inline-block bg-blue-500/80 text-white text-[11px] font-black px-2.5 py-1 rounded-full mb-2">
                {article?.category || 'توقعات'}
              </span>
              <h1 className="text-white font-black text-xl leading-tight">{pageTitle}</h1>
            </div>
          </div>

          <div className="p-5 md:p-7">
            {/* Meta */}
            <div className="flex items-center gap-3 flex-wrap text-xs text-gray-500 mb-5 pb-4 border-b border-gray-100">
              <span>📍 {wilaya}</span>
              <span>·</span>
              <span>📅 {fmtArabicDate(date)}</span>
              <span>·</span>
              <span>✍️ {article?.author || 'جاتكم اسحاب'}</span>
            </div>

            {hasLiveData ? (
              <>
                {topCities.length > 0 && (
                  <p className="text-xs text-gray-500 mb-2">📍 أبرز المناطق: {topCities.join('، ')}</p>
                )}
                <p className="text-[15px] leading-8 text-slate-800 mb-4">{prose}</p>
                {hasHeavyThunder && (
                  <p className="mb-5 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                    ⚠️ تنبيه: قد تشهد بعض المناطق أمطاراً غزيرة مع نشاط رعدي.
                  </p>
                )}
                <LiveForecastContent wilaya={wilaya} entries={wilayaEntries} />
              </>
            ) : (
              <ArticleContent content={article?.content} />
            )}

            {/* دعاء */}
            <div className="mt-6 py-4 text-center border-t border-b border-emerald-100 bg-emerald-50 rounded-xl">
              <p className="text-base font-black text-emerald-800">بإذن الله 🤲</p>
              <p className="text-sm font-bold text-emerald-700">اللهم اسقنا الغيث ولا تجعلنا من القانطين</p>
            </div>

            {/* المشاركة */}
            <div className="mt-5">
              <ShareRow
                wilaya={wilaya}
                date={date}
                title={pageTitle}
                image={heroImage}
              />
            </div>
          </div>
        </article>

        <div className="mt-6 text-center">
          <Link to="/" className="text-sm font-bold text-blue-600 hover:underline">← العودة للصفحة الرئيسية</Link>
        </div>
      </main>
    </div>
  );
}
