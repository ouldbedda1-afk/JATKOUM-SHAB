import React from 'react';
import { motion } from 'framer-motion';

const NewsTicker = () => {
  const news = [
    "عاجل: رصد حريق غطاء نباتي عبر الأقمار الصناعية يقع على بعد حوالي 25 كلم جنوب مقاطعة تمبدغة، المساحة المتأثرة تقدر بـ 3 هكتارات، يرجى الحذر.",
    "متابعة: السحب الممطرة في مالي لا تزال بعيدة جنوب الحوض الشرقي، ولا يتوقع أن تساهم في إخماد حريق تمبدغة في الساعات القادمة.",
    "تنبيه: استمرار موجة الحر على ولايات الشمال وآدرار مع درجات حرارة تلامس 45 درجة.",
    "جديد: تم تفعيل قسم 'الظالة' لمساعدة المنمين في العثور على مواشيهم المفقودة.",
    "جاتكم اسحاب: نراقب معكم حركة السحب والحرائق لحظة بلحظة عبر صور الأقمار الصناعية."
  ];

  return (
    <div className="bg-yellow-400 py-2 overflow-hidden border-y border-yellow-500 shadow-sm relative z-40">
      <div className="flex items-center">
        <div className="bg-red-600 text-white px-3 py-1 text-xs font-black rounded-l-lg mr-2 z-10 whitespace-nowrap shadow-md">
          أخبار عاجلة
        </div>
        <motion.div 
          animate={{ x: [1000, -2000] }}
          transition={{ 
            duration: 30, 
            repeat: Infinity, 
            ease: "linear" 
          }}
          className="flex gap-12 whitespace-nowrap"
        >
          {news.map((item, index) => (
            <span key={index} className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <span className="w-2 h-2 bg-red-600 rounded-full"></span>
              {item}
            </span>
          ))}
        </motion.div>
      </div>
    </div>
  );
};

export default NewsTicker;
