// 검색어 매칭: 공백·대소문자 무시, 한글 초성 검색(예: "ㄱㅍ" → "간파") 지원

const CHOSUNG = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'
const HANGUL_START = 0xac00
const HANGUL_END = 0xd7a3
const CHOSUNG_ONLY = /^[ㄱ-ㅎ]+$/
// 초성만 이어 치면 입력기가 ㄱ+ㅅ → ㄳ, ㅂ+ㅅ → ㅄ 처럼 겹받침 한 글자로 붙인다. 초성에는 겹자음이 없으니 낱자로 푼다
const SPLIT_JAMO: Record<string, string> = {
  ㄳ: 'ㄱㅅ', ㄵ: 'ㄴㅈ', ㄶ: 'ㄴㅎ', ㅄ: 'ㅂㅅ',
  ㄺ: 'ㄹㄱ', ㄻ: 'ㄹㅁ', ㄼ: 'ㄹㅂ', ㄽ: 'ㄹㅅ', ㄾ: 'ㄹㅌ', ㄿ: 'ㄹㅍ', ㅀ: 'ㄹㅎ',
}
const COMPOUND_JAMO = new RegExp(`[${Object.keys(SPLIT_JAMO).join('')}]`, 'g')

export function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '').replace(COMPOUND_JAMO, (ch) => SPLIT_JAMO[ch])
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
