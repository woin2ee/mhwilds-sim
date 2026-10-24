// 스크린샷 한 장 → 그 안의 호석 상세 창들. 글자 인식(OCR) 엔진은 밖에서 받는다 (브라우저: tesseract.js, 테스트: 가짜)
import { WEAPON_SLOT_RARITY } from '../appraisedTalisman'
import type { Slot } from '../types'
import {
  brightness,
  encodePgm,
  inkOnPaper,
  otsuThreshold,
  resizeGray,
  whiteness,
  type GrayImage,
  type Rect,
  type RgbaImage,
} from './image'
import { findPanels } from './layout'
import { SkillNameMatcher } from './match'
import { rarityFromTextColor, readSlot, resolveSlots } from './slots'

/** 한 줄짜리 글자 이미지(PGM)를 읽는다. whitelist 밖의 글자는 내놓지 않는다 */
export type LineReader = (pgm: Uint8Array, whitelist: string) => Promise<string>

export interface ScanSkillCandidate {
  id: number
  name: string
  maxLevel: number
}

export interface ScannedSkill {
  /** 맞는 스킬을 못 찾으면 null */
  skillId: number | null
  level: number
  /** OCR 이 읽은 글자 */
  text: string
  /** 이름이 확실하지 않음 (일치 점수가 낮거나, 비슷한 후보가 있거나, 레벨 칸 수가 최대 레벨과 다름) */
  unsure: boolean
}

export interface ScannedTalisman {
  /** 스크린샷에서 이 상세 창의 영역 (미리보기용) */
  bounds: Rect
  rarity: number | null
  rarityUnsure: boolean
  skills: ScannedSkill[]
  slots: Slot[]
  slotsUnsure: boolean
}

const OCR_LINE_HEIGHT = 64
const DIGITS = '0123456789'

/** 글자 줄 → OCR 입력 (줄 높이를 맞춰 확대하고 밝은 글자를 흰 바탕의 검정 글자로) */
export function prepareLine(gray: GrayImage): Uint8Array {
  const scale = Math.min(6, Math.max(1, OCR_LINE_HEIGHT / Math.max(1, gray.height)))
  const big = scale > 1 ? resizeGray(gray, gray.width * scale, gray.height * scale) : gray
  return encodePgm(inkOnPaper(big, otsuThreshold(big), 16))
}

/** 숫자 칸 OCR 결과의 마지막 숫자 (감정 호석은 레어도 5~8) */
export function parseRarity(text: string): number | null {
  const digits = text.replace(/[^0-9]/g, '')
  const n = Number(digits[digits.length - 1])
  return digits && n >= 5 && n <= 8 ? n : null
}

/**
 * 레어도 = 숫자 OCR · 'RARE' 글자 색 · 무기 슬롯(레어도 8 에만)을 맞춰 본 값.
 * 숫자와 확인된 색이 다르면 색을 믿는다 (숫자 한 글자는 OCR 이 자주 틀린다).
 */
export function decideRarity(
  digit: number | null,
  color: { rarity: number; verified: boolean } | null,
  hasWeaponSlot: boolean,
): { value: number | null; sure: boolean } {
  let value: number | null
  let sure: boolean
  if (digit !== null && color?.rarity === digit) [value, sure] = [digit, true]
  else if (color?.verified) [value, sure] = [color.rarity, digit === null]
  else if (digit !== null) [value, sure] = [digit, color === null]
  else [value, sure] = [color?.rarity ?? null, false]
  if (hasWeaponSlot && value !== WEAPON_SLOT_RARITY) return { value: WEAPON_SLOT_RARITY, sure: false }
  if (!hasWeaponSlot && value === WEAPON_SLOT_RARITY) sure = false
  return { value, sure }
}

export class TalismanScanner {
  private readonly matcher: SkillNameMatcher
  private readonly maxLevels: Map<number, number>

  /** skills: 호석에 붙을 수 있는 스킬 (방어구·무기 스킬) */
  constructor(skills: readonly ScanSkillCandidate[]) {
    this.matcher = new SkillNameMatcher(skills)
    this.maxLevels = new Map(skills.map((s) => [s.id, s.maxLevel]))
  }

  async scan(img: RgbaImage, readLine: LineReader): Promise<ScannedTalisman[]> {
    const out: ScannedTalisman[] = []
    for (const panel of findPanels(img)) {
      const skills: ScannedSkill[] = []
      for (const row of panel.rows) {
        const text = await readLine(prepareLine(whiteness(img, row.name)), `${this.matcher.charset} `)
        skills.push(this.matchSkill(text, row.level, row.maxLevel))
      }
      // 같은 스킬이 두 줄에 나오면 둘 다 확인이 필요하다
      for (const s of skills) {
        if (s.skillId !== null && skills.filter((o) => o.skillId === s.skillId).length > 1) s.unsure = true
      }
      const readings = panel.slots.map((r) => readSlot(img, r))
      // 종류·레벨까지 다 읽힌 소켓이 있으면 레벨 칸을 잘못 잡은 것이 아니라 정말 상세 창이다
      const clearSocket = readings.some((r) => r.kind === 'socket' && r.level !== null && r.weapon !== null)
      // 스킬 이름을 하나도 못 맞췄으면 그런 창만 남긴다 (이름은 '수정'에서 넣는다)
      if (skills.every((s) => s.skillId === null) && !clearSocket) continue
      const rarity = decideRarity(
        parseRarity(await readLine(prepareLine(brightness(img, panel.rarityDigit)), DIGITS)),
        rarityFromTextColor(img, panel.rarityText),
        readings.some((r) => r.kind === 'socket' && r.weapon === true),
      )
      const resolved = resolveSlots(readings, rarity.value)
      // 스킬·슬롯·레어도 중 확실한 것이 하나도 없으면 레벨 칸을 닮은 다른 것을 잡은 것이다 (장비 상자 아이콘, 화면 아래 버튼 등)
      if (!skills.some((s) => s.skillId !== null && !s.unsure) && !resolved.sure && !rarity.sure) continue
      out.push({
        bounds: panel.bounds,
        rarity: rarity.value ?? resolved.rarity,
        rarityUnsure: !rarity.sure,
        skills,
        slots: resolved.slots,
        slotsUnsure: !resolved.sure,
      })
    }
    return out
  }

  private matchSkill(text: string, level: number, maxLevel: number | null): ScannedSkill {
    // 레벨이 최대 레벨을 넘는 스킬은 뺀다. 칸 수로 읽은 최대 레벨이 같은 스킬을 앞세운다 (예: 'KO술'(3) vs '체술'(5))
    const fits = (id: number) => (this.maxLevels.get(id) ?? 0) >= level
    const any = this.matcher.match(text, fits)
    const exact =
      maxLevel !== null ? this.matcher.match(text, (id) => fits(id) && this.maxLevels.get(id) === maxLevel) : null
    const best = exact && any && exact.score >= any.score - 0.15 ? exact : any
    if (!best || best.score < 0.5) return { skillId: null, level, text, unsure: true }
    const maxMatches = maxLevel === null || this.maxLevels.get(best.id) === maxLevel
    const unsure = best.score < 0.75 || (best === any && best.margin < 0.12) || !maxMatches
    return { skillId: best.id, level, text, unsure }
  }
}
