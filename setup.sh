#!/bin/bash
# 🚀 Quick Start Script

echo "📦 موريتانيا ميتيو - Mauritania Meteo"
echo "=================================="
echo ""

# 1. التحقق من npm
echo "✓ التحقق من npm..."
if ! command -v npm &> /dev/null; then
    echo "❌ npm غير مثبت. يرجى تثبيت Node.js"
    exit 1
fi
echo "✅ npm موجود"
echo ""

# 2. تثبيت الحزم
echo "📥 تثبيت الحزم..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ فشل تثبيت الحزم"
    exit 1
fi
echo "✅ تم تثبيت الحزم"
echo ""

# 3. إعداد البيئة
echo "⚙️ إعداد البيئة..."
if [ ! -f .env.local ]; then
    echo "الرجاء نسخ .env.example إلى .env.local"
    cp .env.example .env.local
    echo "✅ تم إنشاء .env.local"
fi
echo ""

# 4. التحقق من الـ linting
echo "🔍 فحص الكود..."
npm run lint:error
if [ $? -ne 0 ]; then
    echo "⚠️ توجد أخطاء في الكود"
fi
echo ""

# 5. اختيار الوضع
echo "🎯 اختر وضع التشغيل:"
echo "1) وضع التطوير (npm run dev)"
echo "2) تشغيل الاختبارات (npm test)"
echo "3) بناء الإنتاج (npm run build)"
echo "4) معاينة الإنتاج (npm run preview)"
echo ""

read -p "اختيارك (1-4): " choice

case $choice in
    1)
        echo "🚀 بدء وضع التطوير..."
        npm run dev
        ;;
    2)
        echo "🧪 تشغيل الاختبارات..."
        npm test
        ;;
    3)
        echo "🏗️ بناء الإنتاج..."
        npm run build
        ;;
    4)
        echo "👁️ معاينة الإنتاج..."
        npm run preview
        ;;
    *)
        echo "❌ اختيار غير صحيح"
        exit 1
        ;;
esac

echo ""
echo "✅ تم!"
