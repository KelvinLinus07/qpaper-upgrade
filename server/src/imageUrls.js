/**
 * Stable same-origin URLs for object images.
 * Stored question images no longer depend on an R2 bucket being public.
 * Keep legacy HTTPS URLs valid so existing AWS S3 / R2 papers keep working.
 */
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const IMAGE_FILENAME = `${UUID}\\.(?:jpg|jpeg|png|webp|gif)`
const OBJECT_KEY = new RegExp(`^questions/(${UUID})/(${IMAGE_FILENAME})$`, 'i')
const IMAGE_PATH = new RegExp(`^/api/uploads/image/(${UUID})/(${IMAGE_FILENAME})$`, 'i')

export function objectKeyToImageUrl(key) {
  const match = typeof key === 'string' ? OBJECT_KEY.exec(key) : null
  if (!match) throw new Error('Invalid stored image key')
  return `/api/uploads/image/${match[1]}/${match[2]}`
}

export function imageParamsToKey(ownerId, filename) {
  const key = `questions/${ownerId}/${filename}`
  return OBJECT_KEY.test(key) ? key : null
}

export function isAcceptedImageUrl(url) {
  if (typeof url !== 'string' || url.length > 2048) return false
  if (IMAGE_PATH.test(url)) return true
  // Previously saved papers and uploads use public HTTPS object URLs.
  return url.startsWith('https://')
}

/** Adapt old R2 URLs on load, even if the public R2 custom domain was disabled. */
export function resolveLegacyImageUrl(url, publicBaseUrl) {
  if (typeof url !== 'string' || !publicBaseUrl) return url
  const prefix = `${publicBaseUrl.replace(/\/+$/, '')}/`
  if (!url.startsWith(prefix)) return url
  const key = url.slice(prefix.length)
  try { return objectKeyToImageUrl(key) } catch { return url }
}
