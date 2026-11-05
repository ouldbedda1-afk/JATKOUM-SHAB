import React, { useId } from 'react';
import { WILAYA_SHAPES } from '../mauritaniaWilayaShapes';

// خريطة ولايات موريتانيا (SVG بالدرجات)، عليها اسم الموقع. تستعملها صفحتا المراعي والنشرة الموسمية.
//   image: صورة بإطار الخريطة نفسه (مثل صورة GIBS)، under: ما يُرسم تحت الحدود ويُقص على شكل موريتانيا،
//   children: ما يُرسم فوقها، fill: لون كل الولايات، fills: لون لكل ولاية { اسمها: لون }.

// إطار الخريطة بالدرجات، كإطار صورة GIBS التي تحسب منها دالة pasture-ndvi
export const LON0 = -17.2, LAT1 = 27.4, SPAN_LON = 12.5, SPAN_LAT = 12.8;
// شريط اسم الموقع داخل الخريطة في أسفلها، فوق مالي: من خط الطول 11.4 غرباً شرقاً لا تنزل موريتانيا
// تحت 15.24 شمالاً، فالشريط بين 14.65 و15.15 لا يغطي شيئاً من الغطاء النباتي في موريتانيا
const BADGE = { x: -11.3, y: 14.65, w: 6.5, h: 0.5 };
// العلامتان الباهتتان [خط الطول، خط العرض، حجم الخط]: وسط الخريطة، وأصغر منها فوق صحراء تكانت والحوض الشرقي
const WATERMARKS = [[LON0 + SPAN_LON / 2, LAT1 - SPAN_LAT / 2, 0.62], [-9.0, 17.6, 0.45]];

// ── الخريطة: حدود الولايات بالدرجات (x = الطول، y = -العرض) ─────────────────
const ringPath = (ring) => 'M' + ring.map(([x, y]) => `${x},${-y}`).join('L') + 'Z';

function centroid(rings) {
  const ring = rings.reduce((a, b) => (b.length > a.length ? b : a));
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length];
    const f = x1 * y2 - x2 * y1;
    a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
  }
  return [cx / (3 * a), cy / (3 * a)];
}
// الولايات الصغيرة المتجاورة تتداخل أسماؤها عند مراكزها، فنضعها يدوياً
const LABEL_AT = {
  'لعصابه': [-11.75, 17.05], 'الحوض الغربي': [-9.45, 17.4], 'كوركول': [-13.05, 16.3], 'كيدماغا': [-11.95, 15.05],
};
const LABELS = WILAYA_SHAPES.map((s) => ({ wilaya: s.wilaya, at: LABEL_AT[s.wilaya] || centroid(s.rings) }));

export default function MauritaniaMap({ image, under, children, labels = true, fill = 'none', fills = null }) {
  const clipId = useId();
  return (
    <svg viewBox={`${LON0} ${-LAT1} ${SPAN_LON} ${SPAN_LAT}`} className="w-full h-auto block bg-sky-50" role="img"
      aria-label="خريطة ولايات موريتانيا">
      {image && <image href={image} x={LON0} y={-LAT1} width={SPAN_LON} height={SPAN_LAT} preserveAspectRatio="none" />}
      {(fill !== 'none' || fills) && WILAYA_SHAPES.map((s) => s.rings.map((r, i) => (
        <path key={`${s.wilaya}${i}`} d={ringPath(r)} fill={fills?.[s.wilaya] ?? fill} />
      )))}
      {/* ما تحت الحدود (مربعات الموائل) يُقص على شكل موريتانيا فلا يتجاوز الساحل والحدود */}
      <clipPath id={clipId}>
        {WILAYA_SHAPES.map((s) => s.rings.map((r, i) => <path key={`${s.wilaya}${i}`} d={ringPath(r)} />))}
      </clipPath>
      {under && <g clipPath={`url(#${clipId})`}>{under}</g>}
      {WILAYA_SHAPES.map((s) => (
        <g key={s.wilaya}>
          {s.rings.map((r, i) => (
            <path key={i} d={ringPath(r)} fill="none" stroke="#334155" strokeWidth="1.2"
              vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          ))}
        </g>
      ))}
      {children}
      {labels && LABELS.filter((l) => l.wilaya !== 'نواكشوط').map((l) => (
        <text key={l.wilaya} x={l.at[0]} y={-l.at[1]} fontSize="0.32" textAnchor="middle" fontWeight="700"
          fill="#1e293b" stroke="#fff" strokeWidth="0.08" paintOrder="stroke">{l.wilaya}</text>
      ))}
      {/* اسم الموقع على الخريطة: علامتان باهتتان مائلتان وشريط في الأسفل، تبقى في أي لقطة شاشة.
          السفلى فوق صحراء تكانت والحوض الشرقي، بعيداً عن الغطاء النباتي في الجنوب */}
      {WATERMARKS.map(([lon, lat, size]) => (
        <text key={lon} x={lon} y={-lat} fontSize={size} textAnchor="middle" fontWeight="900"
          fill="#0f172a" fillOpacity="0.12" transform={`rotate(-25 ${lon} ${-lat})`}
          style={{ pointerEvents: 'none' }}>جاتكم اسحاب · jatkoumshab.com</text>
      ))}
      <rect x={BADGE.x} y={-(BADGE.y + BADGE.h)} width={BADGE.w} height={BADGE.h} rx="0.08" fill="#0b2c5e" fillOpacity="0.9" />
      <text x={BADGE.x + BADGE.w / 2} y={-(BADGE.y + BADGE.h * 0.3)} fontSize="0.32" textAnchor="middle" fontWeight="700" fill="#fff"
        textLength={BADGE.w - 1.2} lengthAdjust="spacingAndGlyphs">
        جاتكم اسحاب · www.jatkoumshab.com
      </text>
    </svg>
  );
}
