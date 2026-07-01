import React from 'react';
import Navbar from '../components/Navbar';

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50 pb-20" dir="rtl">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 mt-8 bg-white rounded-2xl border border-gray-100 p-6 md:p-10 leading-relaxed text-gray-700">
        <h1 className="text-2xl font-black text-gray-900 mb-2">سياسة الخصوصية</h1>
        <p className="text-sm text-gray-400 mb-8">آخر تحديث: يوليو 2026</p>

        <section className="space-y-3 mb-8">
          <h2 className="text-lg font-black text-gray-900">من نحن</h2>
          <p>
            "جاتكم اسحاب" منصة مستقلة لرصد ومتابعة الطقس والأمطار في موريتانيا، متاحة عبر الموقع
            الإلكتروني وصفحتنا الرسمية على فيسبوك.
          </p>
        </section>

        <section className="space-y-3 mb-8">
          <h2 className="text-lg font-black text-gray-900">البيانات التي نجمعها</h2>
          <ul className="list-disc list-inside space-y-2">
            <li>
              <strong>الموقع الجغرافي:</strong> نطلب إذنك لعرض طقس منطقتك مباشرة على الموقع. لا يُستخدم
              إلا لهذا الغرض، ولا يُخزَّن على خوادمنا.
            </li>
            <li>
              <strong>بلاغات المستخدمين:</strong> عند إرسال تبشيرة مطر أو بلاغ ماشية، قد نجمع رقم هاتف
              أو اسماً تختار مشاركته طوعاً لعرضه مع البلاغ.
            </li>
            <li>
              <strong>تعليقات صفحة فيسبوك:</strong> نستخدم واجهات فيسبوك الرسمية لقراءة التعليقات على
              منشورات صفحتنا واقتراح ردود تلقائية متعلقة بالطقس؛ <strong>لا يُنشر أي رد إلا بعد مراجعة
              وموافقة يدوية من فريقنا</strong>. لا نصل إلى رسائلك الخاصة أو بياناتك الشخصية خارج نطاق
              التعليق العام نفسه.
            </li>
          </ul>
        </section>

        <section className="space-y-3 mb-8">
          <h2 className="text-lg font-black text-gray-900">كيف نستخدم البيانات</h2>
          <p>
            تُستخدم البيانات فقط لتقديم خدمات الموقع (عرض الطقس، نشر البلاغات الميدانية، الرد على
            التعليقات المتعلقة بالطقس). لا نبيع أو نشارك بياناتك مع أي طرف ثالث لأغراض تسويقية.
          </p>
        </section>

        <section className="space-y-3 mb-8">
          <h2 className="text-lg font-black text-gray-900">حذف البيانات</h2>
          <p>
            لطلب حذف أي بيانات شاركتها معنا (بلاغ، رقم هاتف، إلخ)، راسلنا على البريد الإلكتروني أدناه
            وسنقوم بحذفها خلال مدة معقولة.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-black text-gray-900">تواصل معنا</h2>
          <p>
            لأي استفسار حول هذه السياسة: <a href="mailto:bedda2300@yahoo.fr" className="text-blue-600 hover:underline">bedda2300@yahoo.fr</a>
          </p>
        </section>
      </main>
    </div>
  );
}
