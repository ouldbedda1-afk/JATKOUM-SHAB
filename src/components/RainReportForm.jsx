import React, { useState } from 'react';
import { addRainReport, uploadLivestockImage } from '../supabase';
import { getWeatherData } from '../weatherApi';
import { mauritaniaCommuneDistricts } from '../mauritaniaCommunes';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';

const {
  FiCloudRain,
  FiMapPin,
  FiCamera,
  FiCheck,
  FiX,
  FiShield,
  FiNavigation,
  FiUser,
  FiExternalLink,
} = FiIcons;

const MIN_FACEBOOK_FOLLOWERS = 100;

const baseDistricts = [
  { name: 'نواكشوط', lat: 18.0735, lon: -15.9582 },
  { name: 'نواذيبو', lat: 20.9375, lon: -17.0339 },
  { name: 'روصو', lat: 17.5333, lon: -14.3333 },
  { name: 'كيهيدي', lat: 16.15, lon: -13.5 },
  { name: 'ألاك', lat: 17.05, lon: -13.91 },
  { name: 'كيفة', lat: 16.61, lon: -11.4 },
  { name: 'لعيون', lat: 16.66, lon: -9.61 },
  { name: 'النعمة', lat: 16.61, lon: -7.25 },
  { name: 'تجكجة', lat: 18.55, lon: -11.43 },
  { name: 'أطار', lat: 20.51, lon: -13.05 },
  { name: 'أكجوجت', lat: 19.75, lon: -14.41 },
  { name: 'زويرات', lat: 22.71, lon: -12.47 },
  { name: 'سيلبابي', lat: 15.15, lon: -12.18 },
  { name: 'لعبلي', lat: 15.318161600485181, lon: -11.79565738869597 },
  { name: 'بوتلميت', lat: 17.51, lon: -14.76 },
  { name: 'بوكي', lat: 16.58, lon: -14.26 },
  { name: 'الطينطان', lat: 16.39, lon: -10.16 },
  { name: 'مقطع لحجار', lat: 17.5, lon: -13.08 },
  { name: 'كرو', lat: 16.81, lon: -11.83 },
  { name: 'تمبدغة', lat: 16.2421, lon: -8.1721 },
  { name: 'شنقيط', lat: 20.45, lon: -12.35 },
  { name: 'وادان', lat: 20.93, lon: -11.61 },
  { name: 'بير أم اكرين', lat: 25.22, lon: -11.58 },
  { name: 'تيشيت', lat: 18.44, lon: -9.49 },
  { name: 'باسكنو', lat: 15.8621, lon: -5.9543 },
  { name: 'كنكوصة', lat: 15.93, lon: -11.53 },
  { name: 'تناها', lat: 15.121604003909406, lon: -10.899006284648546 },
  { name: 'هامد', lat: 15.633125821113623, lon: -11.516237907118896 },
  { name: 'امبود', lat: 16.027075171459536, lon: -12.582155366037124 },
  { name: 'مونغل', lat: 16.26, lon: -13.23 },
  { name: 'بابابى', lat: 16.48, lon: -13.98 },
  { name: 'امباني', lat: 16.25, lon: -13.78 },
  { name: 'صنكرافه', lat: 17.593, lon: -12.837 },
  { name: 'واد الناقة', lat: 17.91, lon: -15.31 },
  { name: 'اركيز', lat: 16.91, lon: -15.28 },
  { name: 'المذرذرة', lat: 16.91, lon: -15.65 },
  { name: 'كرمسين', lat: 16.48, lon: -16.21 },
  { name: 'ونبو', lat: 15.45, lon: -12.08 },
  { name: 'انبيكت لحواش', lat: 16.845, lon: -5.9423 },
  { name: 'جيكني', lat: 15.7388, lon: -8.6703 },
  { name: 'امرج', lat: 16.1069, lon: -7.2143 },
  { name: 'ولاته', lat: 17.2966, lon: -7.024 },
  { name: 'فصاله', lat: 15.558, lon: -5.5228 },
  { name: 'عدل بكرو', lat: 15.6755, lon: -7.0216 },
  { name: 'افيرني', lat: 15.5634, lon: -8.9105 },
  { name: 'اعوينات ازبل', lat: 16.3848, lon: -8.8877 },
  { name: 'بوسطيله', lat: 15.5777, lon: -8.0819 },
  { name: 'بنيشاب', lat: 21.83, lon: -14.52 },
];

const districts = [
  ...baseDistricts,
  ...mauritaniaCommuneDistricts.filter(
    (commune) =>
      !baseDistricts.some(
        (district) =>
          district.name === commune.name ||
          (Math.abs(district.lat - commune.lat) < 0.0001 && Math.abs(district.lon - commune.lon) < 0.0001)
      )
  ),
];

function getDistanceKm(fromLat, fromLon, toLat, toLon) {
  const earthRadiusKm = 6371;
  const dLat = ((toLat - fromLat) * Math.PI) / 180;
  const dLon = ((toLon - fromLon) * Math.PI) / 180;
  const lat1 = (fromLat * Math.PI) / 180;
  const lat2 = (toLat * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getNearestDistrict(latitude, longitude) {
  return districts
    .map((district) => ({
      ...district,
      distanceKm: getDistanceKm(latitude, longitude, district.lat, district.lon),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)[0];
}

function isFacebookUrl(value) {
  try {
    const url = new URL(value);
    return url.hostname.includes('facebook.com') || url.hostname.includes('fb.com');
  } catch {
    return false;
  }
}

const RainReportForm = ({ onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');

  const [formData, setFormData] = useState({
    city: '',
    rain_intensity: 'متوسط',
    description: '',
    is_verified: false,
    latitude: null,
    longitude: null,
    nearest_district: '',
    distance_from_district_km: null,
    location_accuracy_m: null,
    facebook_name: '',
    facebook_url: '',
    facebook_account_age: 'old',
    facebook_followers: '',
  });

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(file);
      setPreview(URL.createObjectURL(file));
    }
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('المتصفح لا يدعم تحديد الموقع.');
      return;
    }

    setLocating(true);
    setLocationError('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        const nearest = getNearestDistrict(latitude, longitude);

        setFormData((current) => ({
          ...current,
          city: nearest.name,
          latitude,
          longitude,
          nearest_district: nearest.name,
          distance_from_district_km: Number(nearest.distanceKm.toFixed(1)),
          location_accuracy_m: Math.round(position.coords.accuracy || 0),
        }));
        setLocating(false);
      },
      () => {
        setLocationError('يجب السماح بتحديد الموقع حتى يمكن إرسال تبشيرة المطر.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const verifyReport = async () => {
    setVerifying(true);
    try {
      const weather = await getWeatherData(formData.nearest_district || 'نواكشوط', {
        lat: formData.latitude,
        lon: formData.longitude,
        name: 'Rain report location',
        type: 'موقع مباشر',
      });

      const weatherCode = weather.current?.weather_code;
      const rainProbability = weather.hourly?.precipitation_probability?.[0] || 0;
      return weatherCode >= 51 || rainProbability > 30;
    } catch (error) {
      console.error('Verification error:', error);
      return false;
    } finally {
      setVerifying(false);
    }
  };

  const validateFacebookAccount = () => {
    const followers = Number(formData.facebook_followers);

    if (!formData.facebook_name.trim()) {
      return 'يجب كتابة الاسم الظاهر في حساب فيسبوك.';
    }

    if (!isFacebookUrl(formData.facebook_url)) {
      return 'يجب إدخال رابط حساب فيسبوك صحيح.';
    }

    if (formData.facebook_account_age !== 'old') {
      return 'الحسابات الجديدة لا تُنشر لها تبشيرات المطر.';
    }

    if (!Number.isFinite(followers) || followers < MIN_FACEBOOK_FOLLOWERS) {
      return `لا يُنشر البلاغ إذا كان الحساب أقل من ${MIN_FACEBOOK_FOLLOWERS} متابع.`;
    }

    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.latitude || !formData.longitude || !formData.nearest_district) {
      alert('يجب تحديد موقعك أولاً. لا يمكن اختيار المقاطعة يدوياً.');
      return;
    }

    const facebookError = validateFacebookAccount();
    if (facebookError) {
      alert(facebookError);
      return;
    }

    setLoading(true);

    try {
      const isVerified = await verifyReport();

      if (!isVerified) {
        alert('عذراً، لم يتم تأكيد هطول المطر في عين المكان عبر بيانات الرصد. لا يمكن نشر التبشيرة الآن.');
        setLoading(false);
        return;
      }

      let image_url = '';
      if (image) image_url = await uploadLivestockImage(image);

      await addRainReport({
        ...formData,
        facebook_followers: Number(formData.facebook_followers),
        image_url,
        is_verified: true,
        created_at: new Date().toISOString(),
      });

      alert('تم تأكيد المطر والموقع وحساب فيسبوك. نُشرت التبشيرة بنجاح.');
      if (onSuccess) onSuccess();
      if (onClose) onClose();
    } catch (error) {
      alert('حدث خطأ أثناء الإرسال.');
    } finally {
      setLoading(false);
    }
  };

  const hasLocation = Boolean(formData.latitude && formData.longitude);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" dir="rtl">
      <div className="bg-white w-full max-w-xl max-h-[92vh] rounded-[2rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300 flex flex-col">
        <div className="bg-blue-600 p-6 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
              <SafeIcon icon={FiCloudRain} className="text-2xl" />
            </div>
            <div>
              <h2 className="text-xl font-black">تبشيرة مطر</h2>
              <p className="text-xs opacity-80">النشر بعد تحقق الموقع والمطر وحساب فيسبوك</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30 transition-all">
            <SafeIcon icon={FiX} className="text-xl" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
              <SafeIcon icon={FiNavigation} className="text-blue-600" />
              تحديد الموقع إجباري
            </label>
            <button
              type="button"
              onClick={handleGetLocation}
              disabled={locating}
              className="w-full bg-gray-900 text-white py-3 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-gray-800 transition-all disabled:opacity-50"
            >
              <SafeIcon icon={FiMapPin} />
              {locating ? 'جاري تحديد عين المكان...' : 'تحديد موقعي الآن'}
            </button>
            {locationError && <p className="mt-2 text-xs font-bold text-red-600">{locationError}</p>}
          </div>

          {hasLocation && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
              <div className="flex items-center gap-2 text-emerald-800 font-black text-sm mb-2">
                <SafeIcon icon={FiMapPin} />
                شريط عين المكان
              </div>
              <p className="text-xs text-emerald-900 font-bold leading-relaxed">
                أقرب مقاطعة: {formData.nearest_district}، المسافة: {formData.distance_from_district_km} كلم، دقة الموقع: {formData.location_accuracy_m} متر.
              </p>
              <p className="text-[11px] text-emerald-700 mt-1">
                الإحداثيات: {formData.latitude.toFixed(5)}, {formData.longitude.toFixed(5)}
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">قوة المطر</label>
            <div className="flex bg-gray-100 p-1 rounded-xl">
              {['خفيف', 'متوسط', 'قوي'].map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setFormData({ ...formData, rain_intensity: level })}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${formData.rain_intensity === level ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500'}`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-bold text-gray-700 flex items-center gap-2">
              <SafeIcon icon={FiUser} className="text-blue-600" />
              حساب فيسبوك للناشر
            </label>
            <input
              required
              value={formData.facebook_name}
              onChange={(e) => setFormData({ ...formData, facebook_name: e.target.value })}
              placeholder="الاسم الظاهر على فيسبوك"
              className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none font-bold"
            />
            <div className="relative">
              <SafeIcon icon={FiExternalLink} className="absolute right-3 top-3.5 text-gray-400" />
              <input
                required
                type="url"
                value={formData.facebook_url}
                onChange={(e) => setFormData({ ...formData, facebook_url: e.target.value })}
                placeholder="رابط حساب فيسبوك"
                className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 pr-10 focus:ring-2 focus:ring-blue-500 outline-none font-bold ltr:text-left"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <select
                value={formData.facebook_account_age}
                onChange={(e) => setFormData({ ...formData, facebook_account_age: e.target.value })}
                className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none font-bold"
              >
                <option value="old">حساب قديم</option>
                <option value="new">حساب جديد</option>
              </select>
              <input
                required
                type="number"
                min="0"
                value={formData.facebook_followers}
                onChange={(e) => setFormData({ ...formData, facebook_followers: e.target.value })}
                placeholder="عدد المتابعين"
                className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none font-bold"
              />
            </div>
          </div>

          <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 flex gap-3">
            <SafeIcon icon={FiShield} className="text-blue-600 text-xl shrink-0" />
            <p className="text-[11px] text-blue-800 leading-relaxed">
              لا يختار المستخدم المقاطعة. يحدد الموقع عين المكان، ثم تُحسب أقرب مقاطعة والمسافة تلقائياً. لا يتم النشر إلا بعد تحقق المطر ومنع الحسابات الجديدة أو قليلة المتابعين.
            </p>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
              <SafeIcon icon={FiCamera} className="text-blue-600" />
              صورة للمطر (اختياري)
            </label>
            <div
              onClick={() => document.getElementById('rainImage').click()}
              className="relative aspect-video rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-100 transition-all overflow-hidden"
            >
              {preview ? (
                <img src={preview} alt="معاينة صورة المطر" className="w-full h-full object-cover" />
              ) : (
                <>
                  <SafeIcon icon={FiCamera} className="text-2xl text-gray-400 mb-2" />
                  <span className="text-xs text-gray-500">اضغط لرفع صورة</span>
                </>
              )}
              <input id="rainImage" type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || verifying}
            className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-lg shadow-xl shadow-blue-200 hover:bg-blue-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading || verifying ? (
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
                <span className="text-sm">جاري التحقق من المطر والموقع...</span>
              </div>
            ) : (
              <>
                <SafeIcon icon={FiCheck} />
                إرسال التبشيرة
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default RainReportForm;
