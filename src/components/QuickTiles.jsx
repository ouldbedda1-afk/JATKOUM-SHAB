import React from 'react';
import { Link } from 'react-router-dom';

const TILES = [
  { icon: '⚠️', label: 'تنبيهات جوية',      to: '#today-observation', color: 'from-red-500/10 to-red-500/5 text-red-700 border-red-200' },
  { icon: '👥', label: 'بلاغات المواطنين',   to: '/althala',           color: 'from-emerald-500/10 to-emerald-500/5 text-emerald-700 border-emerald-200' },
  { icon: '✍️', label: 'مدوّنو الطقس',       to: '#bloggers',          color: 'from-purple-500/10 to-purple-500/5 text-purple-700 border-purple-200' },
  { icon: '🗂️', label: 'أرشيف الأمطار',     to: '#rain-archive',      color: 'from-sky-500/10 to-sky-500/5 text-sky-700 border-sky-200' },
  { icon: '📅', label: 'التوقعات اليومية',   to: '/forecast',          color: 'from-amber-500/10 to-amber-500/5 text-amber-700 border-amber-200' },
  { icon: '📲', label: 'حمّل التطبيق',       to: '#install-app',       color: 'from-blue-600/10 to-blue-600/5 text-blue-700 border-blue-200' },
];

function Tile({ icon, label, to, color }) {
  const cls = `flex items-center gap-3 bg-gradient-to-l ${color} border rounded-2xl px-4 py-3.5 font-black text-sm hover:shadow-md transition-shadow`;
  const inner = (
    <>
      <span className="text-2xl">{icon}</span>
      <span>{label}</span>
    </>
  );
  return to.startsWith('#') ? (
    <a href={to} className={cls}>{inner}</a>
  ) : (
    <Link to={to} className={cls}>{inner}</Link>
  );
}

export default function QuickTiles() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {TILES.map((t) => (
        <Tile key={t.label} {...t} />
      ))}
    </div>
  );
}
