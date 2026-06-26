import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import { useWeatherContext } from '../WeatherContext';
import { getWeatherDescription, getWeatherIcon } from '../weatherApi';

const { FiX, FiSend, FiChevronDown } = FiIcons;

const QUESTIONS = [
  { icon: '🌧️', text: 'هل ستمطر الليلة في منطقتي؟' },
  { icon: '⚡',  text: 'هل هناك عواصف رعدية الآن؟' },
  { icon: '🗺️', text: 'أين أجد خريطة الأمطار؟' },
  { icon: '📍',  text: 'ما الطقس في موقعي الآن؟' },
  { icon: '📅',  text: 'ما هي توقعات الأيام الثلاثة القادمة؟' },
];

const WELCOME = `وعليكم السلام ورحمة الله وبركاته 🌤️

أهلاً بك في **جاتكم اسحاب** — وكيلك الجوي لموريتانيا.

أستطيع مساعدتك في:

🌦️ **الطقس** — الحالة الآن، الأمطار، العواصف، الحرارة، الرياح، الرطوبة.
🗺️ **الموقع** — أخبرني بمدينتك أو ولايتك وسأجيبك فوراً.
📍 **موقعك الحالي** — شارك موقعك وسأعرض أقرب بلدية.
🧭 **صفحات الموقع** — اسألني أين تجد أي قسم وسأوجّهك.
📰 **أخبار الطقس** — ملخص يومي وتنبيهات موريتانيا.

أسأل الله أن يجعل غيثه رحمةً وبركة 🇲🇷`;

const RAIN_CODES  = [51,53,55,61,63,65,71,73,75,80,81,82,95,96,99];
const STORM_CODES = [95,96,99];
const DAY_NAMES   = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const CONFIRM_RE  = /^(نعم|أجل|أيوا|آيوا|صح|صحيح|بالظبط|هي|أكيد|نعم هي|yes|يي)(\s|$)/i;
const DENY_RE     = /^(لا|لأ|غير|مش|ماشي|no)(\s|$)/i;
const THANKS_RE   = /شكر|شكراً|مشكور|بارك الله|جزاك|تمام|ممتاز|أحسنت|عاشت|يسلمو|الله يعطيك/;
const FOLLOWUP_RE = /هل هي|وماذا|وكيف|ماذا عن|وهل|متى يبدأ|كم تستمر|وبعد|رياح|عواصف|غزير|خفيف|شديد|مدة|ساعات|موعد|يتوقع|ستمطر|هطول|الغد|الليلة/;
const LOCATION_RE = /عندي|عندنا|هنا|موقعي|موقعنا|منطقتي|منطقتنا|أين أنا|طقس هنا/;
const NEWS_RE     = /أخبار الطقس|حالة الطقس في موريتانيا|أين توجد أمطار|الولايات الممطرة|توقعات الليلة|نشرة جوية|ملخص الطقس|أخبار اليوم|الطقس اليوم/;
const OFFTRACK_RE = /رياضة|كرة القدم|سياسة|اقتصاد|طب|وصفة طبخ|طبخ|فقه|قانون|تاريخ|برمجة|تقنية/;

// روابط صفحات الموقع (HashRouter → #/...)
const SITE_PAGES = [
  { re: /خريطة|رادار|صور القمر|أقمار صناعية|satellite/i,
    label: '🗺️ خريطة الأمطار والرادار', hint: 'افتح قسم **CloudTracker** في الصفحة الرئيسية — يعرض صور الأقمار وخرائط السحب لحظياً.' },
  { re: /توقع|نشرة أسبوع|الأسبوع|أيام قادمة|forecast/i,
    label: '📅 التوقعات الأسبوعية', hint: 'انتقل إلى صفحة **[التوقعات](#/forecast)** أو انقر على "توقعات الأسبوع" في القائمة.' },
  { re: /تنبيه|إنذار|alert/i,
    label: '⚠️ التنبيهات الجوية', hint: 'التنبيهات تظهر في **شريط العواصف** أعلى الصفحة وفي بطاقة **رصد اليوم** في النشرة الجوية.' },
  { re: /مقال|مدوّن|مدون|كتّاب|blogger/i,
    label: '✍️ صفحات المدوّنين', hint: 'انتقل إلى صفحة **[المدوّنين](#/bloggers)** لقراءة مقالاتهم ومتابعة صفحاتهم.' },
  { re: /ظالة|مواشي|حيوانات|livestock/i,
    label: '🐄 قسم الظالة', hint: 'انتقل إلى صفحة **[الظالة](#/althala)** للإبلاغ عن مواشٍ مفقودة أو رؤيتها.' },
  { re: /بحث|أبحث|أين أجد|كيف أبحث/i,
    label: '🔍 البحث في الموقع', hint: 'يمكنك البحث مباشرة هنا — أخبرني باسم البلدية أو الولاية وسأجيبك.' },
  { re: /تواصل|اتصل|contact|واتساب|فيسبوك الصفحة/i,
    label: '📞 التواصل', hint: 'تابعنا على **[فيسبوك](https://www.facebook.com/Beddetiii/)** أو راسلنا عبر واتساب من خلال أزرار الفوتر.' },
  { re: /شارك|مشاركة|واتساب|share/i,
    label: '📤 مشاركة النشرة', hint: 'في بطاقة **WeatherHero** الزرقاء يوجد زر "شارك عبر واتساب" لمشاركة الطقس مباشرة.' },
  { re: /من نحن|عن الموقع|about/i,
    label: 'ℹ️ عن الموقع', hint: '**جاتكم اسحاب** — موقع موريتاني لرصد الطقس والأمطار. البيانات من ECMWF · Open-Meteo · EUMETSAT · Blitzortung.' },
  { re: /تطبيق|app|play store|install|تنزيل/i,
    label: '📱 تطبيق جاتكم اسحاب', hint: 'يمكنك **تثبيت الموقع كتطبيق** مباشرة على هاتفك — انتقل للفوتر وانقر "حمّل تطبيق جاتكم اسحاب".' },
];

// ─── أدوات تحليل ───────────────────────────────────────────

function arabicDay(dateStr) {
  const d = new Date(dateStr);
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return 'اليوم';
  if (diff === 1) return 'غداً';
  if (diff === 2) return 'بعد غد';
  return `يوم ${DAY_NAMES[d.getDay()]}`;
}

function forecastRainDays(cityData) {
  const daily = cityData?.daily;
  if (!daily?.time) return [];
  return daily.time
    .map((t, i) => ({
      label:  arabicDay(t),
      precip: daily.precipitation_sum?.[i] ?? 0,
      code:   daily.weather_code?.[i] ?? 0,
      max:    Math.round(daily.temperature_2m_max?.[i] ?? 0),
      min:    Math.round(daily.temperature_2m_min?.[i] ?? 0),
    }))
    .filter((d) => d.precip > 0.5 || RAIN_CODES.includes(d.code));
}

function rainHoursList(cityData) {
  const precip = cityData?.hourly?.precipitation || [];
  const times  = cityData?.hourly?.time || [];
  return precip.map((p, i) => ({ p, t: times[i] })).filter(({ p }) => p > 0.3);
}

function firstRainTime(cityData) {
  const hrs = rainHoursList(cityData);
  if (!hrs.length) return null;
  const first = new Date(hrs[0].t);
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((new Date(hrs[0].t.split('T')[0]) - today) / 86400000);
  const day = diff === 0 ? 'اليوم' : diff === 1 ? 'غداً' : `يوم ${DAY_NAMES[first.getDay()]}`;
  return `${day} حوالي الساعة ${first.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}`;
}

function windDuringRain(cityData) {
  const precip = cityData?.hourly?.precipitation || [];
  const winds  = cityData?.hourly?.wind_speed_10m || [];
  const rw = winds.filter((_, i) => (precip[i] || 0) > 0.3);
  if (!rw.length) return null;
  return {
    min: Math.round(Math.min(...rw)),
    max: Math.round(Math.max(...rw)),
    avg: Math.round(rw.reduce((a, b) => a + b, 0) / rw.length),
  };
}

function rainDuration(cityData) {
  const hrs = rainHoursList(cityData);
  if (!hrs.length) return 0;
  let count = 1;
  for (let i = 1; i < hrs.length; i++) {
    if ((new Date(hrs[i].t) - new Date(hrs[i-1].t)) / 3600000 <= 2) count++;
    else break;
  }
  return count;
}

function adminLabel(cityData) {
  const city  = cityData.city;
  const w     = cityData.wilaya    || '';
  const m     = cityData.moughataa || '';
  const t     = cityData.cityType  || 'بلدية';
  const isCap = t === 'مقاطعة' || city === m;
  if (isCap)  return w ? `📍 عاصمة مقاطعة ${city}، ولاية ${w}` : '';
  const parts = [m && `مقاطعة ${m}`, w && `ولاية ${w}`].filter(Boolean);
  return parts.length ? `📍 ${t} في ${parts.join('، ')}` : '';
}

function confirmLabel(cityData) {
  const city  = cityData.city;
  const w     = cityData.wilaya    || '';
  const m     = cityData.moughataa || '';
  const t     = cityData.cityType  || 'بلدية';
  const isCap = t === 'مقاطعة' || city === m;
  return isCap
    ? `عاصمة مقاطعة ${city}${w ? `، ولاية ${w}` : ''}`
    : `${t} ${city}${w ? `، ولاية ${w}` : ''}`;
}

function detectIntent(q) {
  if (/رياح|هواء|ريح/.test(q))                    return 'wind';
  if (/عاصفة|رعد|برق|رعدية/.test(q))              return 'storm';
  if (/غزير|خفيف|شديد|كمية|ملم/.test(q))          return 'intensity';
  if (/متى|يبدأ|موعد|توقيت/.test(q))              return 'timing';
  if (/تستمر|مدة|ساعات/.test(q))                  return 'duration';
  if (/ستمطر|أمطار|مطر|هطول|يتوقع/.test(q))       return 'rain';
  if (/حرارة|درجة/.test(q))                       return 'temp';
  return 'general';
}

function findCity(text, allData) {
  if (!allData) return null;
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wm  = (h, n) => new RegExp(`(^|[\\s،,؟?!.])${esc(n)}([\\s،,؟?!.]|$)`).test(h);
  const sorted = [...allData].sort((a, b) => b.city.length - a.city.length);
  return sorted.find((d) => wm(text, d.city)) || sorted.find((d) => text.includes(d.city)) || null;
}

function findWilaya(text, allData) {
  if (!allData) return null;
  // جمع الولايات الفريدة من البيانات
  const wilayas = [...new Set(allData.map((d) => d.wilaya).filter(Boolean))];
  // البحث بالاسم الكامل أولاً ثم الجزئي
  const match = wilayas.find((w) => text.includes(w))
    || wilayas.find((w) => w.split(' ').some((word) => word.length > 3 && text.includes(word)));
  if (!match) return null;
  return { wilaya: match, cities: allData.filter((d) => d.wilaya === match) };
}

function wilayaForecastReply(wilayaName, cities, ctx = {}) {
  const { stormClouds = [], rainForecasts = [] } = ctx;

  // المدن التي لها أمطار متوقعة
  const rainCities = cities.filter((c) => forecastRainDays(c).length > 0);
  // المدن التي لها سحب عاصفية من Meteosat
  const satStorm   = stormClouds.filter((s) => s.wilaya === wilayaName);
  // توقعات يدوية من الفريق لهذه الولاية
  const manualFc   = rainForecasts.filter((f) => f.wilaya === wilayaName || cities.some((c) => c.city === f.city));

  const lines = [];

  // توقعات يدوية أولاً (أكثر دقة)
  if (manualFc.length) {
    lines.push(`📋 **توقعات الفريق لولاية ${wilayaName}:**`);
    manualFc.slice(0, 3).forEach((f) =>
      lines.push(`  • ${f.city || 'الولاية'}: ${f.description || 'أمطار متوقعة'} — ${f.date || ''}`)
    );
  }

  // سحب Meteosat
  if (satStorm.length) {
    lines.push(`🛰️ رصد Meteosat: سحب ${satStorm[0].level || 'عاصفية'} فوق ${satStorm.map((s) => s.city).slice(0, 3).join('، ')}.`);
  }

  // توقعات Open-Meteo لكل بلدية فيها أمطار
  if (rainCities.length) {
    lines.push(`\n🌧️ **توقعات الأمطار — ولاية ${wilayaName}:**`);
    rainCities.slice(0, 6).forEach((c) => {
      const days = forecastRainDays(c);
      const best = days[0];
      lines.push(`  • **${c.city}**: ${STORM_CODES.includes(best.code) ? '⚡' : '🌧️'} ${best.label} — ${best.precip.toFixed(1)} ملم، ${best.max}°/${best.min}°م`);
    });
    const total = rainCities.length;
    if (total > 6) lines.push(`  ... و${total - 6} بلديات أخرى.`);
  } else if (!manualFc.length && !satStorm.length) {
    // لا أمطار — أعرض ملخص الحالة الحالية
    const sample = cities.slice(0, 4);
    lines.push(`☀️ **الحالة الحالية — ولاية ${wilayaName}:**`);
    sample.forEach((c) => {
      const cur  = c.current || {};
      const temp = Math.round(cur.temperature_2m ?? 0);
      const code = cur.weather_code ?? 0;
      lines.push(`  • **${c.city}**: ${getWeatherIcon(code)} ${temp}°م`);
    });
    lines.push(`\n📅 لا أمطار متوقعة في الولاية خلال الأيام القادمة.`);
  }

  return lines.join('\n');
}

// ─── بناء رد البلدية (تستخدم كل مصادر البيانات) ─────────────

function cityWeatherReply(cityData, intent = 'general', ctx = {}) {
  const city      = cityData.city;
  const wilaya    = cityData.wilaya || '';
  const cur       = cityData.current || {};
  const temp      = Math.round(cur.temperature_2m ?? 0);
  const code      = cur.weather_code ?? 0;
  const wind      = Math.round(cur.wind_speed_10m ?? 0);
  const hum       = cur.relative_humidity_2m ?? 0;
  const isStorm   = STORM_CODES.includes(code);
  const rainDays  = forecastRainDays(cityData);
  const adm       = adminLabel(cityData);
  const adml      = adm ? `\n${adm}` : '';

  // ── مصادر إضافية من الـ Context ──
  const { stormClouds = [], rainForecasts = [], lightningStrikes = [], trackedCells = [] } = ctx;

  // هل يوجد سحاب عاصفي حالي من Meteosat فوق البلدية أو ولايتها؟
  const satCloud = stormClouds.find(
    (c) => c.city === city || (wilaya && c.wilaya === wilaya)
  );
  const satInfo = satCloud
    ? `\n🛰️ رصد Meteosat: سحب ${satCloud.level === 'شديد' ? 'كثيفة جداً' : satCloud.level || 'عاصفية'} فوق المنطقة.`
    : '';

  // هل يوجد توقع مطر يدوي من Supabase لهذه البلدية أو ولايتها؟
  const manualFc = rainForecasts.find(
    (f) => (f.city && f.city === city) || (f.wilaya && f.wilaya === wilaya)
  );
  const manualInfo = manualFc
    ? `\n📋 توقع الفريق: ${manualFc.description || 'أمطار متوقعة'} (${manualFc.date || ''}).`
    : '';

  // هل توجد خلية عاصفية متجهة نحو البلدية أو ولايتها؟
  const cell = trackedCells.find(
    (c) => c.destination === city || (wilaya && c.destinationWilaya === wilaya)
  );
  const cellInfo = cell
    ? `\n🌀 خلية عاصفية تتجه نحو المنطقة بسرعة ${cell.speed || '?'} كم/س.`
    : '';

  const extras = `${satInfo}${cellInfo}${manualInfo}`;

  if (intent === 'wind') {
    const w = windDuringRain(cityData);
    if (!w) return `🌬️ لا تشير البيانات إلى رياح ملحوظة مرتبطة بالأمطار في **${city}** حالياً.${satInfo}${adml}`;
    const lvl = w.avg < 20 ? 'خفيفة إلى معتدلة' : w.avg < 40 ? 'معتدلة إلى نشطة' : 'قوية';
    return `🌬️ الأمطار في **${city}** مصحوبة برياح ${lvl}، بين **${w.min}** و**${w.max} كم/س**${isStorm ? '، مع هبات أقوى عند العواصف' : ''}.${extras}${adml}`;
  }

  if (intent === 'storm') {
    if (isStorm || satCloud)
      return `⚡ **${city}** تشهد نشاطاً عاصفياً الآن. رياح ${wind} كم/س، رطوبة ${hum}%.${satInfo}${cellInfo} ابتعد عن الأماكن المكشوفة.${adml}`;
    const sd = rainDays.find((d) => STORM_CODES.includes(d.code));
    if (sd) return `⚡ لا توجد عاصفة الآن في **${city}**، لكن يتوقع تشكّلها **${sd.label}** (${sd.max}°/${sd.min}°م).${manualInfo}${adml}`;
    return `⛅ لا تشير البيانات إلى عواصف رعدية في **${city}** قريباً.${adml}`;
  }

  if (intent === 'intensity') {
    if (!rainDays.length && !manualFc) return `☀️ لا أمطار متوقعة في **${city}** خلال الأيام القادمة.${adml}`;
    if (rainDays.length) {
      const total  = rainDays.reduce((s, d) => s + d.precip, 0).toFixed(1);
      const maxDay = rainDays.reduce((a, b) => b.precip > a.precip ? b : a, rainDays[0]);
      const lvl    = maxDay.precip < 2 ? 'خفيفة' : maxDay.precip < 10 ? 'معتدلة' : 'غزيرة';
      return `🌧️ الأمطار المتوقعة في **${city}** ${lvl} — أعلى كمية **${maxDay.label}**: **${maxDay.precip.toFixed(1)} ملم**. الإجمالي: ${total} ملم.${manualInfo}${adml}`;
    }
    return `🌧️ ${manualFc.description || 'أمطار متوقعة'} في **${city}**.${adml}`;
  }

  if (intent === 'timing') {
    const fr = firstRainTime(cityData);
    if (!fr && !manualFc) return `☀️ لا أمطار متوقعة في **${city}** قريباً.${adml}`;
    const timeStr = fr || (manualFc?.date ? `يوم ${manualFc.date}` : '');
    return `🕐 يتوقع بإذن الله بدء هطول الأمطار على **${city}** **${timeStr}**.${manualInfo}${adml}`;
  }

  if (intent === 'duration') {
    const hrs = rainDuration(cityData);
    if (!hrs) return `☀️ لا أمطار متوقعة في **${city}** خلال الأيام القادمة.${adml}`;
    return `⏱️ يتوقع أن تستمر الأمطار على **${city}** نحو **${hrs} ساعة** متواصلة.${extras}${adml}`;
  }

  // عام / أمطار / حرارة
  const fr = firstRainTime(cityData);
  if (rainDays.length > 0) {
    const parts = rainDays.slice(0, 3)
      .map((d) => `${STORM_CODES.includes(d.code) ? '⚡' : '🌧️'} **${d.label}** — ${d.precip.toFixed(1)} ملم، ${d.max}°/${d.min}°م`)
      .join('\n');
    const start = fr ? `\n🕐 يبدأ الهطول بإذن الله ${fr}.` : '';
    return `🌦️ **${city}** — يتوقع بإذن الله هطول الأمطار:\n${parts}${start}${extras}${adml}`;
  }

  // لا أمطار — حالة حالية
  const satStorm = satCloud ? `\n🛰️ رصد Meteosat: سحب ${satCloud.level || 'عاصفية'} في المنطقة.` : '';
  return `${getWeatherIcon(code)} **${city}** — ${getWeatherDescription(code)} الآن.\n🌡️ ${temp}°م · 💨 ${wind} كم/س · 💧 ${hum}%${satStorm}${manualInfo}${adml}`;
}

// ─── ملخص وطني ───────────────────────────────────────────────

function buildNationalSummary(allData, ctx = {}) {
  const { stormClouds = [], rainForecasts = [] } = ctx;
  const lines = [];

  // عواصف نشطة الآن
  const stormNow = allData.filter((d) => STORM_CODES.includes(d.current?.weather_code));
  const satStorm = stormClouds.filter((c) => c.level);
  const allStorm = [...new Set([...stormNow.map((d) => d.city), ...satStorm.map((c) => c.city)])];
  if (allStorm.length) lines.push(`⚡ عواصف نشطة الآن: **${allStorm.slice(0, 5).join('، ')}**${allStorm.length > 5 ? ` وغيرها` : ''}.`);

  // أمطار الآن
  const rainNow = allData.filter((d) => RAIN_CODES.includes(d.current?.weather_code) && !STORM_CODES.includes(d.current?.weather_code));
  if (rainNow.length) lines.push(`🌧️ أمطار جارية الآن: **${rainNow.slice(0, 5).map((d) => d.city).join('، ')}**${rainNow.length > 5 ? ` (+${rainNow.length - 5})` : ''}.`);

  // توقعات أمطار الأيام القادمة — مجمّعة بالولاية
  const rainSoon = allData.filter((d) => forecastRainDays(d).length > 0);
  if (rainSoon.length) {
    const byWilaya = {};
    rainSoon.forEach((d) => {
      const w = d.wilaya || 'أخرى';
      if (!byWilaya[w]) byWilaya[w] = 0;
      byWilaya[w]++;
    });
    const top = Object.entries(byWilaya).sort((a, b) => b[1] - a[1]).slice(0, 4);
    lines.push(`📅 ولايات متوقع فيها أمطار: **${top.map(([w, n]) => `${w} (${n} بلدية)`).join('، ')}**.`);
  }

  // توقعات يدوية
  if (rainForecasts.length) {
    lines.push(`📋 آخر توقعات الفريق: ${rainForecasts.slice(0, 2).map((f) => `${f.city || f.wilaya || 'موريتانيا'} — ${f.description || 'أمطار'}`).join(' · ')}.`);
  }

  if (!lines.length) lines.push('☀️ لا أمطار أو عواصف بارزة حالياً في موريتانيا وفق نماذج **جاتكم اسحاب والمركز الأوروبي للتنبؤ**.');

  return `🇲🇷 **ملخص الطقس في موريتانيا:**\n${lines.join('\n')}`;
}

// ─── حالة المحادثة (module-level) ───────────────────────────

let lastCity    = null; // آخر بلدية/ولاية تم الرد عنها
let pendingCity = null; // بلدية بانتظار تأكيد المستخدم (كائن كامل)

// ─── منطق الرد الرئيسي ──────────────────────────────────────
// يُرجع { text, cityData } — cityData غير null عند الإجابة عن بلدية محددة

function buildAnswer(q, allData, ctx = {}) {
  const ok = (text, cityData = null) => ({ text, cityData });
  const { stormClouds = [], rainForecasts = [], lightningStrikes = [], trackedCells = [] } = ctx;

  if (!allData || allData.length === 0)
    return ok('جاري تحميل بيانات الطقس... حاول مجدداً بعد لحظة.');

  // 1. تحية
  if (/السلام|أهلا|أهلاً|مرحبا|مرحباً|هلا|هلو|صباح|مساء/.test(q))
    return ok(WELCOME);

  // 2. توجيه لصفحات الموقع — قبل فحص الطقس
  if (!findCity(q, allData) && !findWilaya(q, allData)) {
    const page = SITE_PAGES.find(p => p.re.test(q));
    if (page) return ok(`${page.label}\n\n${page.hint}`);
  }

  // 3. موضوع خارج نطاق الطقس والموقع
  if (OFFTRACK_RE.test(q) && !findCity(q, allData) && !findWilaya(q, allData)) {
    return ok('اختصاصي هو طقس موريتانيا وخدمات موقع **جاتكم اسحاب**. اسألني عن أي بلدية أو ولاية أو قسم في الموقع 🇲🇷');
  }

  // 3. طلب موقع جغرافي — يُعالَج في المكوّن ويُمرَّر كـ _geoRequest
  if (LOCATION_RE.test(q) && !findCity(q, allData))
    return ok('__GEO__');

  // 4. ملخص وطني أو أخبار الطقس
  if (NEWS_RE.test(q) && !findCity(q, allData) && !findWilaya(q, allData)) {
    lastCity = null;
    return ok(buildNationalSummary(allData, ctx));
  }

  // 5. شكر أو رسالة غير متعلقة بالطقس
  if (THANKS_RE.test(q) && !findCity(q, allData)) {
    lastCity    = null;
    pendingCity = null;
    return ok('العفو! 😊 أسأل الله أن يجعله نافعاً. إذا أردت الاستفسار عن طقس أي بلدية فأنا هنا.');
  }

  // 7. تأكيد بلدية معلّقة
  if (pendingCity) {
    if (CONFIRM_RE.test(q)) {
      const cd = pendingCity;
      pendingCity = null;
      lastCity    = cd.city;
      return ok(cityWeatherReply(cd, detectIntent(q), ctx), cd);
    }
    if (DENY_RE.test(q)) {
      pendingCity = null;
      lastCity    = null;
      return ok('عذراً! أعِد كتابة اسم البلدية بشكل أوضح وسأحاول مجدداً.');
    }
    return ok(`هل تقصد **${confirmLabel(pendingCity)}**؟ (أجب بـ نعم أو لا)`);
  }

  // 8. هل يوجد اسم بلدية في الرسالة؟
  const detected = findCity(q, allData);

  // 9. بلدية جديدة → اطلب تأكيداً
  if (detected && detected.city !== lastCity) {
    pendingCity = detected;
    lastCity    = null;
    return ok(`هل تقصد **${confirmLabel(detected)}**؟`);
  }

  // 10. نفس البلدية المحفوظة → أجب مباشرة
  if (detected && detected.city === lastCity) {
    return ok(cityWeatherReply(detected, detectIntent(q), ctx), detected);
  }

  // 11. متابعة واضحة للبلدية أو الولاية السابقة
  if (lastCity && FOLLOWUP_RE.test(q)) {
    const cityData = allData.find((d) => d.city === lastCity);
    if (cityData) return ok(cityWeatherReply(cityData, detectIntent(q), ctx), cityData);
  }

  // 12. بحث بالولاية (لم يُذكر اسم بلدية محددة)
  const wilayaResult = findWilaya(q, allData);
  if (wilayaResult) {
    lastCity = wilayaResult.wilaya; // احفظ الولاية للمتابعة
    const reply = wilayaForecastReply(wilayaResult.wilaya, wilayaResult.cities, ctx);
    return ok(reply);
  }

  // 13. أسئلة عامة (بدون بلدية)
  if (/عاصفة|عواصف|رعد|برق/.test(q)) {
    // دمج Open-Meteo + Meteosat
    const fromAPI = allData.filter((d) => STORM_CODES.includes(d.current?.weather_code)).map((d) => d.city);
    const fromSat = stormClouds.filter((c) => c.level).map((c) => c.city);
    const all     = [...new Set([...fromAPI, ...fromSat])];
    return ok(all.length
      ? `⚡ نشاط عاصفي الآن في: **${all.slice(0, 8).join('، ')}**.`
      : '⛅ لا توجد عواصف رعدية نشطة الآن.');
  }
  if (/أكثر|احتمالاً|أمطار اليوم|أمطار الآن/.test(q)) {
    const fromAPI = allData.filter((d) => RAIN_CODES.includes(d.current?.weather_code)).map((d) => d.city);
    const fromSat = stormClouds.map((c) => c.city);
    const all     = [...new Set([...fromAPI, ...fromSat])];
    return ok(all.length
      ? `🌧️ مناطق مطر/سحب الآن: **${all.slice(0, 8).join('، ')}**.`
      : '☀️ لا أمطار حالية في البلديات المرصودة.');
  }
  if (/أحر|أبرد|حرارة/.test(q)) {
    const s = [...allData].filter((d) => d.current?.temperature_2m)
      .sort((a, b) => b.current.temperature_2m - a.current.temperature_2m);
    return ok(`🌡️ الأعلى حرارة: **${s[0].city}** (${Math.round(s[0].current.temperature_2m)}°م) · الأبرد: **${s.at(-1).city}** (${Math.round(s.at(-1).current.temperature_2m)}°م).`);
  }
  if (/توقع|منشور|إعلان|نشرة/.test(q)) {
    if (rainForecasts.length) {
      const list = rainForecasts.slice(0, 4)
        .map((f) => `📋 **${f.city || f.wilaya || 'موريتانيا'}** — ${f.description || 'أمطار متوقعة'} (${f.date || ''})`)
        .join('\n');
      return ok(`📢 آخر التوقعات المنشورة:\n${list}`);
    }
    // لا توقعات يدوية — ابحث عن مدن ممطرة في كل موريتانيا
    const rainAll = allData.filter((d) => forecastRainDays(d).length > 0);
    if (!rainAll.length) return ok('☀️ لا أمطار متوقعة في موريتانيا خلال الأيام القادمة وفق نماذج Open-Meteo.');
    const list = rainAll.slice(0, 6)
      .map((c) => { const d = forecastRainDays(c)[0]; return `🌧️ **${c.city}** (${c.wilaya || ''}): ${d.label} — ${d.precip.toFixed(1)} ملم`; })
      .join('\n');
    return ok(`📅 مناطق الأمطار المتوقعة (Open-Meteo):\n${list}${rainAll.length > 6 ? `\n... و${rainAll.length - 6} بلدية أخرى.` : ''}`);
  }

  return ok('اذكر اسم **البلدية أو الولاية** للطقس، أو اسألني عن أي قسم في الموقع وسأوجّهك 🇲🇷');
}

// ─── المكوّن ─────────────────────────────────────────────────

export default function FloatingAIAgent({ onCitySelect }) {
  const [open, setOpen]             = useState(false);
  const [input, setInput]           = useState('');
  const [messages, setMessages]     = useState([{ from: 'bot', text: WELCOME }]);
  const [showBubble, setShowBubble] = useState(false);
  const [typing, setTyping]         = useState(false);
  const bottomRef = useRef(null);

  const {
    weatherData: allData,
    stormClouds,
    rainForecasts,
    lightningStrikes,
    trackedCells,
  } = useWeatherContext();

  const ctx = { stormClouds, rainForecasts, lightningStrikes, trackedCells };

  // فتح تلقائي عند أول زيارة في الجلسة
  useEffect(() => {
    const seen = sessionStorage.getItem('jatkoum_agent_seen');
    if (!seen) {
      const t = setTimeout(() => {
        setOpen(true);
        sessionStorage.setItem('jatkoum_agent_seen', '1');
      }, 2000);
      return () => clearTimeout(t);
    } else {
      // في الزيارات التالية — فقط فقاعة ترحيب
      const t = setTimeout(() => setShowBubble(true), 4000);
      return () => clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    if (!showBubble || open) return;
    const t = setTimeout(() => setShowBubble(false), 7000);
    return () => clearTimeout(t);
  }, [showBubble, open]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  // معالجة طلب الموقع الجغرافي
  const handleGeoRequest = () => {
    if (!navigator.geolocation) {
      setMessages((prev) => [...prev, { from: 'bot', text: 'متصفحك لا يدعم تحديد الموقع. اكتب اسم بلديتك مباشرة.' }]);
      return;
    }
    setMessages((prev) => [...prev, { from: 'bot', text: '📍 جاري تحديد موقعك...' }]);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        // أقرب بلدية في قاعدة البيانات
        if (!allData?.length) return;
        const nearest = [...allData]
          .filter((d) => d.latitude != null || d.lat != null)
          .map((d) => {
            const dlat = (d.latitude ?? d.lat) - lat;
            const dlon = (d.longitude ?? d.lon) - lon;
            return { ...d, dist: Math.sqrt(dlat * dlat + dlon * dlon) };
          })
          .sort((a, b) => a.dist - b.dist)[0];
        if (nearest) {
          lastCity = nearest.city;
          const reply = cityWeatherReply(nearest, 'general', ctx);
          setMessages((prev) => [
            ...prev.filter((m) => m.text !== '📍 جاري تحديد موقعك...'),
            { from: 'bot', text: `📍 أقرب بلدية لموقعك: **${nearest.city}**\n\n${reply}` },
          ]);
          if (onCitySelect) onCitySelect(nearest.city);
        }
      },
      () => {
        setMessages((prev) => [
          ...prev.filter((m) => m.text !== '📍 جاري تحديد موقعك...'),
          { from: 'bot', text: 'تعذّر تحديد موقعك. اكتب اسم البلدية وسأجيبك.' },
        ]);
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  };

  const sendMessage = (text) => {
    const q = (text || input).trim();
    if (!q || typing) return;
    setInput('');
    setShowBubble(false);
    setMessages((prev) => [...prev, { from: 'user', text: q }]);
    setTyping(true);
    setTimeout(() => {
      const { text: answer, cityData } = buildAnswer(q, allData, ctx);
      if (answer === '__GEO__') {
        setTyping(false);
        handleGeoRequest();
        return;
      }
      setMessages((prev) => [...prev, { from: 'bot', text: answer }]);
      setTyping(false);
      if (cityData && onCitySelect) onCitySelect(cityData.city);
    }, 700);
  };

  return (
    <div className="fixed bottom-5 right-5 z-[200] flex flex-col items-end gap-2" dir="rtl">
      {/* فقاعة الترحيب */}
      <AnimatePresence>
        {showBubble && !open && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            className="bg-white text-gray-800 rounded-2xl rounded-bl-sm shadow-xl border border-gray-100 px-4 py-3 max-w-[220px] text-sm font-bold leading-relaxed cursor-pointer"
            onClick={() => { setOpen(true); setShowBubble(false); }}
          >
            🌦️ مرحباً! هل تريد معرفة حالة الطقس في موريتانيا الآن؟
          </motion.div>
        )}
      </AnimatePresence>

      {/* نافذة المحادثة */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="w-[340px] bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col"
            style={{ maxHeight: '520px' }}
          >
            {/* رأس */}
            <div className="bg-gradient-to-l from-[#0b2c5e] to-[#103a78] text-white px-5 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full overflow-hidden bg-white/15 flex items-center justify-center text-xl shrink-0">
                  <img src="https://graph.facebook.com/Beddetiii/picture?type=large" alt="جاتكم اسحاب"
                    className="w-full h-full object-cover"
                    onError={(e) => { e.currentTarget.style.display='none'; e.currentTarget.parentElement.textContent='🌦️'; }} />
                </div>
                <div>
                  <p className="font-black text-base leading-none">جاتكم اسحاب</p>
                  <p className="text-[11px] text-blue-200/80 mt-0.5">وكيل الطقس · موريتانيا</p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <SafeIcon icon={FiChevronDown} className="text-lg" />
              </button>
            </div>

            {/* أسئلة سريعة */}
            <div className="px-4 pt-3 pb-1 flex gap-2 overflow-x-auto shrink-0" style={{ scrollbarWidth: 'none' }}>
              {QUESTIONS.map(({ icon, text }) => (
                <button
                  key={text}
                  onClick={() => sendMessage(text)}
                  className="shrink-0 flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-bold px-3 py-1.5 rounded-full border border-blue-100 transition-colors"
                >
                  <span>{icon}</span>
                  <span className="whitespace-nowrap">{text.slice(0, 22)}…</span>
                </button>
              ))}
            </div>

            {/* المحادثة */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ scrollbarWidth: 'thin' }}>
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.from === 'user' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed font-medium whitespace-pre-line
                    ${msg.from === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-sm'
                      : 'bg-gray-100 text-gray-800 rounded-tl-sm'}`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
              {typing && (
                <div className="flex justify-end">
                  <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1 items-center">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* حقل الإدخال */}
            <div className="px-4 pb-4 pt-2 border-t border-gray-100 shrink-0">
              <div className="flex gap-2 items-center bg-gray-50 rounded-full border border-gray-200 pr-4 pl-1.5 py-1.5 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="اسأل عن طقس أي بلدية..."
                  className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 focus:outline-none"
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || typing}
                  className="w-8 h-8 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-full flex items-center justify-center transition-colors shrink-0"
                >
                  <SafeIcon icon={FiSend} className="text-xs" />
                </button>
              </div>
              <p className="text-center text-[10px] text-gray-400 mt-2">يجيب فقط عن طقس موريتانيا 🇲🇷</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* زر الفتح/الإغلاق */}
      <motion.button
        onClick={() => { setOpen(!open); setShowBubble(false); }}
        className="w-14 h-14 rounded-full bg-gradient-to-br from-[#0b2c5e] to-[#1877F2] text-white shadow-2xl flex items-center justify-center text-2xl overflow-hidden"
        aria-label="وكيل الطقس"
        animate={open ? {} : {
          y: [0, -14, 0, -8, 0, -4, 0],
          rotate: [0, -6, 6, -4, 4, 0],
        }}
        transition={{
          duration: 1.2,
          ease: 'easeInOut',
          delay: 1,
          repeat: 3,
          repeatDelay: 4,
        }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
      >
        {open
          ? <SafeIcon icon={FiX} className="text-xl" />
          : <img src="https://graph.facebook.com/Beddetiii/picture?type=large" alt="جاتكم اسحاب"
              className="w-10 h-10 rounded-full object-cover"
              onError={(e) => { e.currentTarget.style.display='none'; e.currentTarget.parentElement.textContent='🌦️'; }} />
        }
      </motion.button>
    </div>
  );
}
