const ECMWF_BRIEFS_API = '/api/ecmwf-briefs';

export async function getEcmwfBriefs() {
  try {
    const response = await fetch(ECMWF_BRIEFS_API, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`ECMWF briefs request failed: ${response.status}`);
    }

    const data = await response.json();
    return Array.isArray(data?.items) ? data.items : [];
  } catch (error) {
    console.warn('تعذر جلب ملخصات ECMWF:', error);
    return [];
  }
}
