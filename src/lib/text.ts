// 검색어 매칭: 공백·대소문자 무시, 한글 초성 검색(예: "ㄱㅍ" → "간파") 지원

const CHOSUNG = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'
const HANGUL_START = 0xac00
const HANGUL_END = 0xd7a3
const CHOSUNG_ONLY = /^[ㄱ-ㅎ]+$/

export function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '')
}

export function toChosung(text: string): string {
  let out = ''
  for (const ch of text) {
    const code = ch.charCodeAt(0)
    out += code >= HANGUL_START && code <= HANGUL_END ? CHOSUNG[Math.floor((code - HANGUL_START) / 588)] : ch
  }
  return out
}

/**
 * 검색어와 후보 텍스트들의 일치 점수. 0 = 불일치, 클수록 잘 맞음.
 * (앞부분 일치 > 부분 일치 > 초성 일치)
 */
export function matchScore(query: string, texts: readonly string[]): number {
  const q = normalize(query)
  if (!q) return 1
  const chosungQuery = CHOSUNG_ONLY.test(q)
  let best = 0
  for (const text of texts) {
    const t = normalize(text)
    if (t.startsWith(q)) return 3
    if (t.includes(q)) best = Math.max(best, 2)
    else if (chosungQuery && toChosung(t).includes(q)) best = Math.max(best, 1)
  }
  return best
}

export function matchesQuery(query: string, texts: readonly string[]): boolean {
  return matchScore(query, texts) > 0
}
