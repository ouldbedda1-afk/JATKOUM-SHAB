const ECMWF_SOURCES = [
  'https://www.ecmwf.int/',
  'https://www.ecmwf.int/rss.xml',
  'https://www.ecmwf.int/en/about/media-centre/news',
];

const REGION_MATCHERS = [
  { label: 'موريتانيا', patterns: ['mauritania', 'mauritanie'] },
  { label: 'السنغال', patterns: ['senegal', 'senegalese'] },
  { label: 'مالي', patterns: ['mali', 'malian'] },
  { label: 'الجزائر', patterns: ['algeria', 'algerian'] },
  { label: 'الصحراء الغربية', patterns: ['western sahara', 'sahara occidental'] },
  { label: 'الساحل', patterns: ['sahel'] },
  { label: 'غرب أفريقيا', patterns: ['west africa', 'sub-saharan africa'] },
];

function decodeHtml(value = '') {
  return String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&rsquo;/gi, "'")
    .replace(/&ldquo;/gi, '"')
    .replace(/&rdquo;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x27;/gi, "'");
}

function stripTags(value = '') {
  return decodeHtml(String(value).replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function normalize(value = '') {
  return stripTags(value).toLowerCase();
}

function detectRegion(text = '') {
  const haystack = normalize(text);
  for (const region of REGION_MATCHERS) {
    if (region.patterns.some((pattern) => haystack.includes(pattern))) {
      return region.label;
    }
  }
  return '';
}

function buildArabicBrief(item) {
  const regionLabel = item.regionLabel || 'منطقتنا';
  const dateLabel = item.publishedAt
    ? new Date(item.publishedAt).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '';

  return {
    ...item,
    brief: `نشر ECMWF خبراً يتعلق بـ${regionLabel}: ${item.title}${dateLabel ? ` (${dateLabel})` : ''}.`,
  };
}

function uniqByKey(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.link || ''}::${item.title || ''}`;
    if (!item.title || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseRssItems(xml) {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];

  return blocks
    .map((block) => {
      const title = stripTags((block.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '');
      const link = stripTags((block.match(/<link>([\s\S]*?)<\/link>/i) || [])[1] || '');
      const summary = stripTags((block.match(/<description>([\s\S]*?)<\/description>/i) || [])[1] || '');
      const publishedAt = stripTags((block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || [])[1] || '');
      const combinedText = `${title} ${summary}`;
      const regionLabel = detectRegion(combinedText);

      if (!regionLabel) return null;

      return buildArabicBrief({
        source: 'ecmwf-rss',
        title,
        link,
        summary,
        publishedAt,
        regionLabel,
      });
    })
    .filter(Boolean);
}

function parseHtmlCandidates(html, sourceUrl) {
  const anchorRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const items = [];
  let match;

  while ((match = anchorRegex.exec(html)) !== null) {
    const href = match[1] || '';
    const title = stripTags(match[2] || '');

    if (!href || title.length < 12) continue;
    if (
      !href.startsWith('/en/about/') &&
      !href.startsWith('/en/forecasts/') &&
      !href.startsWith('https://www.ecmwf.int/en/about/') &&
      !href.startsWith('https://www.ecmwf.int/en/forecasts/')
    ) {
      continue;
    }

    const start = match.index;
    const nearbyHtml = html.slice(start, start + 900);
    const nearbyText = stripTags(nearbyHtml);
    const regionLabel = detectRegion(`${title} ${nearbyText}`);

    if (!regionLabel) continue;

    const link = href.startsWith('http') ? href : new URL(href, sourceUrl).toString();
    const summary = nearbyText.replace(title, '').slice(0, 260).trim();

    items.push(
      buildArabicBrief({
        source: 'ecmwf-html',
        title,
        link,
        summary,
        publishedAt: '',
        regionLabel,
      })
    );
  }

  return items;
}

async function fetchSource(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'MeteoMauritanieBot/1.0 (+https://jatkoum-shab.vercel.app/)',
      accept: 'text/html,application/rss+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ECMWF source ${url}: ${response.status}`);
  }

  return response.text();
}

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payloads = await Promise.all(
      ECMWF_SOURCES.map(async (url) => {
        try {
          const body = await fetchSource(url);
          return { url, body };
        } catch (error) {
          console.warn('ECMWF source fetch failed:', url, error);
          return { url, body: '' };
        }
      })
    );

    const allItems = payloads.flatMap(({ url, body }) => {
      if (!body) return [];
      if (url.endsWith('.xml')) return parseRssItems(body);
      return parseHtmlCandidates(body, url);
    });

    const items = uniqByKey(allItems)
      .sort((a, b) => {
        const aTime = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const bTime = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 6);

    response.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
    return response.status(200).json({
      source: 'ecmwf',
      count: items.length,
      items,
    });
  } catch (error) {
    console.error('ECMWF briefs error:', error);
    return response.status(200).json({
      source: 'ecmwf',
      count: 0,
      items: [],
    });
  }
}
