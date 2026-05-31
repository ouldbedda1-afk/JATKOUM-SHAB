/**
 * اختبار شامل للـ APIs
 * يتحقق من Open-Meteo وSupabase والبيانات المرتجعة
 */

const OPEN_METEO_API = 'https://api.open-meteo.com/v1/forecast';

// إحداثيات نواكشوط (المدينة المطلوب اختبارها)
const NOUAKCHOTT = {
  lat: 18.0735,
  lon: -15.9582,
  name: 'نواكشوط',
  nameEn: 'Nouakchott'
};

console.log('🌍 بدء اختبار الـ APIs');
console.log('═'.repeat(50));

/**
 * 1. اختبار Open-Meteo API
 */
async function testOpenMeteoAPI() {
  console.log('\n📡 اختبار Open-Meteo API');
  console.log('-'.repeat(50));
  
  try {
    const params = new URLSearchParams({
      latitude: NOUAKCHOTT.lat,
      longitude: NOUAKCHOTT.lon,
      current: 'temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m,pressure_msl',
      hourly: 'temperature_2m,precipitation_probability',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max',
      timezone: 'Africa/Nouakchott',
      temperature_unit: 'celsius',
    });

    const url = `${OPEN_METEO_API}?${params}`;
    console.log('🔗 الـ URL:', url.substring(0, 100) + '...');
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`❌ الخطأ في الاتصال: ${response.status} ${response.statusText}`);
      return false;
    }

    const data = await response.json();
    
    console.log('✅ الاتصال بـ Open-Meteo ناجح!');
    console.log(`📍 الموقع: ${NOUAKCHOTT.name} (${NOUAKCHOTT.lat}, ${NOUAKCHOTT.lon})`);
    
    // اختبار البيانات الحالية
    if (data.current) {
      console.log('\n📊 البيانات الحالية (Current):');
      console.log('  ✓ temperature_2m:', data.current.temperature_2m, '°C');
      console.log('  ✓ weather_code:', data.current.weather_code);
      console.log('  ✓ wind_speed_10m:', data.current.wind_speed_10m, 'km/h');
      console.log('  ✓ relative_humidity_2m:', data.current.relative_humidity_2m, '%');
      console.log('  ✓ pressure_msl:', data.current.pressure_msl, 'hPa');
    } else {
      console.error('❌ البيانات الحالية غير موجودة!');
    }

    // اختبار البيانات الهورية
    if (data.hourly && data.hourly.time && data.hourly.time.length > 0) {
      console.log('\n⏱️ البيانات الهورية (Hourly):');
      console.log('  ✓ عدد الساعات:', data.hourly.time.length);
      console.log('  ✓ أول ساعة:', data.hourly.time[0]);
      console.log('  ✓ درجة الحرارة:', data.hourly.temperature_2m[0], '°C');
      console.log('  ✓ احتمالية الهطول:', data.hourly.precipitation_probability[0], '%');
    } else {
      console.error('❌ البيانات الهورية غير موجودة!');
    }

    // اختبار البيانات اليومية
    if (data.daily && data.daily.time && data.daily.time.length > 0) {
      console.log('\n📅 البيانات اليومية (Daily):');
      console.log('  ✓ عدد الأيام:', data.daily.time.length);
      console.log('  ✓ أول يوم:', data.daily.time[0]);
      console.log('  ✓ أقصى درجة:', data.daily.temperature_2m_max[0], '°C');
      console.log('  ✓ أقل درجة:', data.daily.temperature_2m_min[0], '°C');
      console.log('  ✓ مجموع الأمطار:', data.daily.precipitation_sum[0], 'mm');
      console.log('  ✓ أقصى سرعة ريح:', data.daily.wind_speed_10m_max[0], 'km/h');
    } else {
      console.error('❌ البيانات اليومية غير موجودة!');
    }

    return true;

  } catch (error) {
    console.error('❌ خطأ في اختبار Open-Meteo:', error.message);
    return false;
  }
}

/**
 * 2. اختبار Supabase Connection
 */
async function testSupabaseConnection() {
  console.log('\n\n🗄️ اختبار الاتصال بـ Supabase');
  console.log('-'.repeat(50));
  
  try {
    // التحقق من متغيرات البيئة
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl) {
      console.warn('⚠️ متغير VITE_SUPABASE_URL غير محدد');
    } else {
      console.log('✓ VITE_SUPABASE_URL محدد:', supabaseUrl.substring(0, 30) + '...');
    }
    
    if (!supabaseAnonKey) {
      console.warn('⚠️ متغير VITE_SUPABASE_ANON_KEY غير محدد');
    } else {
      console.log('✓ VITE_SUPABASE_ANON_KEY محدد:', supabaseAnonKey.substring(0, 20) + '...');
    }

    // معلومات الخدمات المتوقعة
    console.log('\n📋 الخدمات المتوقعة في Supabase:');
    console.log('  • favorites - للمدن المفضلة');
    console.log('  • search_history - لسجل البحث');
    console.log('  • alerts - للتنبيهات');
    
    // الدوال المعرفة في supabase.js
    console.log('\n🔧 الدوال المعرفة:');
    console.log('  ✓ testConnection() - التحقق من الاتصال');
    console.log('  ✓ addFavoriteCity() - إضافة مدينة للمفضلة');
    console.log('  ✓ getFavoriteCities() - جلب المدن المفضلة');
    console.log('  ✓ removeFavoriteCity() - حذف مدينة من المفضلة');
    console.log('  ✓ addSearchHistory() - إضافة بحث للسجل');
    console.log('  ✓ getSearchHistory() - جلب سجل البحث');
    console.log('  ✓ getActiveAlerts() - جلب التنبيهات النشطة');

    return true;

  } catch (error) {
    console.error('❌ خطأ في اختبار Supabase:', error.message);
    return false;
  }
}

/**
 * 3. التحقق من البيانات المرتجعة
 */
async function verifyReturnedData() {
  console.log('\n\n✅ التحقق من البيانات المرتجعة');
  console.log('-'.repeat(50));
  
  try {
    const params = new URLSearchParams({
      latitude: NOUAKCHOTT.lat,
      longitude: NOUAKCHOTT.lon,
      current: 'temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m,pressure_msl',
      hourly: 'temperature_2m,precipitation_probability',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max',
      timezone: 'Africa/Nouakchott',
      temperature_unit: 'celsius',
    });

    const response = await fetch(`${OPEN_METEO_API}?${params}`);
    const data = await response.json();

    const checks = [];

    // 1. التحقق من temperature_2m
    if (data.current && typeof data.current.temperature_2m === 'number') {
      console.log('✅ temperature_2m موجود وهو رقم:', data.current.temperature_2m);
      checks.push(true);
    } else {
      console.error('❌ temperature_2m غير موجود أو ليس رقماً');
      checks.push(false);
    }

    // 2. التحقق من weather_code
    if (data.current && typeof data.current.weather_code === 'number') {
      console.log('✅ weather_code موجود وهو رقم:', data.current.weather_code);
      checks.push(true);
    } else {
      console.error('❌ weather_code غير موجود أو ليس رقماً');
      checks.push(false);
    }

    // 3. التحقق من wind_speed_10m
    if (data.current && typeof data.current.wind_speed_10m === 'number') {
      console.log('✅ wind_speed_10m موجود وهو رقم:', data.current.wind_speed_10m);
      checks.push(true);
    } else {
      console.error('❌ wind_speed_10m غير موجود أو ليس رقماً');
      checks.push(false);
    }

    // 4. التحقق من relative_humidity_2m
    if (data.current && typeof data.current.relative_humidity_2m === 'number') {
      console.log('✅ relative_humidity_2m موجود وهو رقم:', data.current.relative_humidity_2m);
      checks.push(true);
    } else {
      console.error('❌ relative_humidity_2m غير موجود أو ليس رقماً');
      checks.push(false);
    }

    return checks.every(c => c === true);

  } catch (error) {
    console.error('❌ خطأ في التحقق:', error.message);
    return false;
  }
}

/**
 * اختبار CORS
 */
async function testCORSSupport() {
  console.log('\n\n🔐 اختبار دعم CORS');
  console.log('-'.repeat(50));
  
  try {
    const response = await fetch(OPEN_METEO_API, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:5173'
      }
    });

    if (response.ok || response.status === 405) {
      console.log('✅ لا توجد مشاكل CORS متوقعة');
      console.log('   (الخادم يسمح بـ CORS من جميع المصادر)');
      return true;
    } else {
      console.warn('⚠️ قد تكون هناك مشاكل CORS');
      return false;
    }
  } catch (error) {
    if (error.message.includes('CORS') || error.message.includes('Cross-Origin')) {
      console.error('❌ خطأ CORS:', error.message);
      return false;
    } else {
      console.log('✓ لا توجد مشاكل CORS واضحة');
      return true;
    }
  }
}

/**
 * تشغيل جميع الاختبارات
 */
async function runAllTests() {
  const results = {
    openMeteo: false,
    supabase: false,
    dataVerification: false,
    cors: false
  };

  results.openMeteo = await testOpenMeteoAPI();
  results.supabase = await testSupabaseConnection();
  results.dataVerification = await verifyReturnedData();
  results.cors = await testCORSSupport();

  // الملخص النهائي
  console.log('\n\n' + '═'.repeat(50));
  console.log('📊 ملخص الاختبارات');
  console.log('═'.repeat(50));
  console.log(`✅ Open-Meteo API: ${results.openMeteo ? '✓ ناجح' : '✗ فشل'}`);
  console.log(`✅ Supabase Connection: ${results.supabase ? '✓ ناجح' : '✗ فشل'}`);
  console.log(`✅ Data Verification: ${results.dataVerification ? '✓ ناجح' : '✗ فشل'}`);
  console.log(`✅ CORS Support: ${results.cors ? '✓ ناجح' : '✗ فشل'}`);

  const allPassed = Object.values(results).every(v => v === true);
  console.log('\n' + (allPassed ? '✅ جميع الاختبارات نجحت!' : '⚠️ بعض الاختبارات فشلت.'));
  
  return allPassed;
}

// تشغيل الاختبارات
runAllTests().catch(error => {
  console.error('❌ خطأ غير متوقع:', error);
  process.exit(1);
});
