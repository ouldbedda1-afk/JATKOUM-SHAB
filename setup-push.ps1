# ════════════════════════════════════════════════════════════
#  إعداد الإشعارات الفورية (Web Push) — سكربت أتمتة
#  التشغيل:  powershell -ExecutionPolicy Bypass -File .\setup-push.ps1
#  لا يحفظ أي أسرار في ملفات — يطلبها منك وقت التشغيل فقط.
# ════════════════════════════════════════════════════════════

$ErrorActionPreference = 'Stop'
$VapidPublic = 'BEJC_kRL4TGiVvK7EUSoyFyHkS4dWwGpxNON6IheZiVbgncsPNupS4LKYo1K61VEGX20_UunSQo32hGbqQvh0Rg'

function Step($n, $msg) { Write-Host "`n[$n] $msg" -ForegroundColor Cyan }
function Ok($msg)       { Write-Host "    ✓ $msg" -ForegroundColor Green }
function Warn($msg)     { Write-Host "    ! $msg" -ForegroundColor Yellow }

Write-Host "=== إعداد الإشعارات الفورية لموقع جاتكم اسحاب ===" -ForegroundColor Magenta

# ── 1) التأكد من Supabase CLI ──────────────────────────────
Step 1 "التحقق من Supabase CLI"
$hasSupabase = $null -ne (Get-Command supabase -ErrorAction SilentlyContinue)
if (-not $hasSupabase) {
  Warn "Supabase CLI غير مثبّت — جارٍ التثبيت عبر npm..."
  npm install -g supabase
  if ($LASTEXITCODE -ne 0) { throw "فشل تثبيت Supabase CLI. ثبّته يدوياً: https://supabase.com/docs/guides/cli" }
}
Ok ("النسخة: " + (supabase --version))

# ── 2) تسجيل الدخول ────────────────────────────────────────
Step 2 "تسجيل الدخول إلى Supabase (سيفتح المتصفح)"
supabase login

# ── 3) ربط المشروع ─────────────────────────────────────────
Step 3 "ربط المشروع"
$projectRef = Read-Host "أدخل PROJECT_REF (الجزء من https://<REF>.supabase.co)"
supabase link --project-ref $projectRef

# ── 4) نشر الدالتين ────────────────────────────────────────
Step 4 "نشر الدوال الخادمية"
supabase functions deploy send-push
supabase functions deploy check-and-push
Ok "تم نشر send-push و check-and-push"

# ── 5) ضبط أسرار VAPID ─────────────────────────────────────
Step 5 "ضبط أسرار VAPID على الخادم"
$vapidPrivate = Read-Host "ألصق VAPID Private Key" -AsSecureString
$vapidPrivatePlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($vapidPrivate))
$subject = Read-Host "بريدك للاتصال (مثال: mailto:you@example.com)"
if ([string]::IsNullOrWhiteSpace($subject)) { $subject = 'mailto:admin@example.com' }

supabase secrets set VAPID_PUBLIC_KEY=$VapidPublic
supabase secrets set VAPID_PRIVATE_KEY=$vapidPrivatePlain
supabase secrets set VAPID_SUBJECT=$subject
Ok "تم ضبط الأسرار"

# ── 6) تذكير بالخطوات اليدوية ──────────────────────────────
Step 6 "خطوات يدوية متبقية في لوحة Supabase"
Write-Host @"
    أ) SQL Editor → شغّل محتوى:
       supabase/migrations/001_push_subscriptions.sql

    ب) SQL Editor → فعّل الجدولة (استبدل <REF> و<SERVICE_ROLE_KEY>):
       create extension if not exists pg_cron;
       create extension if not exists pg_net;
       select cron.schedule('check-and-push-10min','*/10 * * * *', `$`$
         select net.http_post(
           url := 'https://$projectRef.functions.supabase.co/check-and-push',
           headers := jsonb_build_object('Content-Type','application/json',
             'Authorization','Bearer <SERVICE_ROLE_KEY>'));
       `$`$);

    ج) أكمل قيم .env:
       VITE_SUPABASE_URL=https://$projectRef.supabase.co
       VITE_SUPABASE_ANON_KEY=<anon public key من Settings → API>
"@ -ForegroundColor Yellow

# ── 7) اختبار الإرسال ──────────────────────────────────────
Step 7 "اختبار اختياري لدالة send-push"
$doTest = Read-Host "هل تريد إرسال إشعار تجريبي الآن؟ (y/n)"
if ($doTest -eq 'y') {
  $svcKey = Read-Host "ألصق SERVICE_ROLE_KEY (للاختبار فقط)" -AsSecureString
  $svcPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($svcKey))
  $resp = Invoke-RestMethod -Method Post `
    -Uri "https://$projectRef.functions.supabase.co/send-push" `
    -Headers @{ Authorization = "Bearer $svcPlain"; 'Content-Type' = 'application/json' } `
    -Body '{"title":"اختبار","body":"تجربة إشعار عاجل من جاتكم اسحاب"}'
  Write-Host ("    النتيجة: " + ($resp | ConvertTo-Json -Compress)) -ForegroundColor Green
}

Write-Host "`n=== انتهى الإعداد. بعد إكمال الخطوات اليدوية: npm run build ثم انشر على HTTPS ===" -ForegroundColor Magenta
