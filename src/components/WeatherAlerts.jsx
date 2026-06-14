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
function WeatherBulletin({ cities, rainingNow }) {
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
      .filter(d =>
        d.thunder.length + d.heavy.length + d.moderate.length +
        d.weak.length + d.wind.length > 0
      );
  }, [cities, satelliteSet]);

  if (days.length === 0) return null;

  const issuedAt = `${fmtDate(new Date())} — ${fmtTime(new Date())}`;

  // لون مختلف لكل يوم
  const DAY_THEMES = [
    { card: 'bg-gradient-to-br from-blue-700 to-blue-900',     header: 'bg-blue-950/40 border-blue-500/30',    accent: 'text-blue-200' },
    { card: 'bg-gradient-to-br from-teal-700 to-teal-900',     header: 'bg-teal-950/40 border-teal-500/30',    accent: 'text-teal-200' },
    { card: 'bg-gradient-to-br from-indigo-700 to-indigo-900', header: 'bg-indigo-950/40 border-indigo-500/30', accent: 'text-indigo-200' },
  ];

  return (
    <div className="space-y-4" dir="rtl">
      {/* رأس النشرة */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📋</span>
          <h3 className="text-lg font-black text-gray-800 dark:text-white">النشرة الجوية</h3>
        </div>
        <span className="text-xs text-gray-400 font-mono">{issuedAt}</span>
      </div>

      {days.map((day, idx) => {
        const theme = DAY_THEMES[idx] || DAY_THEMES[2];
        return (
          <div key={day.dateStr} className={`${theme.card} text-white rounded-[2rem] shadow-xl overflow-hidden border-2`}>
            {/* رأس اليوم */}
            <div className={`${theme.header} px-5 py-3 flex items-center gap-3 border-b`}>
              <span className="text-xl">📅</span>
              <span className={`font-black text-base ${theme.accent}`}>{day.dayAr}</span>
              <span className="font-mono text-xs text-white/50">{day.dateLabel}</span>
            </div>

            <div className="px-5 py-4 space-y-3">
              {/* عواصف رعدية */}
              {day.thunder.length > 0 && (
                <UnifiedSection
                  icon="⚡"
                  bg="bg-red-500/20 border border-red-300/30"
                  dotColor="bg-red-300"
                  textColor="text-white"
                  label={<>يتوقع بإذن الله هطول أمطار <span className="text-red-300 font-black underline underline-offset-2">مصحوبة بعواصف رعدية قوية</span> — في المناطق التالية:</>}
                  items={day.thunder.map(t => ({ city: t.city, extra: t.rainDesc, confirmed: t.confirmed }))}
                  note="يُنصح بالابتعاد عن الأودية والمناطق المكشوفة والحذر من الصواعق"
                />
              )}

              {/* أمطار غزيرة */}
              {day.heavy.length > 0 && (
                <UnifiedSection
                  icon="🌧️"
                  bg="bg-white/10 border border-white/20"
                  dotColor="bg-yellow-300"
                  textColor="text-white"
                  label={<>يتوقع بإذن الله هطول أمطار <span className="text-yellow-300 font-black underline underline-offset-2">غزيرة</span> — في المناطق التالية:</>}
                  items={day.heavy}
                />
              )}

              {/* أمطار متوسطة */}
              {day.moderate.length > 0 && (
                <UnifiedSection
                  icon="🌦️"
                  bg="bg-white/10 border border-white/20"
                  dotColor="bg-sky-300"
                  textColor="text-white"
                  label={<>يتوقع بإذن الله هطول أمطار <span className="text-sky-300 font-black underline underline-offset-2">متوسطة</span> — في المناطق التالية:</>}
                  items={day.moderate}
                />
              )}

              {/* أمطار ضعيفة */}
              {day.weak.length > 0 && (
                <UnifiedSection
                  icon="🌂"
                  bg="bg-white/10 border border-white/20"
                  dotColor="bg-white/60"
                  textColor="text-white"
                  label={<>يتوقع بإذن الله هطول أمطار <span className="text-white/80 font-black underline underline-offset-2">ضعيفة</span> — في المناطق التالية:</>}
                  items={day.weak}
                />
              )}

              {/* رياح قوية */}
              {day.wind.length > 0 && (
                <UnifiedSection
                  icon="🌬️"
                  bg="bg-orange-400/20 border border-orange-300/30"
                  dotColor="bg-orange-300"
                  textColor="text-white"
                  label={<>يتوقع بإذن الله <span className="text-orange-300 font-black underline underline-offset-2">رياح قوية</span> — في المناطق التالية:</>}
                  items={day.wind.map(w => ({ city: w.city, extra: `${w.w} km/h` }))}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function UnifiedSection({ icon, bg, dotColor, label, items, note, textColor = 'text-white' }) {
  return (
    <div className={`rounded-xl p-4 ${bg}`}>
      <p className={`text-base font-black ${textColor} mb-3 leading-relaxed`}>
        {icon} {label}
      </p>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <span className={`w-2 h-2 rounded-full ${dotColor} shrink-0 mt-1.5`} />
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
  const { weatherData: citiesWeather, manualAlerts, rainReports, rainingNow, loading, lastUpdated } = useWeatherContext();

  const weatherAlerts = useMemo(() => {
    if (loading) return [];

    const dataAgeMs  = lastUpdated ? Date.now() - lastUpdated.getTime() : Infinity;
    const dataIsFresh = dataAgeMs < 60 * 60 * 1000;

    const result = [];
    const cities = citiesWeather || [];

    /* ── 0. تنبيهات يدوية من الإدارة ── */
    (manualAlerts || []).forEach(alert => {
      result.push({
        id: `manual-${alert.id}`,
        title: alert.title,
        message: alert.message,
        icon: alert.icon || '⚠️',
        color: 'bg-red-700',
        tags: Array.isArray(alert.tags) ? alert.tags : JSON.parse(alert.tags || '[]'),
      });
    });

    /* ── 1. بشائر الخير الآن: الأقمار الصناعية ── */
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

    /* ── 2. بلاغات المواطنين (آخر 3 ساعات) ── */
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
      /* ── 3. عواصف رعدية الآن — مؤكدة بالأقمار الصناعية فقط ──
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

      /* ── 4. رياح قوية الآن (wind_speed موثوق من محطات) ── */
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

      /* ── 5. موجة حر ── */
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

    return result;
  }, [loading, citiesWeather, manualAlerts, rainReports, rainingNow, lastUpdated]);

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
      <WeatherBulletin cities={cities} rainingNow={rainingNow} />

      {/* لا توجد أي بيانات */}
      {weatherAlerts.length === 0 && (
        <div className="bg-emerald-700 text-white p-6 rounded-[2rem] shadow-xl relative overflow-hidden">
          <div className="relative z-10">
            <h3 className="text-lg font-black mb-2">حالة الطقس مستقرة</h3>
            <p className="text-sm opacity-90 leading-relaxed">
              لا توجد تنبيهات جوية خطيرة حالياً في عموم مقاطعات موريتانيا. الأجواء مستقرة بشكل عام.
            </p>
          </div>
          <div className="absolute -bottom-2 -left-2 opacity-20">
            <span className="text-6xl">✅</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default WeatherAlerts;
