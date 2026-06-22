import React from 'react';

// هيدر افتتاحي عريض — انطباع أول قوي على الكمبيوتر (ومتجاوب على الهاتف)
export default function HomeHeroBanner() {
  const chips = [
    '🛰️ رصد حيّ · 238 بلدية',
    '🔔 إشعارات فورية',
  ];

  return (
    <section className="relative overflow-hidden bg-gradient-to-l from-blue-800 via-blue-600 to-cyan-500 text-white">
      {/* لمعة زخرفية */}
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 right-10 h-64 w-64 rounded-full bg-cyan-300/20 blur-3xl" />

      <div className="relative max-w-[1400px] mx-auto px-4 py-6 md:py-9 flex flex-col md:flex-row items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <img
            src="/logo.png"
            alt="جاتكم اسحاب"
            className="w-14 h-14 md:w-[68px] md:h-[68px] rounded-2xl bg-white/15 p-1.5 object-contain shadow-lg ring-1 ring-white/20"
          />
          <div>
            <h1 className="text-2xl md:text-4xl font-black tracking-tight leading-none">جاتكم اسحاب</h1>
            <p className="mt-1.5 text-sm md:text-lg text-white/90 font-bold">
              الرصد الجوي المباشر والتنبيهات لكل موريتانيا 🇲🇷
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center md:justify-end gap-2 md:gap-2.5 max-w-xl">
          {chips.map((c) => (
            <span
              key={c}
              className="inline-flex items-center rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-[11px] md:text-sm font-bold backdrop-blur-sm whitespace-nowrap"
            >
              {c}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/40 bg-emerald-400/20 px-3 py-1.5 text-[11px] md:text-sm font-black">
            <span className="h-2 w-2 rounded-full bg-emerald-300 animate-pulse" />
            مباشر الآن
          </span>
        </div>
      </div>
    </section>
  );
}
