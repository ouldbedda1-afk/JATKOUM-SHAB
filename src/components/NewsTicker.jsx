import React, { useMemo } from 'react';
import { useWeatherContext } from '../WeatherContext';
import { toArabicCommune } from '../mauritaniaCommuneNamesAr';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';

// تعريب قائمة أسماء مفصولة للعرض
const arList = (names) => (names || []).map(toArabicCommune).join('، ');

// تنسيق التاريخ والوقت بالأحرف اللاتينية فقط (en-GB)
function fmtDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}
function fmtDateTime(dateStr) {
  return `${fmtDate(dateStr)} ${fmtTime(dateStr)}`;
}

// أكثر المواضع بؤراً في الشريط؛ والبقية في قسم الحرائق بصفحة المراعي
const MAX_FIRE_NEWS = 6;

// الاتجاه من البلدية: «غرب اركيز»، والمركّب «في الجنوب الغربي من اركيز»
const COMPOUND_DIRECTIONS = {
  'شمال شرق': 'الشمال الشرقي', 'شمال غرب': 'الشمال الغربي', 'جنوب شرق': 'الجنوب الشرقي', 'جنوب غرب': 'الجنوب الغربي',
};
const directionFrom = (dir, place) => (COMPOUND_DIRECTIONS[dir] ? `في ${COMPOUND_DIRECTIONS[dir]} من ${place}` : `${dir} ${place}`);

// عدد البؤر بصيغته العربية: بؤرة واحدة، بؤرتان، 3–10 بؤر، 11 بؤرة فأكثر
function hotspotCount(n) {
  if (n === 1) return 'بؤرة واحدة';
  if (n === 2) return 'بؤرتان';
  if (n <= 10) return `${n} بؤر`;
  return `${n} بؤرة`;
}

function formatShortList(items, limit = 5) {
  const uniqueItems = [...new Set((items || []).filter(Boolean))];
  if (uniqueItems.length === 0) return '';
  if (uniqueItems.length <= limit) return uniqueItems.join('، ');
  return `${uniqueItems.slice(0, limit).join('، ')}، وغيرها`;
}

function uniqueByCity(items) {
  const seen = new Set();
  return (items || []).filter((item) => {
    const key = item?.city;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildLocalAreaLabel(wilayas, cityNames) {
  if ((wilayas || []).length === 1) return `في أجزاء من ${wilayas[0]}`;
  if ((wilayas || []).length > 1) return `على نطاق محلي بين ${formatShortList(wilayas, 3)}`;
  if ((cityNames || []).length > 0) return `حول ${formatShortList(cityNames, 3)}`;
  return 'على نطاق محلي';
}

const NewsTicker = () => {
  const {
    weatherData,
    fires,
    rainReports,
    rainingNow,
    modelRainingNow,
    sameDayRainEvents,
    ecmwfBriefs,
    weatherBulletins,
    loading,
    refreshAllData,
    lastUpdated,
  } = useWeatherContext();

  const newsItems = useMemo(() => {
    if (loading || !weatherData) return [];

    const dataAgeMs = lastUpdated ? Date.now() - lastUpdated.getTime() : Infinity;
    const dataIsFresh = dataAgeMs < 60 * 60 * 1000;

    const urgentAlerts = [];
    const externalAlerts = [];
    const forecastAlerts = [];
    const generalAlerts = [];

    // ── نشرات إدارية من تيليجرام (أعلى الأولويات) — فقط آخر 12 ساعة ──
    if (weatherBulletins && weatherBulletins.length > 0) {
      const cutoff = Date.now() - 12 * 60 * 60 * 1000;
      weatherBulletins
        .filter(b => !b.created_at || new Date(b.created_at).getTime() > cutoff)
        .forEach((b) => { urgentAlerts.unshift(`${b.icon} ${b.text}`); });
    }

    const now = new Date();
    let sameDayHeadline = null;

    if (sameDayRainEvents && sameDayRainEvents.length > 0) {
      const topEvents = sameDayRainEvents.slice(0, 4);
      const topEvent = topEvents[0];
      const cityList = topEvents.map(event => event.city).join('، ');
      const timeWindow = topEvent?.firstSeen && topEvent?.lastSeen
        ? ` [${fmtTime(topEvent.firstSeen)} - ${fmtTime(topEvent.lastSeen)}]`
        : '';

      sameDayHeadline = `حدث في نفس اليوم 🛰️ | أرشيف الأقمار الصناعية يرصد أمطاراً غزيرة في: ${cityList}${timeWindow}.`;
    }

    if (ecmwfBriefs && ecmwfBriefs.length > 0) {
      ecmwfBriefs.slice(0, 3).forEach((item) => {
        externalAlerts.push(`ECMWF | ${item.brief}`);
      });
    }

    const liveEntries = uniqueByCity(rainingNow);
    const liveCitySet = new Set(liveEntries.map((entry) => entry.city));
    const modelEntries = uniqueByCity((modelRainingNow || []).filter((entry) => !liveCitySet.has(entry.city)));
    const currentRainEntries = liveEntries.length > 0 ? liveEntries : modelEntries;

    if (currentRainEntries.length > 0) {
      const cityNames = currentRainEntries.map((entry) => entry.city);
      const wilayas = [...new Set(
        currentRainEntries
          .map((entry) => entry.wilaya || weatherData.find((city) => city.city === entry.city)?.wilaya || '')
          .filter(Boolean)
      )];
      const sourceLabel = liveEntries.length > 0 ? 'الأقمار الصناعية' : 'النموذج الحالي';
      const sourceTag = liveEntries.length > 0 ? '🛰️' : '📊';

      urgentAlerts.unshift(
        `🔴 عاجل الآن ${sourceTag} | ${sourceLabel} تُظهر خلايا أو غيوماً ماطرة محلية ${buildLocalAreaLabel(
          wilayas,
          cityNames
        )}. المناطق الحالية: ${formatShortList(cityNames, 8)}.`
      );
    }

    weatherData.forEach(cityData => {
      const code   = cityData.current?.weather_code   ?? 0;
      const temp   = cityData.current?.temperature_2m ?? 0;
      const wind   = cityData.current?.wind_speed_10m ?? 0;

      // weather_code >= 95 هو توقع نموذج وليس رصداً — لا يُستخدم لتنبيهات "الآن"
      // العواصف الآن تُضاف أدناه من الأقمار الصناعية فقط
      if (dataIsFresh) {
        if (wind > 45) {
          urgentAlerts.push(`عاجل | رياح قوية ${Math.round(wind)} كم/س في ${cityData.city} [${fmtTime(now)}]`);
        }
        if (temp > 45) {
          urgentAlerts.push(`عاجل | موجة حر ${Math.round(temp)}°م في ${cityData.city} [${fmtDate(now)}]`);
        }
      }

      // --- توقعات المركز الأوروبي (Open-Meteo) للأيام القادمة ---
      const dailyCodes  = cityData.daily?.weather_code          || [];
      const dailyDates  = cityData.daily?.time                  || [];
      const dailyWind   = cityData.daily?.wind_speed_10m_max    || [];
      const dailyMaxT   = cityData.daily?.temperature_2m_max    || [];
      const dailyRain   = cityData.daily?.precipitation_sum     || [];

      const todayStr = new Date().toISOString().slice(0, 10);
      dailyCodes.forEach((dCode, i) => {
        if (!dailyDates[i]) return;
        if (dailyDates[i] < todayStr) return; // تجاهل أخبار الأيام الماضية
        const dateLabel = fmtDate(dailyDates[i]);

        if (dCode >= 95) {
          forecastAlerts.push(
            `عاصفة رعدية متوقعة في ${cityData.city} — ${dateLabel}`
          );
        } else if (dCode >= 80 && (dailyRain[i] ?? 0) >= 5) {
          forecastAlerts.push(
            `أمطار ${(dailyRain[i]).toFixed(1)} مم متوقعة في ${cityData.city} — ${dateLabel}`
          );
        }
        if ((dailyWind[i] ?? 0) > 60) {
          forecastAlerts.push(
            `رياح عاتية ${Math.round(dailyWind[i])} كم/س متوقعة في ${cityData.city} — ${dateLabel}`
          );
        }
        if ((dailyMaxT[i] ?? 0) >= 45) {
          forecastAlerts.push(
            `حر شديد ${Math.round(dailyMaxT[i])}°م متوقع في ${cityData.city} — ${dateLabel}`
          );
        }
      });

      // انخفاض الحرارة الملموس غداً
      const todayMax    = cityData.daily?.temperature_2m_max?.[0];
      const tomorrowMax = cityData.daily?.temperature_2m_max?.[1];
      const tomorrowDate = dailyDates[1] ? fmtDate(dailyDates[1]) : '';
      if (todayMax && tomorrowMax && tomorrowMax <= todayMax - 5) {
        generalAlerts.push(
          `بشرى: انخفاض في الحرارة غداً في ${cityData.city} — ${Math.round(tomorrowMax)}°م (${tomorrowDate})`
        );
      }
    });

    // --- أقمار صناعية: أمطار + عواصف مؤكدة ---
    if (rainingNow && rainingNow.length > 0) {
      const radarAge  = rainingNow[0]?.radarAge ?? null;
      const ageLabel  = radarAge != null ? ` [الرادار: قبل ${radarAge} دقيقة]` : '';

      // تمييز المقاطعات التي كودها >= 95 (عاصفة رعدية) مع تأكيد الأقمار
      const satelliteNames = new Set(rainingNow.map(r => r.city));
      const thunderConfirmed = weatherData.filter(
        c => satelliteNames.has(c.city) && (c.current?.weather_code ?? 0) >= 95
      ).map(c => c.city);

      const rainOnly = rainingNow
        .filter(r => !thunderConfirmed.includes(r.city))
        .map(c => c.city);

      if (thunderConfirmed.length > 0) {
        urgentAlerts.unshift(`🔴 عاجل الآن ⚡ | عواصف رعدية وبرق مرصودة بالأقمار في: ${arList(thunderConfirmed)}${ageLabel} — يرجى الحذر!`);
      }
      if (rainOnly.length > 0) {
        urgentAlerts.unshift(`🔴 عاجل الآن 🌧️ | غيوم ماطرة رصدتها الأقمار في: ${arList(rainOnly)}${ageLabel}. جعلها الله خيراً.`);
      }
    }

    // --- رصد داعم حسب النموذج (Open-Meteo) لما لم يرصده الرادار ---
    if (modelRainingNow && modelRainingNow.length > 0) {
      const radarSet = new Set((rainingNow || []).map(r => r.city));
      const modelThunder = modelRainingNow.filter(m => m.isThunder && !radarSet.has(m.city)).map(m => m.city);
      const modelRain = modelRainingNow.filter(m => !m.isThunder && !radarSet.has(m.city)).map(m => m.city);

      if (modelThunder.length > 0) {
        forecastAlerts.push(`🔭 توقّع نموذجي (غير مؤكد بالرادار) | احتمال عواصف رعدية في: ${arList(modelThunder.slice(0, 5))}.`);
      }
      if (modelRain.length > 0) {
        forecastAlerts.push(`🔭 توقّع نموذجي (غير مؤكد بالرادار) | احتمال أمطار في: ${arList(modelRain.slice(0, 6))}.`);
      }
    }

    // --- بلاغات المواطنين (آخر 3 ساعات) ---
    if (rainReports && rainReports.length > 0) {
      const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;
      rainReports
        .filter(r => r.created_at && new Date(r.created_at).getTime() > threeHoursAgo)
        .slice(0, 3)
        .forEach(report => {
          const timeLabel = report.created_at ? ` [${fmtTime(report.created_at)}]` : '';
          urgentAlerts.push(`تبشيرة: بلاغ ميداني — أمطار في ${report.location}${timeLabel} (${report.intensity})`);
        });
    }

    // --- حرائق آخر 24 ساعة (NASA FIRMS): خبر لكل موضع، بأقرب بلدية والمسافة والاتجاه ---
    const fireNews = [];
    if (fires && fires.length > 0) {
      const byPlace = new Map();
      fires.forEach((f) => {
        const key = `${f.nearestCity}|${f.direction}`;
        const g = byPlace.get(key) || { ...f, count: 0, dists: [] };
        g.count++; g.dists.push(f.distanceKm);
        byPlace.set(key, g);
      });
      [...byPlace.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, MAX_FIRE_NEWS)
        .forEach((g) => {
          const km = Math.round(g.dists.reduce((x, y) => x + y, 0) / g.dists.length);
          const where = km <= 2 ? `قرب ${g.nearestCity}` : `على بعد ${km} كم ${directionFrom(g.direction, g.nearestCity)}`;
          fireNews.push(`🔥 عاجل: حريق ${where}${g.wilaya ? ` (${g.wilaya})` : ''}${g.count > 1 ? ` — ${hotspotCount(g.count)}` : ''}`);
        });
    }

    // ترتيب: عاجل → توقعات المركز الأوروبي → أخبار المستخدمين → حرائق → عام.
    // لا نصوص ثابتة: بلا أخبار حقيقية لا يظهر الشريط أصلاً
    return [
      ...(sameDayHeadline ? [sameDayHeadline] : []),
      ...externalAlerts,
      ...urgentAlerts,
      ...forecastAlerts.slice(0, 6),
      ...fireNews,
      ...generalAlerts.slice(0, 3),
    ];
  }, [loading, weatherData, fires, rainReports, rainingNow, modelRainingNow, sameDayRainEvents, ecmwfBriefs, weatherBulletins, lastUpdated]);

  if (newsItems.length === 0) return null;

  // سرعة ثابتة: ~4.5 ثانية لكل خبر (حد أدنى 18ث) — يضمن مرور كل الأخبار بوضوح
  const tickerDuration = Math.max(18, newsItems.length * 4.5);

  return (
    <div className="bg-yellow-400 py-2 overflow-hidden border-y border-yellow-500 shadow-sm relative z-40" dir="rtl">
      <div className="flex items-center">
        <div className="bg-red-600 text-white px-4 md:px-6 py-2 text-sm md:text-lg font-black rounded-l-2xl z-50 whitespace-nowrap shadow-xl flex items-center gap-2">
          <span className="animate-pulse w-2 h-2 bg-white rounded-full"></span>
          أخبار عاجلة
          <button
            onClick={() => refreshAllData(true)}
            className="mr-2 p-1 hover:bg-white/20 rounded-full transition-colors"
            title="تحديث البيانات الآن"
          >
            <SafeIcon icon={FiIcons.FiRefreshCw} className={`text-xs md:text-sm ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex-1 overflow-hidden relative" dir="ltr">
          <div
            className="ticker-track flex flex-nowrap"
            style={{ width: 'max-content', animationDuration: `${tickerDuration}s` }}
          >
            {/* المسار ltr لقياس عرض موثوق على الهاتف؛ نص كل خبر rtl.
                نكرّر القائمة مرتين + تباعد متماثل لكل عنصر → عرض مضاعف تماماً والـ50% = نسخة كاملة */}
            {[...newsItems, ...newsItems].map((item, index) => (
              <span key={index} dir="rtl" className="text-sm md:text-base font-black text-gray-900 inline-flex items-center gap-2 shrink-0 px-5">
                <span className="w-2 h-2 bg-red-600 rounded-full shrink-0"></span>
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewsTicker;
