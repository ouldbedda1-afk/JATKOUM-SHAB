import React, { useState, useRef } from 'react';
import { addLivestockReport, uploadLivestockImage, uploadLivestockAudio } from '../supabase';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';

const { FiCamera, FiMapPin, FiPhone, FiTag, FiFileText, FiX, FiCheck, FiMic, FiSquare, FiPlay } = FiIcons;

const LivestockReportForm = ({ onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const mediaRecorderRef = useRef(null);

  const [formData, setFormData] = useState({
    report_type: 'lost', // lost or found
    animal_type: 'ناقة',
    region: '',
    village: '',
    description: '',
    contact_phone: '',
  });

  const regions = ['نواكشوط', 'اترارزة', 'لبراكنة', 'لعصابه', 'الحوض الشرقي', 'الحوض الغربي', 'تكانت', 'آدرار', 'داخلت نواذيبو', 'تيرس زمور', 'إنشيري', 'كيدي ماغا', 'غورغول'];

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        alert('يسمح فقط برفع صور الحيوانات في هذا القسم.');
        e.target.value = '';
        return;
      }
      setImage(file);
      setPreview(URL.createObjectURL(file));
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      const chunks = [];

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Recording error:', err);
      alert('لا يمكن الوصول للميكروفون');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const animalTypes = ['ناقة', 'جمل', 'بقرة', 'ثور', 'خروف', 'نعجة', 'تيس', 'ماعز', 'حمار'];
  const optionalContactAndPlaceAnimals = new Set(['ناقة', 'جمل', 'بقرة', 'ثور', 'خروف', 'نعجة', 'تيس', 'ماعز']);
  const isContactAndPlaceOptional = optionalContactAndPlaceAnimals.has(formData.animal_type);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      let image_url = '';
      let voice_url = '';

      if (image) image_url = await uploadLivestockImage(image);
      if (audioBlob) voice_url = await uploadLivestockAudio(audioBlob);

      await addLivestockReport({
        ...formData,
        image_url,
        voice_url,
        status: 'active'
      });

      alert('تم نشر البلاغ بنجاح');
      if (onSuccess) onSuccess();
      if (onClose) onClose();
    } catch (error) {
      console.error('Submission error:', error);
      alert('حدث خطأ أثناء النشر. يرجى التأكد من إعدادات قاعدة البيانات.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" dir="rtl">
      <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
        {/* Header */}
        <div className="bg-amber-600 p-6 text-white flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black">نشر بلاغ جديد</h2>
            <p className="text-sm opacity-80">أدخل تفاصيل الماشية للمساعدة في ردها</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30 transition-all">
            <SafeIcon icon={FiX} className="text-xl" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 overflow-y-auto max-h-[80vh]">
          {/* Report Type Toggle */}
          <div className="flex bg-gray-100 p-1.5 rounded-2xl mb-8">
            <button 
              type="button"
              onClick={() => setFormData({...formData, report_type: 'lost'})}
              className={`flex-1 py-3 rounded-xl font-bold transition-all ${formData.report_type === 'lost' ? 'bg-red-600 text-white shadow-lg' : 'text-gray-500'}`}
            >
              فقدتُ حيواناً
            </button>
            <button 
              type="button"
              onClick={() => setFormData({...formData, report_type: 'found'})}
              className={`flex-1 py-3 rounded-xl font-bold transition-all ${formData.report_type === 'found' ? 'bg-green-600 text-white shadow-lg' : 'text-gray-500'}`}
            >
              وجدتُ حيواناً ضالاً
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Image Upload */}
            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-gray-700 mb-2">صورة الحيوان</label>
              <div 
                onClick={() => document.getElementById('imageInput').click()}
                className="relative aspect-video rounded-3xl border-2 border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-100 transition-all overflow-hidden"
              >
                {preview ? (
                  <img src={preview} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <>
                    <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mb-2">
                      <SafeIcon icon={FiCamera} className="text-2xl" />
                    </div>
                    <span className="text-sm text-gray-500">اضغط لالتقاط أو رفع صورة</span>
                  </>
                )}
                <input id="imageInput" type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
              </div>
              <p className="mt-2 text-xs text-gray-500">يسمح فقط برفع صور بصيغ الصور المعتادة مثل `jpg` و`png` و`webp`.</p>
            </div>

            {/* Animal Type */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                <SafeIcon icon={FiTag} className="text-amber-600" />
                النوع
              </label>
              <select 
                value={formData.animal_type}
                onChange={(e) => setFormData({...formData, animal_type: e.target.value})}
                className="w-full bg-gray-50 border-gray-100 rounded-xl p-3 focus:ring-2 focus:ring-amber-500 outline-none"
              >
                {animalTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {/* Contact Phone */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                <SafeIcon icon={FiPhone} className="text-amber-600" />
                رقم التواصل
                <span className="text-[11px] font-bold text-red-500">(إلزامي)</span>
              </label>
              <input
                type="tel"
                required
                placeholder="00000000"
                value={formData.contact_phone}
                onChange={(e) => setFormData({...formData, contact_phone: e.target.value})}
                className="w-full bg-gray-50 border-gray-100 rounded-xl p-3 focus:ring-2 focus:ring-amber-500 outline-none"
              />
            </div>

            {/* Region */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                <SafeIcon icon={FiMapPin} className="text-amber-600" />
                الولاية
                {isContactAndPlaceOptional && <span className="text-[11px] font-medium text-gray-400">(اختياري)</span>}
              </label>
              <select 
                required={!isContactAndPlaceOptional}
                value={formData.region}
                onChange={(e) => setFormData({...formData, region: e.target.value})}
                className="w-full bg-gray-50 border-gray-100 rounded-xl p-3 focus:ring-2 focus:ring-amber-500 outline-none"
              >
                <option value="">اختر الولاية</option>
                {regions.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            {/* Village/Place */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                <SafeIcon icon={FiMapPin} className="text-amber-600" />
                المنطقة / القرية
                {isContactAndPlaceOptional && <span className="text-[11px] font-medium text-gray-400">(اختياري)</span>}
              </label>
              <input 
                type="text"
                required={!isContactAndPlaceOptional}
                placeholder="اسم المكان بالتحديد"
                value={formData.village}
                onChange={(e) => setFormData({...formData, village: e.target.value})}
                className="w-full bg-gray-50 border-gray-100 rounded-xl p-3 focus:ring-2 focus:ring-amber-500 outline-none"
              />
            </div>

            {/* Description */}
            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                <SafeIcon icon={FiFileText} className="text-amber-600" />
                وصف الحيوان (كتابي أو صوتي)
              </label>
              <textarea 
                rows="2"
                placeholder="مثلاً: ناقة حمراء عليها وسم (X) في الرقبة..."
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                className="w-full bg-gray-50 border-gray-100 rounded-xl p-3 focus:ring-2 focus:ring-amber-500 outline-none mb-4"
              ></textarea>

              {/* Voice Recording Section */}
              <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-900">سجل وصفاً صوتياً (اختياري)</span>
                  {audioUrl && <span className="text-[10px] text-green-600 font-bold">تم التسجيل ✅</span>}
                </div>
                
                <div className="flex items-center gap-3 mt-3">
                  {!isRecording ? (
                    <button 
                      type="button"
                      onClick={startRecording}
                      className="w-12 h-12 bg-amber-600 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-amber-700 transition-all"
                    >
                      <SafeIcon icon={FiMic} className="text-xl" />
                    </button>
                  ) : (
                    <button 
                      type="button"
                      onClick={stopRecording}
                      className="w-12 h-12 bg-red-600 text-white rounded-full flex items-center justify-center animate-pulse shadow-lg"
                    >
                      <SafeIcon icon={FiSquare} className="text-xl" />
                    </button>
                  )}

                  {audioUrl && !isRecording && (
                    <div className="flex-1">
                      <audio src={audioUrl} controls className="w-full h-8" />
                    </div>
                  )}
                  
                  {isRecording && (
                    <div className="flex-1 flex items-center gap-2">
                      <div className="flex-1 h-1 bg-amber-200 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-600 animate-progress"></div>
                      </div>
                      <span className="text-[10px] text-amber-600 font-mono">جاري التسجيل...</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full mt-8 bg-amber-600 text-white py-4 rounded-2xl font-black text-lg shadow-xl shadow-amber-200 hover:bg-amber-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <>
                <SafeIcon icon={FiCheck} />
                نشر البلاغ الآن
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LivestockReportForm;
