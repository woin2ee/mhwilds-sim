// 공유 링크: <사이트>#b=<코드>

/** URL 해시 키: https://.../#b=<코드> */
export const SHARE_HASH_KEY = 'b'

const CODE_IN_TEXT = new RegExp(`[#?&]${SHARE_HASH_KEY}=([A-Za-z0-9_-]+)`)
const RAW_CODE = /^[A-Za-z0-9_-]+$/

/** 붙여 넣은 글(코드 그 자체, #b= 가 붙은 링크 등)에서 코드만 꺼낸다. 없으면 null. */
export function extractShareCode(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const match = CODE_IN_TEXT.exec(trimmed)
  if (match) return match[1]
  return RAW_CODE.test(trimmed) ? trimmed : null
}

/** 공유 링크: pageUrl 의 해시를 #b=<코드> 로 바꾼다 */
export function shareUrl(code: string, pageUrl: string): string {
  const hash = pageUrl.indexOf('#')
  return `${hash >= 0 ? pageUrl.slice(0, hash) : pageUrl}#${SHARE_HASH_KEY}=${code}`
}
