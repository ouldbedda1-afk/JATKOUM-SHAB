import React from 'react';
import Navbar from '../components/Navbar';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50 pb-20" dir="rtl">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 mt-8 bg-white rounded-2xl border border-gray-100 p-6 md:p-10 leading-relaxed text-gray-700">
        <h1 className="text-2xl font-black text-gray-900 mb-2">شروط الخدمة</h1>
        <p className="text-sm text-gray-400 mb-8">آخر تحديث: يوليو 2026</p>

        <section className="space-y-3 mb-8">
          <h2 className="text-lg font-black text-gray-900">استخدام الموقع</h2>
          <p>
            "جاتكم اسحاب" منصة معلوماتية لرصد الطقس والأمطار في موريتانيا تُقدَّم "كما هي". التوقعات
            الجوية مستمدة من مصادر عامة (Open-Meteo، ECMWF، EUMETSAT) وقد تحتمل هامش خطأ؛ لا نتحمّل
            مسؤولية أي قرار يُتَّخذ بناءً عليها وحدها دون التحقق من مصادر رسمية إضافية عند الحاجة.
          </p>
        </section>

        <section className="space-y-3 mb-8">
          <h2 className="text-lg font-black text-gray-900">المحتوى الذي يقدّمه المستخدمون</h2>
          <p>
            بلاغات الأمطار والماشية والتعليقات تخضع للمراجعة قبل النشر العام. نحتفظ بحق حذف أي محتوى
            غير لائق أو مضلّل دون إشعار مسبق.
          </p>
        </section>

        <section className="space-y-3 mb-8">
          <h2 className="text-lg font-black text-gray-900">الردود التلقائية على فيسبوك</h2>
          <p>
            قد تقترح أنظمتنا رداً تلقائياً على تعليقات متعلقة بالطقس على صفحتنا الرسمية، لكن أي رد لا
            يُنشر إلا بعد مراجعة يدوية من فريقنا. هذه الميزة مخصّصة للأغراض الإعلامية ولا تُغني عن
            التواصل المباشر معنا لأي استفسار عاجل.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-black text-gray-900">التواصل</h2>
          <p>
            لأي استفسار حول هذه الشروط: <a href="mailto:bedda2300@yahoo.fr" className="text-blue-600 hover:underline">bedda2300@yahoo.fr</a>
          </p>
        </section>
      </main>
    </div>
  );
}
