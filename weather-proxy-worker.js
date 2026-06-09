export default {
  async fetch(request, env, ctx) {
    const allowedOrigins = ["http://localhost", "http://localhost:5173", "http://localhost:5173/JATKOUM-SHAB", "https://ouldbedda1-afk.github.io", "https://ouldbedda1-afk.github.io/JATKOUM-SHAB"];
    const origin = request.headers.get("Origin") || "";
    const corsHeaders = {
      "Access-Control-Allow-Origin": allowedOrigins.includes(origin) ? origin : "http://localhost:5173",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400"
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    const url = new URL(request.url);

    // --- محدودية التزامن المحلية لتقليل الـ 429 عند الاتصال بـ Open-Meteo ---
    if (typeof globalThis.__meteo === 'undefined') {
      globalThis.__meteo = { concurrent: 0, queue: [] };
    }
    const MAX_CONCURRENT = 2;

    function acquireSlot() {
      if (globalThis.__meteo.concurrent < MAX_CONCURRENT) {
        globalThis.__meteo.concurrent++;
        return Promise.resolve();
      }
      return new Promise(resolve => globalThis.__meteo.queue.push(resolve));
    }

    function releaseSlot() {
      globalThis.__meteo.concurrent = Math.max(0, globalThis.__meteo.concurrent - 1);
      const next = globalThis.__meteo.queue.shift();
      if (next) {
        globalThis.__meteo.concurrent++;
        next();
      }
    }

    async function proxyFetchWithRetry(target, opts = {}, retries = 3, backoff = 1000) {
      await acquireSlot();
      try {
        const res = await fetch(target, opts);
        if (res.status === 429) {
          const ra = res.headers.get && res.headers.get('Retry-After');
          const raMs = ra ? (Number(ra) * 1000) : backoff;
          if (retries > 0) {
            await new Promise(r => setTimeout(r, raMs + Math.random() * 500));
            return proxyFetchWithRetry(target, opts, retries - 1, backoff * 2);
          }
          throw new Error('Too Many Requests');
        }
        return res;
      } catch (err) {
        if (retries > 0 && !err.message.includes('Too Many Requests')) {
          await new Promise(r => setTimeout(r, backoff + Math.random() * 500));
          return proxyFetchWithRetry(target, opts, retries - 1, backoff * 2);
        }
        throw err;
      } finally {
        releaseSlot();
      }
    }

    // ✅ مسار الطقس الرئيسي
    if (!url.pathname.includes('/proxy')) {
      const cacheKey = `meteo:${url.search}`;
      
      // التحقق من وجود METEO_CACHE لمنع خطأ 500
      let cached = null;
      if (env.METEO_CACHE) {
        cached = await env.METEO_CACHE.get(cacheKey);
      }
      
      if (cached) return new Response(cached, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      try {
        const targetUrl = `https://api.open-meteo.com/v1/forecast${url.search}`;
        const res = await proxyFetchWithRetry(targetUrl);
        if (!res.ok) {
          // حاول إرجاع نسخة مخزنة قديمة إن وُجدت
          const stale = env.METEO_CACHE ? await env.METEO_CACHE.get(cacheKey) : null;
          if (stale) return new Response(stale, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          throw new Error(`API Fail: ${res.status}`);
        }
        const data = await res.text();
        if (env.METEO_CACHE) {
          ctx.waitUntil(env.METEO_CACHE.put(cacheKey, data, { expirationTtl: 3600 }));
        }
        return new Response(data, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (e) {
        console.error('Meteo Proxy Error:', e);
        return new Response(JSON.stringify({error: e.message}), { status: 502, headers:{...corsHeaders} });
      }
    }

    // ✅ مسار عام (ناسا / بحري)
    const targetUrl = url.searchParams.get("url");
    if (!targetUrl) return new Response("Missing URL", { status:400 });
    const cacheKey = `proxy:${btoa(targetUrl)}`;
    
    let cached = null;
    if (env.METEO_CACHE) {
      cached = await env.METEO_CACHE.get(cacheKey);
    }

    if (cached) return new Response(cached, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    try {
      const res = await proxyFetchWithRetry(targetUrl);
      if (!res.ok) {
        const stale = env.METEO_CACHE ? await env.METEO_CACHE.get(cacheKey) : null;
        if (stale) return new Response(stale, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        throw new Error(`Fetch fail: ${res.status}`);
      }
      const data = await res.text();
      if (env.METEO_CACHE) {
        ctx.waitUntil(env.METEO_CACHE.put(cacheKey, data, { expirationTtl: 1800 }));
      }
      return new Response(data, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (e) {
      console.error('General Proxy Error:', e);
      return new Response(JSON.stringify({error: e.message}), { status: 502, headers:{...corsHeaders} });
    }
  }
};