/**
 * توليد صوت رعد عبر Web Audio API (بلا ملف صوتي خارجي).
 * يُستخدم لتنبيه الزائر عند رصد برق حقيقي والموقع مفتوح.
 *
 * سياسة المتصفحات: الصوت لا يعمل قبل تفاعل المستخدم — لذا نفتحه عند أول لمسة/نقرة.
 */

let ctx = null;
let unlocked = false;

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch { return null; }
  }
  return ctx;
}

// يُستدعى عند أول تفاعل لفتح قفل الصوت
export function unlockAudio() {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  unlocked = true;
}

export function isAudioUnlocked() {
  return unlocked;
}

// تشغيل صوت رعد (طقطقة أولية ثم رومبل متلاشٍ)
export function playThunder() {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});

  const now = c.currentTime;
  const duration = 3.4;

  // 1) ضجيج مفلتر = جسم الرعد
  const bufferSize = Math.floor(c.sampleRate * duration);
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const noise = c.createBufferSource();
  noise.buffer = buffer;

  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(420, now);
  lp.frequency.exponentialRampToValueAtTime(70, now + duration);

  const noiseGain = c.createGain();
  noiseGain.gain.setValueAtTime(0.0001, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.85, now + 0.06); // الطقطقة
  noiseGain.gain.exponentialRampToValueAtTime(0.35, now + 0.5);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + duration); // التلاشي

  noise.connect(lp);
  lp.connect(noiseGain);
  noiseGain.connect(c.destination);

  // 2) رومبل منخفض جداً (هزّة الرعد)
  const rumble = c.createOscillator();
  rumble.type = 'sine';
  rumble.frequency.setValueAtTime(48, now);
  rumble.frequency.exponentialRampToValueAtTime(26, now + duration);

  const rumbleGain = c.createGain();
  rumbleGain.gain.setValueAtTime(0.45, now);
  rumbleGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  rumble.connect(rumbleGain);
  rumbleGain.connect(c.destination);

  try {
    noise.start(now); noise.stop(now + duration);
    rumble.start(now); rumble.stop(now + duration);
  } catch { /* تجاهل */ }
}
