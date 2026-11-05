import React from 'react';

// Render content with basic formatting (newlines → paragraphs)
// يحوّل **نص** إلى عنصر بارز — دعم بسيط للتشديد داخل نصوص الأخبار
export function BoldText({ text }) {
  const parts = String(text ?? '').split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const m = part.match(/^\*\*([^*]+)\*\*$/);
    return m ? <b key={i}>{m[1]}</b> : <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

export default function ArticleContent({ content }) {
  if (!content) return null;
  const paragraphs = content.split(/\n\n+/).filter(Boolean);
  return (
    <div className="prose prose-sm max-w-none text-gray-800 leading-loose" dir="rtl">
      {paragraphs.map((p, i) => (
        <p key={i} className="mb-4 text-base leading-8">
          {p.split('\n').map((line, j) => (
            <React.Fragment key={j}><BoldText text={line} />{j < p.split('\n').length - 1 && <br />}</React.Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}
