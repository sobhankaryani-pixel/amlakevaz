// Shared by browser analytics and successful form requests. No form data is read.
const KEYS = ['source', 'medium', 'campaign', 'referrer'];
export function cleanAttribution(value) {
  const result = {};
  for (const key of KEYS) {
    const text = typeof value?.[key] === 'string' ? value[key].trim().slice(0, 120) : '';
    const valid = key === 'referrer' ? /^[a-zA-Z0-9.-]+$/ : /^[\p{L}\p{N}_ .\-]+$/u;
    if (text && valid.test(text)) result[key] = text;
  }
  return result;
}
export function attributionFor(search, referrer, prior) {
  const params = new URLSearchParams(search);
  const tagged = cleanAttribution({source: params.get('utm_source'), medium: params.get('utm_medium'), campaign: params.get('utm_campaign')});
  if (Object.keys(tagged).length) return {...tagged, ...cleanAttribution({referrer})};
  return prior ? cleanAttribution(prior) : cleanAttribution({referrer});
}
export function campaignChanged(prior, next) {
  return !!prior && ['source', 'medium', 'campaign'].some(key => (prior[key] || '') !== (next[key] || ''));
}
