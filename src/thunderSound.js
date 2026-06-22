/**
 * تشغيل صوت رعد حقيقي (تسجيل فعلي) عند رصد برق والموقع مفتوح.
 * المصدر: Thunder.ogg — Bidgee، ويكيميديا كومنز (CC BY 3.0).
 *
 * سياسة المتصفحات: الصوت لا يعمل قبل تفاعل المستخدم — نفتح القفل عند أول لمسة/نقرة.
 */

let audio = null;
let unlocked = false;

function getAudio() {
  if (!audio && typeof Audio !== 'undefined') {
    audio = new Audio('/sounds/thunder.mp3');
    audio.preload = 'auto';
    audio.volume = 0.9;
  }
  return audio;
}

// يُستدعى عند أول تفاعل لفتح قفل الصوت (تشغيل صامت قصير)
export function unlockAudio() {
  const a = getAudio();
  if (!a || unlocked) return;
  a.muted = true;
  const p = a.play();
  if (p && typeof p.then === 'function') {
    p.then(() => {
      a.pause();
      a.currentTime = 0;
      a.muted = false;
      unlocked = true;
    }).catch(() => { a.muted = false; });
  }
}

export function isAudioUnlocked() {
  return unlocked;
}

// تشغيل صوت الرعد الحقيقي
export function playThunder() {
  const a = getAudio();
  if (!a) return;
  try {
    a.muted = false;
    a.currentTime = 0;
    const p = a.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch { /* تجاهل */ }
}
