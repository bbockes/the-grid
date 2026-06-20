export const MAX_DESCRIPTION_WORDS = 300
export const MAX_SOCIAL_LINKS = 3

export function countWords(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

export function normalizeSocialLink(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed.replace(/^\/\//, '')}`

  try {
    const parsed = new URL(withProtocol)
    if (!['http:', 'https:'].includes(parsed.protocol)) return null
    if (!parsed.hostname.includes('.')) return null
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

export function formatSocialLinkDisplay(url: string): string {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname === '/' ? '' : parsed.pathname
    return `${parsed.hostname.replace(/^www\./, '')}${path}${parsed.search}${parsed.hash}`
  } catch {
    return url
  }
}

export function normalizeSocialLinks(links: string[]): string[] {
  return links
    .map(normalizeSocialLink)
    .filter((link): link is string => link !== null)
    .slice(0, MAX_SOCIAL_LINKS)
}

export function parseSocialLinks(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}
