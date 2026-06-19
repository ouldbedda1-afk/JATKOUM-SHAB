import React, { useEffect, useMemo } from 'react';
import { useWeatherContext } from '../WeatherContext';
import { sendLocalNotification } from '../pwa';

/* ── تنسيق التواريخ والأوقات بالأحرف اللاتينية فقط ── */
function fmtDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
}
function fmtTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false
  });
}

const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
function dayName(dateStr) {
  return DAYS_AR[new Date(dateStr).getDay()];
}

function formatShortList(items, limit = 4) {
  const uniqueItems = [...new Set((items || []).filter(Boolean))];
  if (uniqueItems.length === 0) return '';
  if (uniqueItems.length <= limit) return uniqueItems.join('، ');
  return `${uniqueItems.slice(0, limit).join('، ')}، وغيرها`;
}

/* ── تصنيف شدة المطر ── */
function rainLevel(mm) {
  if (mm >= 20) return 'غزيرة جداً';
  if (mm >= 10) return 'غزيرة';
  if (mm >= 5)  return 'متوسطة';
  if (mm >= 1)  return 'ضعيفة';
  return null;
}

/* موسم الأمطار في موريتانيا: يونيو → أكتوبر
   العواصف الرعدية في هذه الفترة دائماً مصحوبة بأمطار (ITCZ) */
function isRainySeason(dateStr) {
  const m = new Date(dateStr).getMonth() + 1; // 1-12
  return m >= 6 && m <= 10;
}

/* ══════════════════════════════════════════
   مكوّن النشرة الجوية الرسمية (3 أيام موحدة)
══════════════════════════════════════════ */
function WeatherBulletin({ cities, rainingNow, sameDayRainEvents, modelRainingNow }) {
  // أسماء المقاطعات التي يرصدها الرادار الآن (للتأكيد)
  const satelliteSet = useMemo(
    () => new Set((rainingNow || []).map(r => r.city)),
    [rainingNow]
  );

  // نجمع البيانات مقسّمة حسب اليوم (3 أيام قادمة)
  const days = useMemo(() => {
    const map = {}; // key = dateStr

    cities.forEach(city => {
      const dates = city.daily?.time               || [];
      const codes = city.daily?.weather_code       || [];
      const rains = city.daily?.precipitation_sum  || [];
      const winds = city.daily?.wind_speed_10m_max || [];

      // نبحث عن الغد والأيام التالية (نتجاهل أي يوم <= اليوم الحالي)
      const todayStr = new Date().toISOString().slice(0, 10);
      let count = 0;
      for (let i = 0; i < dates.length && count < 3; i++) {
        if (!dates[i] || dates[i] <= todayStr) continue;
        count++;
        const dateStr = dates[i];
        if (!map[dateStr]) {
          map[dateStr] = {
            dateStr,
            dayAr:     dayName(dateStr),
            dateLabel: fmtDate(dateStr),
            thunder:   [],
            heavy:     [],
            moderate:  [],
            weak:      [],
            wind:      [],
          };
        }
        const d    = map[dateStr];
        const code = codes[i] ?? 0;
        const mm   = rains[i] ?? 0;
        const w    = winds[i] ?? 0;
        const confirmed = satelliteSet.has(city.city);

        if (code >= 95) {
          let rainDesc;
          if (isRainySeason(dateStr)) {
            rainDesc = mm >= 10 ? 'مصحوبة بأمطار غزيرة' : 'مصحوبة بأمطار';
          } else {
            rainDesc = mm >= 5 ? 'مصحوبة بأمطار غزيرة'
                     : mm >= 1 ? 'مصحوبة بأمطار'
                     : 'جافة (صواعق ورياح)';
          }
          d.thunder.push({ city: city.city, rainDesc, confirmed });
        } else if (mm >= 1 || code >= 61) {
          const lvl = rainLevel(mm);
          if (lvl === 'غزيرة جداً' || lvl === 'غزيرة') d.heavy.push({ city: city.city, confirmed });
          else if (lvl === 'متوسطة')                    d.moderate.push({ city: city.city, confirmed });
          else if (lvl === 'ضعيفة')                     d.weak.push({ city: city.city, confirmed });
        }
        if (w > 55) d.wind.push({ city: city.city, w: Math.round(w) });
      } // end for dates
    });

    return Object.values(map)
      .sort((a, b) => new Date(a.dateStr) - new Date(b.dateStr))
      .slice(0, 3);
  }, [cities, satelliteSet]);

  if (days.length === 0) return null;

  const issuedAt = `${fmtDate(new Date())} — ${fmtTime(new Date())}`;
  const todayLabel = `${dayName(new Date())} ${fmtDate(new Date())}`;

  const todayObservation = useMemo(() => {
    if ((sameDayRainEvents || []).length > 0) {
      const topEvents = sameDayRainEvents.slice(0, 4);
      const topEvent = topEvents[0];
      return {
        tone: 'archive',
        title: 'حدث اليوم عبر أرشيف الأقمار الصناعية',
        summary: `سجل أرشيف اليوم أمطاراً غزيرة في ${formatShortList(topEvents.map((event) => event.city), 4)}.`,
        details: topEvent?.firstSeen && topEvent?.lastSeen
          ? `أبرز نافذة رصد اليوم كانت بين ${fmtTime(topEvent.firstSeen)} و${fmtTime(topEvent.lastSeen)}، ما يؤكد أن اليوم شهد حالة مطرية فعلية وليست مجرد توقع.`
          : 'هذا خبر يومي مبني على أرشيف الإطارات المتاحة لليوم نفسه.',
        chips: ['حدث اليوم', 'أرشيف الأقمار', `${sameDayRainEvents.length} مقاطعة`],
      };
    }

    if ((rainingNow || []).length > 0) {
      const topRains = rainingNow.slice(0, 4);
      return {
        tone: 'live',
        title: 'رصد اليوم: أمطار جارية الآن',
        summary: `يرصد النظام حالياً أمطاراً على ${formatShortList(topRains.map((item) => item.city), 4)}.`,
        details: 'تُعرض هذه البطاقة قبل التوقعات لأن الحالة المرصودة اليوم أهم من الاكتفاء ببطاقات الأيام القادمة.',
        chips: ['رصد مباشر', `${rainingNow.length} مقاطعة`, topRains[0]?.label || 'مطر'],
      };
    }

    if ((modelRainingNow || []).length > 0) {
      const topModel = modelRainingNow.slice(0, 4);
      return {
        tone: 'model',
        title: 'رصد اليوم من النموذج',
        summary: `تشير البيانات الحالية إلى هطول قائم أو قريب في ${formatShortList(topModel.map((item) => item.city), 4)}.`,
        details: 'هذه قراءة داعمة من النموذج الحالي، وتُستخدم لإبراز حالة اليوم حتى عندما يكون الرادار اللحظي أقل وضوحاً محلياً.',
        chips: ['اليوم', 'قراءة نموذج', `${modelRainingNow.length} مقاطعة`],
      };
    }

    return null;
  }, [sameDayRainEvents, rainingNow, modelRainingNow]);

  // لون مختلف لكل يوم
  const DAY_THEMES = [
    {
      card: 'bg-gradient-to-br from-sky-500 via-blue-700 to-indigo-900 border-sky-200/30',
      header: 'bg-black/15 border-white/20',
      accent: 'text-sky-100',
      glow: 'shadow-sky-900/20',
      chip: 'bg-sky-200/15 text-sky-100 border-sky-200/20',
    },
    {
      card: 'bg-gradient-to-br from-emerald-500 via-green-700 to-lime-900 border-emerald-200/30',
      header: 'bg-black/15 border-white/20',
      accent: 'text-emerald-100',
      glow: 'shadow-emerald-900/20',
      chip: 'bg-emerald-200/15 text-emerald-100 border-emerald-200/20',
    },
    {
      card: 'bg-gradient-to-br from-slate-400 via-slate-600 to-slate-900 border-slate-200/30',
      header: 'bg-black/15 border-white/20',
      accent: 'text-slate-100',
      glow: 'shadow-slate-900/20',
      chip: 'bg-slate-200/15 text-slate-100 border-slate-200/20',
    },
  ];

  const buildDaySections = (day) => {
    const sections = [];

    if (day.thunder.length > 0) {
      sections.push({
        key: 'thunder',
        node: (
          <UnifiedSection
            icon="⚡"
            bg="bg-red-500/18 border border-red-300/25"
            dotColor="bg-red-300"
            textColor="text-white"
            label={<>يتوقع بإذن الله هطول أمطار <span className="text-red-300 font-black underline underline-offset-2">مصحوبة بعواصف رعدية قوية</span> — في المناطق التالية:</>}
            items={day.thunder.map(t => ({ city: t.city, extra: t.rainDesc, confirmed: t.confirmed }))}
            note="يُنصح بالابتعاد عن الأودية والمناطق المكشوفة والحذر من الصواعق"
          />
        ),
      });
    }

    if (day.heavy.length > 0) {
      sections.push({
        key: 'heavy',
        node: (
          <UnifiedSection
            icon="🌧️"
            bg="bg-white/10 border border-white/15"
            dotColor="bg-yellow-300"
            textColor="text-white"
            label={<>يتوقع بإذن الله هطول أمطار <span className="text-yellow-300 font-black underline underline-offset-2">غزيرة</span> — في المناطق التالية:</>}
            items={day.heavy}
          />
        ),
      });
    }

    if (day.moderate.length > 0) {
      sections.push({
        key: 'moderate',
        node: (
          <UnifiedSection
            icon="🌦️"
            bg="bg-white/10 border border-white/15"
            dotColor="bg-sky-300"
            textColor="text-white"
            label={<>يتوقع بإذن الله هطول أمطار <span className="text-sky-300 font-black underline underline-offset-2">متوسطة</span> — في المناطق التالية:</>}
            items={day.moderate}
          />
        ),
      });
    }

    if (day.weak.length > 0) {
      sections.push({
        key: 'weak',
        node: (
          <UnifiedSection
            icon="🌂"
            bg="bg-white/10 border border-white/15"
            dotColor="bg-white/60"
            textColor="text-white"
            label={<>يتوقع بإذن الله هطول أمطار <span className="text-white/80 font-black underline underline-offset-2">ضعيفة</span> — في المناطق التالية:</>}
            items={day.weak}
          />
        ),
      });
    }

    if (day.wind.length > 0) {
      sections.push({
        key: 'wind',
        node: (
          <UnifiedSection
            icon="🌬️"
            bg="bg-orange-400/18 border border-orange-300/25"
            dotColor="bg-orange-300"
            textColor="text-white"
            label={<>يتوقع بإذن الله <span className="text-orange-300 font-black underline underline-offset-2">رياح قوية</span> — في المناطق التالية:</>}
            items={day.wind.map(w => ({ city: w.city, extra: `${w.w} km/h` }))}
          />
        ),
      });
    }

    if (sections.length === 0) {
      sections.push({
        key: 'stable',
        node: (
          <div className="rounded-2xl p-4 shadow-lg backdrop-blur-sm bg-white/10 border border-white/15">
            <p className="text-base font-black text-white mb-2">ℹ️ لا مؤشرات بارزة في التوقعات لهذا التاريخ</p>
            <p className="text-sm text-white/85 leading-relaxed">
              لا تُظهر بيانات التوقعات المتاحة لهذا التاريخ تنبيهات بارزة حالياً، مع بقاء احتمال تشكل حالات محلية أو تطورات سريعة حسب حركة السحب والرصد المباشر.
            </p>
          </div>
        ),
      });
    }

    return sections;
  };

  const renderDayCard = (day, idx, sections, part = null) => {
    const theme = DAY_THEMES[idx] || DAY_THEMES[2];
    return (
      <article
        key={`${day.dateStr}-${part ?? 'full'}`}
        className={`${theme.card} ${theme.glow} relative h-fit text-white rounded-[2rem] shadow-2xl overflow-hidden border-2 ring-1 ring-white/10 backdrop-blur-sm`}
      >
        <div className={`${theme.header} px-5 py-4 flex items-center justify-between gap-3 border-b`}>
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 text-xl shadow-sm">📅</span>
            <div>
              <span className={`block font-black text-xl ${theme.accent}`}>{day.dayAr || `اليوم ${idx + 1}`}</span>
              <span className="block text-[11px] text-white/70 mt-1">
                {part ? `توقعات هذا التاريخ - الجزء ${part}` : 'توقعات هذا التاريخ'}
              </span>
            </div>
          </div>
          <div className="text-left">
            <span className={`inline-flex rounded-2xl border px-3 py-1.5 text-xs font-black shadow-sm ${theme.chip}`}>
              {day.dateLabel || fmtDate(day.dateStr)}
            </span>
            <span className="block text-[10px] text-white/65 mt-1">
              {part ? `بطاقة اليوم ${idx + 1} - ${part}` : `بطاقة اليوم ${idx + 1}`}
            </span>
          </div>
        </div>

        <div className="px-5 py-4 space-y-3">
          {sections.map((section) => (
            <React.Fragment key={section.key}>{section.node}</React.Fragment>
          ))}
        </div>
      </article>
    );
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* رأس النشرة */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-700 text-2xl text-white shadow-lg">📋</span>
          <div>
            <h3 className="text-lg font-black text-gray-800 dark:text-white">النشرة الجوية</h3>
            <p className="text-[11px] text-gray-500">عرض يومي منفصل لرصد اليوم والتوقعات والتنبيهات</p>
          </div>
        </div>
        <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-500 font-mono shadow-sm">{issuedAt}</span>
      </div>

      <div className="space-y-5">
        {todayObservation && (
          <article className="relative h-fit rounded-[2rem] border-2 border-violet-200 bg-gradient-to-br from-violet-600 via-fuchsia-700 to-rose-900 text-white shadow-2xl ring-1 ring-white/10 overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between gap-3 border-b border-white/15 bg-black/15">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 text-xl shadow-sm">🛰️</span>
                <div>
                  <span className="block font-black text-xl text-violet-100">حدث اليوم</span>
                  <span className="block text-[11px] text-white/70 mt-1">رصد فعلي قبل بطاقات التوقعات</span>
                </div>
              </div>
              <div className="text-left">
                <span className="inline-flex rounded-2xl border border-violet-200/30 bg-violet-200/15 px-3 py-1.5 text-xs font-black shadow-sm text-violet-100">
                  {todayLabel}
                </span>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="rounded-2xl p-4 shadow-lg backdrop-blur-sm bg-white/10 border border-white/15">
                <p className="text-base font-black text-white mb-2">{todayObservation.title}</p>
                <p className="text-sm font-bold text-white/95 leading-relaxed mb-2">{todayObservation.summary}</p>
                <p className="text-sm text-white/85 leading-relaxed">{todayObservation.details}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {todayObservation.chips.map((chip) => (
                    <span key={chip} className="px-3 py-1 rounded-full border border-white/15 bg-white/10 text-[10px] font-black text-white/90">
                      {chip}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </article>
        )}

        {days.flatMap((day, idx) => {
          const sections = buildDaySections(day);
          if (idx === 2 && sections.length > 1) {
            const splitIndex = Math.ceil(sections.length / 2);
            return [
              renderDayCard(day, idx, sections.slice(0, splitIndex), 1),
              renderDayCard(day, idx, sections.slice(splitIndex), 2),
            ];
          }
          return renderDayCard(day, idx, sections);
        })}
      </div>
    </div>
  );
}

function UnifiedSection({ icon, bg, dotColor, label, items, note, textColor = 'text-white' }) {
  return (
    <div className={`rounded-2xl p-4 shadow-lg backdrop-blur-sm ${bg}`}>
      <p className={`text-base font-black ${textColor} mb-3 leading-relaxed`}>
        {icon} {label}
      </p>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2.5 rounded-xl bg-black/5 px-2 py-1.5 text-sm">
            <span className={`w-2 h-2 rounded-full ${dotColor} shrink-0 mt-1.5 shadow-sm`} />
            <div className="leading-relaxed">
              <span className="font-black">{item.city}</span>
              {item.extra && (
                <span className="text-yellow-200/80 text-xs mr-1">— {item.extra}</span>
              )}
              {item.confirmed && (
                <span className="inline-flex items-center gap-0.5 mr-1 px-1.5 py-0.5 bg-emerald-500/30 border border-emerald-400/40 rounded-full text-[10px] font-black text-emerald-200">
                  🛰️ مؤكدة
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
      {note && (
        <p className="mt-3 text-xs text-white/60 italic border-t border-white/10 pt-2">{note}</p>
      )}
    </div>
  );
}


/* ══════════════════════════════════════════
   المكوّن الرئيسي للتنبيهات
══════════════════════════════════════════ */
const WeatherAlerts = () => {
  const {
    weatherData: citiesWeather,
    manualAlerts,
    rainReports,
    rainingNow,
    modelRainingNow,
    sameDayRainEvents,
    loading,
    lastUpdated,
  } = useWeatherContext();

  const weatherAlerts = useMemo(() => {
    if (loading) return [];

    const dataAgeMs  = lastUpdated ? Date.now() - lastUpdated.getTime() : Infinity;
    const dataIsFresh = dataAgeMs < 60 * 60 * 1000;

    const adminAlerts = [];
    const priorityArchiveAlerts = [];
    const result = [];
    const cities = citiesWeather || [];

    /* ── 0. تنبيهات يدوية من الإدارة ── */
    (manualAlerts || []).forEach(alert => {
      adminAlerts.push({
        id: `manual-${alert.id}`,
        title: alert.title,
        message: alert.message,
        icon: alert.icon || '⚠️',
        color: 'bg-red-700',
        tags: Array.isArray(alert.tags) ? alert.tags : JSON.parse(alert.tags || '[]'),
      });
    });

    /* ── 1. حدث في نفس اليوم: أرشيف الأقمار الصناعية ── */
    if (sameDayRainEvents && sameDayRainEvents.length > 0) {
      const topEvents = sameDayRainEvents.slice(0, 4);
      const topEvent = topEvents[0];
      const cityList = topEvents
        .map(event => `${event.city}${event.wilaya ? ` (${event.wilaya})` : ''}`)
        .join('، ');
      const timeWindow = topEvent?.firstSeen && topEvent?.lastSeen
        ? `${fmtTime(topEvent.firstSeen)} - ${fmtTime(topEvent.lastSeen)}`
        : '';

      priorityArchiveAlerts.push({
        id: 'same-day-archive-event',
        title: 'خبر حدث في نفس اليوم 🛰️',
        message: `يكشف أرشيف الأقمار الصناعية اليوم عن أمطار غزيرة مرصودة في:\n${cityList}\n${
          timeWindow ? `أبرز نافذة رصد: ${timeWindow}.\n` : ''
        }تم تسجيل هذا الحدث من خلال إطارات اليوم نفسه، وهو خبر أرشيفي مستقل عن الرصد الآني الحالي.`,
        icon: '🛰️',
        color: 'bg-violet-700',
        tags: ['أرشيف اليوم', `${sameDayRainEvents.length} مقاطعة`, topEvent?.label || 'أمطار غزيرة'].filter(Boolean),
      });
    }

    /* ── 2. بشائر الخير الآن: الأقمار الصناعية ── */
    if (rainingNow && rainingNow.length > 0) {
      const radarAge  = rainingNow[0]?.radarAge ?? null;
      const ageLabel  = radarAge != null ? `Radar: ${radarAge} min ago` : '';
      const cityList  = rainingNow.map(c => {
        const w = c.wilaya ? ` (${c.wilaya})` : '';
        return `${c.city}${w} — ${c.label}`;
      }).join('، ');
      result.push({
        id: 'rain-now-satellite',
        title: 'بشائر الخير الآن 🛰️',
        message: `رصدت أقمار RainViewer الصناعية هطول أمطار الآن في:\n${cityList}\nجعلها الله أمطار خير وبركة.`,
        icon: '🌦️',
        color: 'bg-emerald-700',
        tags: ['🛰️ RainViewer', `${rainingNow.length} مقاطعة`, ageLabel].filter(Boolean)
      });
    }

    /* ── 3. بلاغات المواطنين (آخر 3 ساعات) ── */
    const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;
    const freshReports  = (rainReports || []).filter(
      r => r.created_at && new Date(r.created_at).getTime() > threeHoursAgo
    );
    if (freshReports.length > 0) {
      const locs = freshReports.map(r => {
        const t = r.created_at ? ` [${fmtTime(r.created_at)}]` : '';
        return `${r.location}${t}`;
      });
      result.push({
        id: 'rain-now-citizen',
        title: 'بلاغات ميدانية: أمطار الآن',
        message: `وردت بلاغات ميدانية من المواطنين بهطول أمطار في:\n${locs.join('\n')}\nجعلها الله أمطار خير وبركة.`,
        icon: '🌧️',
        color: 'bg-teal-700',
        tags: ['بلاغ ميداني', `${freshReports.length} بلاغ`, 'آخر 3 ساعات']
      });
    }

    if (dataIsFresh) {
      /* ── 4. عواصف رعدية الآن — مؤكدة بالأقمار الصناعية فقط ──
         weather_code هو توقع نموذج رياضي وليس رصداً حقيقياً
         المصدر الوحيد الموثوق "الآن" هو رادار RainViewer (rainingNow) ── */
      if (rainingNow && rainingNow.length > 0) {
        // نتحقق هل أي مقاطعة ترصد فيها الأقمار أمطاراً وكودها >= 95 (عاصفة)
        const satelliteCityNames = new Set(rainingNow.map(r => r.city));
        const confirmedThunder = cities.filter(
          c => satelliteCityNames.has(c.city) && (c.current?.weather_code ?? 0) >= 95
        );
        if (confirmedThunder.length > 0) {
          result.push({
            id: 'thunder-now-confirmed',
            title: 'تحذير عاجل: عواصف رعدية مؤكدة بالأقمار 🛰️⚡',
            message: `رصدت الأقمار الصناعية عواصف رعدية مصحوبة بأمطار الآن في:\n${confirmedThunder.map(c => c.city).join('، ')}\nيُرجى الحذر من الصواعق والابتعاد عن الأودية.`,
            icon: '⚡',
            color: 'bg-red-800',
            tags: ['🛰️ مؤكد بالرادار', 'عواصف رعدية', fmtTime(new Date())]
          });
        }
      }

      /* ── 5. رياح قوية الآن (wind_speed موثوق من محطات) ── */
      const windNow = cities.filter(c => (c.current?.wind_speed_10m ?? 0) >= 45);
      if (windNow.length > 0) {
        result.push({
          id: 'wind-now',
          title: 'تحذير: رياح قوية الآن',
          message: `رياح قوية تتجاوز 45 km/h في: ${windNow.map(c => `${c.city} (${Math.round(c.current.wind_speed_10m)} km/h)`).join('، ')}.`,
          icon: '🌬️',
          color: 'bg-orange-700',
          tags: ['رياح عاتية', fmtTime(new Date())]
        });
      }

      /* ── 6. موجة حر ── */
      const heatNow = cities.filter(c => (c.current?.temperature_2m ?? 0) >= 45);
      if (heatNow.length > 0) {
        result.push({
          id: 'heat-now',
          title: 'تحذير: موجة حر شديدة',
          message: `درجات حرارة تتجاوز 45°C في: ${heatNow.map(c => `${c.city} (${Math.round(c.current.temperature_2m)}°C)`).join('، ')}.\nيُرجى شرب السوائل وتجنّب الشمس.`,
          icon: '🔥',
          color: 'bg-orange-600',
          tags: ['موجة حر', fmtDate(new Date())]
        });
      }
    }

    return [...adminAlerts, ...priorityArchiveAlerts, ...result];
  }, [loading, citiesWeather, manualAlerts, rainReports, rainingNow, sameDayRainEvents, lastUpdated]);

  /* إشعارات المتصفح */
  useEffect(() => {
    if (!loading && weatherAlerts.length > 0) {
      const key = weatherAlerts[0].id + weatherAlerts[0].title;
      if (localStorage.getItem('last_alert_id') !== key) {
        sendLocalNotification(`تنبيه جوي: ${weatherAlerts[0].title}`, {
          body: weatherAlerts[0].message.substring(0, 100) + '...',
          tag: 'weather-alert'
        });
        localStorage.setItem('last_alert_id', key);
      }
    }
  }, [loading, weatherAlerts]);

  if (loading || !citiesWeather || citiesWeather.length === 0) return null;

  const cities = citiesWeather || [];

  return (
    <div className="space-y-4" dir="rtl">

      {/* تنبيهات فورية */}
      {weatherAlerts.map(alert => (
        <div key={alert.id}
          className={`${alert.color} text-white p-6 rounded-[2rem] shadow-xl relative overflow-hidden border-4 border-white/10`}>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <span className="animate-ping w-2 h-2 bg-white rounded-full shrink-0" />
              <h3 className="text-xl font-black">{alert.title}</h3>
            </div>
            <div className="text-sm font-bold leading-relaxed whitespace-pre-wrap">
              {alert.message}
            </div>
            {alert.tags?.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {alert.tags.map((tag, i) => (
                  <span key={i}
                    className="px-3 py-1 bg-white/20 text-white text-[10px] font-black rounded-full backdrop-blur-sm font-mono">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="absolute -bottom-4 -left-4 opacity-20">
            <span className="text-8xl">{alert.icon}</span>
          </div>
        </div>
      ))}

      {/* ═══ النشرة الجوية (3 أيام) ═══ */}
      <WeatherBulletin
        cities={cities}
        rainingNow={rainingNow}
        sameDayRainEvents={sameDayRainEvents}
        modelRainingNow={modelRainingNow}
      />

    </div>
  );
};

export default WeatherAlerts;
