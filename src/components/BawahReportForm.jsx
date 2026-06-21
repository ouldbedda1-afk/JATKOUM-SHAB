import React, { useState } from 'react';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import { addBawahReport, uploadLivestockImage } from '../supabase';

const { FiCamera, FiCheck, FiMapPin, FiNavigation, FiX } = FiIcons;

const regionCenters = [
  { name: 'الحوض الشرقي', lat: 16.35, lon: -7.2 },
  { name: 'لعصابه', lat: 16.45, lon: -11.25 },
  { name: 'اترارزة', lat: 17.1, lon: -15.05 },
  { name: 'كوركول', lat: 16.2, lon: -13.1 },
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

function getNearestRegion(latitude, longitude) {
  return regionCenters
    .map((region) => ({
      ...region,
      distanceKm: getDistanceKm(latitude, longitude, region.lat, region.lon),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)[0];
}

const BawahReportForm = ({ onClose, onSuccess }) => {
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState('');
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [formData, setFormData] = useState({
    reporter_name: '',
    notes: '',
    region: '',
    latitude: null,
    longitude: null,
    distance_from_region_km: null,
    location_accuracy_m: null,
  });

  const handleImageChange = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setImage(file);
    setPreview(URL.createObjectURL(file));
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
        const nearest = getNearestRegion(latitude, longitude);

        setFormData((current) => ({
          ...current,
          region: nearest.name,
          latitude,
          longitude,
          distance_from_region_km: Number(nearest.distanceKm.toFixed(1)),
          location_accuracy_m: Math.round(position.coords.accuracy || 0),
        }));
        setLocating(false);
      },
      () => {
        setLocationError('يجب السماح بتحديد الموقع حتى نقبل بلاغ البواه.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formData.latitude || !formData.longitude || !formData.region) {
      alert('حدد الموقع أولاً حتى نعرف مكان البواه.');
      return;
    }

    if (!image) {
      alert('الصورة ضرورية لتأكيد حالة الغطاء النباتي.');
      return;
    }

    setLoading(true);
    try {
      const image_url = await uploadLivestockImage(image);
      await addBawahReport({
        ...formData,
        image_url,
        is_verified: false,
        created_at: new Date().toISOString(),
      });

      alert('تم إرسال بلاغ البواه. سيظهر بعد المراجعة والتحقق.');
      if (onSuccess) onSuccess();
      if (onClose) onClose();
    } catch (error) {
      alert('تعذر إرسال البلاغ الآن.');
    } finally {
      setLoading(false);
    }
  };

  const hasLocation = Boolean(formData.latitude && formData.longitude);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" dir="rtl">
      <div className="bg-white w-full max-w-lg max-h-[92vh] rounded-[2rem] shadow-2xl overflow-hidden flex flex-col">
        <div className="bg-emerald-600 p-5 text-white flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black">بلاغ بواه جيدة</h2>
            <p className="text-xs opacity-80">الموقع والصورة إجباريان قبل النشر</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
            <SafeIcon icon={FiX} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          <input
            value={formData.reporter_name}
            onChange={(event) => setFormData({ ...formData, reporter_name: event.target.value })}
            placeholder="اسم المبلّغ"
            className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
          />

          <button
            type="button"
            onClick={handleGetLocation}
            disabled={locating}
            className="w-full bg-gray-900 text-white py-3 rounded-2xl font-black flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <SafeIcon icon={FiNavigation} />
            {locating ? 'جاري تحديد المكان...' : 'تحديد مكان البواه'}
          </button>

          {locationError && <p className="text-xs text-red-600 font-bold">{locationError}</p>}

          {hasLocation && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3 text-xs text-emerald-900 font-bold">
              <div className="flex items-center gap-1 mb-1">
                <SafeIcon icon={FiMapPin} />
                أقرب منطقة: {formData.region}
              </div>
              <p>المسافة: {formData.distance_from_region_km} كلم، دقة الموقع: {formData.location_accuracy_m} متر</p>
            </div>
          )}

          <textarea
            value={formData.notes}
            onChange={(event) => setFormData({ ...formData, notes: event.target.value })}
            placeholder="ملاحظة قصيرة عن البواه أو الماء القريب"
            rows="3"
            className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
          />

          <div
            onClick={() => document.getElementById('bawahImage').click()}
            className="relative aspect-video rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center cursor-pointer overflow-hidden"
          >
            {preview ? (
              <img src={preview} alt="معاينة البواه" className="w-full h-full object-cover" />
            ) : (
              <>
                <SafeIcon icon={FiCamera} className="text-2xl text-gray-400 mb-2" />
                <span className="text-xs text-gray-500">صورة الغطاء النباتي مطلوبة</span>
              </>
            )}
            <input id="bawahImage" type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <SafeIcon icon={FiCheck} />
            {loading ? 'جاري الإرسال...' : 'إرسال البلاغ'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default BawahReportForm;
