// OCR 로 읽은 스킬 이름을 게임 데이터의 스킬 이름과 맞춘다. 한글은 자모 단위 편집 거리로 비교한다

const HANGUL_START = 0xac00
const HANGUL_END = 0xd7a3
// 호환 자모(ㄱ~ㅎ, ㅏ~ㅣ) → 초성/중성 번호. OCR 이 글자 조각을 자모로 내놓을 때만 쓴다
const COMPAT_INITIAL = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'
const COMPAT_MEDIAL = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'

/** 비교용 기호열: 한글 음절은 초·중·종성으로 나누고(종성 없으면 둘), 나머지는 글자 그대로 */
export function toTokens(text: string): string[] {
  const out: string[] = []
  for (const ch of text) {
    const code = ch.codePointAt(0)!
    if (code >= HANGUL_START && code <= HANGUL_END) {
      const n = code - HANGUL_START
      out.push(`i${Math.floor(n / 588)}`, `m${Math.floor((n % 588) / 28)}`)
      if (n % 28) out.push(`f${n % 28}`)
      continue
    }
    const initial = COMPAT_INITIAL.indexOf(ch)
    const medial = COMPAT_MEDIAL.indexOf(ch)
    out.push(initial >= 0 ? `i${initial}` : medial >= 0 ? `m${medial}` : ch)
  }
  return out
}

/** 공백 제거, 전각 영숫자 → 반각, 영문 대문자 */
export function normalizeName(text: string): string {
  return text
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, '')
    .toUpperCase()
}

/** OCR 글자열(read)에서 이름(name)을 찾는 편집 거리. read 의 앞뒤 군더더기(아이콘 조각 등)는 반값으로 버린다 */
export function fitDistance(read: readonly string[], name: readonly string[]): number {
  const END_GAP = 0.5
  const m = name.length
  let prev = Array.from({ length: m + 1 }, (_, j) => j)
  let cur = new Array<number>(m + 1)
  for (let i = 1; i <= read.length; i++) {
    cur[0] = prev[0] + END_GAP
    for (let j = 1; j <= m; j++) {
      const substitute = prev[j - 1] + (read[i - 1] === name[j - 1] ? 0 : 1)
      const skipRead = prev[j] + (j === m ? END_GAP : 1)
      const skipName = cur[j - 1] + 1
      cur[j] = Math.min(substitute, skipRead, skipName)
    }
    ;[prev, cur] = [cur, prev]
  }
  return prev[m]
}

export interface NameCandidate {
  id: number
  name: string
}

export interface NameMatch {
  id: number
  /** 0~1, 1 = 완전히 같음 */
  score: number
  /** 두 번째로 가까운 후보와의 점수 차 */
  margin: number
}

export class SkillNameMatcher {
  private readonly entries: { id: number; tokens: string[] }[]
  /** OCR 에 허용할 글자 (후보 이름에 쓰인 글자만) */
  readonly charset: string

  constructor(candidates: readonly NameCandidate[]) {
    this.entries = candidates.map((c) => ({ id: c.id, tokens: toTokens(normalizeName(c.name)) }))
    const chars = new Set<string>()
    for (const c of candidates) for (const ch of normalizeName(c.name)) chars.add(ch)
    this.charset = [...chars].sort().join('')
  }

  /** 가장 가까운 후보. filter 로 후보를 좁힌다 */
  match(ocrText: string, filter?: (id: number) => boolean): NameMatch | null {
    const text = [...normalizeName(ocrText)].filter((ch) => this.charset.includes(ch)).join('')
    if (!text) return null
    const tokens = toTokens(text)
    let best: NameMatch | null = null
    let second = 0
    for (const entry of this.entries) {
      if (filter && !filter(entry.id)) continue
      const score = Math.max(0, 1 - fitDistance(tokens, entry.tokens) / Math.max(entry.tokens.length, 1))
      if (!best || score > best.score) {
        if (best) second = Math.max(second, best.score)
        best = { id: entry.id, score, margin: 0 }
      } else second = Math.max(second, score)
    }
    if (best) best.margin = best.score - second
    return best
  }
}
