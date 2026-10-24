import { describe, expect, it } from 'vitest'
import { loadTestDb, skillIdByName } from '../../test/testDb'
import type { Slot } from '../types'
import type { RgbaImage } from './image'
import { findPanels } from './layout'
import { decideRarity, parseRarity, TalismanScanner } from './scan'
import { readSlot, resolveSlots, type SlotReading } from './slots'

// 게임 화면을 흉내 낸 단순한 그림 (실제 스크린샷은 저장소에 넣지 않는다). 위치는 layout.ts 의 기준 위치와 같다
type Rgb = [number, number, number]
const BG: Rgb = [40, 34, 20]
const BAND: Rgb = [48, 41, 27]
const WHITE: Rgb = [240, 238, 232]
const PIP: Rgb = [225, 150, 60]
const EMPTY_PIP: Rgb = [20, 18, 12]
const SOCKET: Rgb = [105, 100, 92]
const HOLE: Rgb = [30, 26, 20]
const WEAPON_MARK: Rgb = [235, 205, 215]
const ARMOR_MARK: Rgb = [190, 205, 228]
const RARE_8: Rgb = [225, 110, 80]
const RARE_6: Rgb = [80, 95, 225]

interface PanelSpec {
  /** 스킬 줄: 레벨(채운 칸)·최대 레벨(전체 칸) */
  rows: { level: number; maxLevel: number }[]
  /** 슬롯 세 칸 (null = '—') */
  slots: ({ level: 1 | 2 | 3; weapon: boolean } | null)[]
  rarityColor: Rgb
}

class Canvas implements RgbaImage {
  readonly width: number
  readonly height: number
  readonly data: Uint8ClampedArray
  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.data = new Uint8ClampedArray(width * height * 4)
    this.fill(0, 0, width, height, BG)
  }

  fill(x: number, y: number, w: number, h: number, [r, g, b]: Rgb) {
    for (let yy = Math.round(y); yy < Math.round(y + h); yy++) {
      for (let xx = Math.round(x); xx < Math.round(x + w); xx++) {
        if (xx < 0 || yy < 0 || xx >= this.width || yy >= this.height) continue
        this.data.set([r, g, b, 255], (yy * this.width + xx) * 4)
      }
    }
  }

  /** 기준점 (ox, oy), 배율 u 로 호석 상세 창 하나를 그린다 */
  panel(ox: number, oy: number, u: number, spec: PanelSpec) {
    spec.rows.forEach(({ level, maxLevel }, i) => {
      const y = oy + 39.5 * u * i
      this.fill(ox - 40 * u, y - 28 * u, 222 * u, 40 * u, BAND)
      for (let k = 0; k < 5; k++) this.fill(ox + k * 7 * u, y - 20 * u, 2.5 * u, 10 * u, WHITE)
      for (let k = 0; k < maxLevel; k++) this.fill(ox + k * 12.2 * u, y, 6.5 * u, 6.5 * u, k < level ? PIP : EMPTY_PIP)
      for (let k = 0; k < 3; k++) this.fill(ox + (155 + k * 7) * u, y - u, 2 * u, 9 * u, WHITE)
    })
    for (let k = 0; k < 6; k++) this.fill(ox + (124 + k * 8) * u, oy - 103 * u, 3 * u, 9 * u, spec.rarityColor)
    spec.slots.forEach((slot, i) => {
      const x = ox + ([111, 137, 163][i] - 13) * u
      const y = oy - 89 * u
      if (!slot) {
        this.fill(x + 6 * u, y + 10 * u, 14 * u, 3 * u, [120, 118, 110])
        return
      }
      this.fill(x + 2 * u, y + 3 * u, 17 * u, 18 * u, SOCKET)
      const holes = { 1: [0.5], 2: [0.25, 0.75], 3: [0.2, 0.5, 0.8] }[slot.level]
      for (const at of holes) this.fill(x + 2 * u + at * 17 * u - 1.5 * u, y + 17 * u, 3 * u, 3 * u, HOLE)
      this.fill(x + 18 * u, y + u, 6 * u, 8 * u, slot.weapon ? WEAPON_MARK : ARMOR_MARK)
    })
  }
}

const RARE8_SPEC: PanelSpec = {
  rows: [
    { level: 3, maxLevel: 5 },
    { level: 1, maxLevel: 1 },
  ],
  slots: [
    { level: 1, weapon: true },
    { level: 1, weapon: false },
    { level: 1, weapon: false },
  ],
  rarityColor: RARE_8,
}

const RARE6_SPEC: PanelSpec = {
  rows: [
    { level: 2, maxLevel: 2 },
    { level: 3, maxLevel: 5 },
    { level: 1, maxLevel: 3 },
  ],
  slots: [{ level: 2, weapon: false }, { level: 1, weapon: false }, null],
  rarityColor: RARE_6,
}

const label = (r: SlotReading) => (r.kind === 'none' ? '-' : `${r.weapon ? 'W' : 'A'}${r.level}`)

describe('호석 상세 창 찾기', () => {
  for (const u of [1, 1.5, 3]) {
    it(`배율 ${u}: 스킬 줄의 레벨·최대 레벨, 슬롯, 레어도 색을 읽는다`, () => {
      const canvas = new Canvas(Math.round(1280 * u), Math.round(720 * u))
      canvas.panel(300 * u, 265 * u, u, RARE8_SPEC)
      canvas.panel(800 * u, 265 * u, u, RARE6_SPEC)
      const panels = findPanels(canvas)
      expect(panels).toHaveLength(2)
      const [left, right] = panels.sort((a, b) => a.bounds.x - b.bounds.x)
      expect(left.unit).toBeCloseTo(u, 1)
      expect(left.rows.map((r) => [r.level, r.maxLevel])).toEqual([
        [3, 5],
        [1, 1],
      ])
      expect(right.rows.map((r) => [r.level, r.maxLevel])).toEqual([
        [2, 2],
        [3, 5],
        [1, 3],
      ])
      expect(left.slots.map((s) => label(readSlot(canvas, s)))).toEqual(['W1', 'A1', 'A1'])
      expect(right.slots.map((s) => label(readSlot(canvas, s)))).toEqual(['A2', 'A1', '-'])
    })
  }

  it('Lv3 슬롯은 구멍 셋', () => {
    const canvas = new Canvas(1920, 1080)
    canvas.panel(500, 400, 1.5, { ...RARE6_SPEC, slots: [{ level: 3, weapon: false }, null, null] })
    const [panel] = findPanels(canvas)
    expect(panel.slots.map((s) => label(readSlot(canvas, s)))).toEqual(['A3', '-', '-'])
  })

  it('레벨 칸이 없으면 창을 찾지 않는다', () => {
    const canvas = new Canvas(640, 360)
    canvas.fill(100, 100, 7, 7, PIP)
    expect(findPanels(canvas)).toEqual([])
  })
})

describe('감정 호석 규칙에 맞추기', () => {
  const socket = (level: 1 | 2 | 3 | null, weapon: boolean | null): SlotReading => ({ kind: 'socket', level, weapon })
  const none: SlotReading = { kind: 'none' }
  const slots = (...list: [Slot['kind'], 1 | 2 | 3][]) => list.map(([kind, level]) => ({ kind, level }))

  it('레어도를 알면 그 레어도의 조합 중 가장 가까운 것', () => {
    expect(resolveSlots([socket(1, true), socket(1, false), socket(1, false)], 8)).toEqual({
      slots: slots(['weapon', 1], ['armor', 1], ['armor', 1]),
      sure: true,
      rarity: 8,
    })
    // 레벨을 못 읽어도 레어도 7 의 두 칸 조합은 [1, 1] 뿐이다 (확실하지는 않음)
    expect(resolveSlots([socket(null, false), socket(null, false), none], 7)).toEqual({
      slots: slots(['armor', 1], ['armor', 1]),
      sure: false,
      rarity: 7,
    })
  })

  it('레어도를 몰라도 다 읽었고 규칙에 있는 조합이면 확실하다', () => {
    expect(resolveSlots([socket(2, false), socket(1, false), none], null)).toEqual({
      slots: slots(['armor', 2], ['armor', 1]),
      sure: true,
      rarity: null, // 레어도 5·6 둘 다 가능
    })
    expect(resolveSlots([socket(3, false), none, none], null).sure).toBe(true)
    expect(resolveSlots([socket(3, false), socket(2, false), none], null).sure).toBe(false)
    // 무기 슬롯이 있으면 레어도 8
    expect(resolveSlots([socket(null, true), none, none], null)).toMatchObject({
      slots: slots(['weapon', 1]),
      rarity: 8,
    })
  })

  it('레어도 = 숫자 OCR·글자 색·무기 슬롯', () => {
    const blue = { rarity: 6, verified: true }
    const teal = { rarity: 5, verified: false }
    expect(parseRarity('RARE 8')).toBe(8)
    expect(parseRarity('03')).toBeNull()
    expect(decideRarity(6, blue, false)).toEqual({ value: 6, sure: true })
    expect(decideRarity(8, blue, false)).toEqual({ value: 6, sure: false })
    expect(decideRarity(null, blue, false)).toEqual({ value: 6, sure: true })
    expect(decideRarity(5, teal, false)).toEqual({ value: 5, sure: true })
    expect(decideRarity(null, teal, false)).toEqual({ value: 5, sure: false })
    expect(decideRarity(6, null, true)).toEqual({ value: 8, sure: false })
    expect(decideRarity(8, null, false)).toEqual({ value: 8, sure: false })
  })
})

describe('TalismanScanner', () => {
  const db = loadTestDb()
  const skills = db.data.skills
    .filter((s) => s.kind === 'armor' || s.kind === 'weapon')
    .map((s) => ({ id: s.id, name: s.name.ko, maxLevel: s.maxLevel }))
  const scanner = new TalismanScanner(skills)

  /** 부른 순서대로 답하는 가짜 OCR (스킬 이름 줄들 → 레어도 숫자 순서로 읽는다) */
  const reader = (answers: string[]) => {
    const queue = [...answers]
    return async () => queue.shift() ?? ''
  }

  it('스크린샷의 호석 창을 스킬·레벨·슬롯·레어도로 바꾼다', async () => {
    const canvas = new Canvas(1920, 1080)
    canvas.panel(500, 400, 1.5, {
      ...RARE8_SPEC,
      rows: [
        { level: 3, maxLevel: 5 },
        { level: 1, maxLevel: 5 },
      ],
    })
    const [talisman, ...rest] = await scanner.scan(canvas, reader(['간파', '연격', '8']))
    expect(rest).toEqual([])
    expect(talisman.skills).toEqual([
      { skillId: skillIdByName(db, '간파'), level: 3, text: '간파', unsure: false },
      { skillId: skillIdByName(db, '연격'), level: 1, text: '연격', unsure: false },
    ])
    expect(talisman.rarity).toBe(8)
    expect(talisman.rarityUnsure).toBe(false)
    expect(talisman.slots).toEqual([
      { kind: 'weapon', level: 1 },
      { kind: 'armor', level: 1 },
      { kind: 'armor', level: 1 },
    ])
    expect(talisman.slotsUnsure).toBe(false)
  })

  it('이름이 애매하면 확인 필요로 표시하고, 레벨 칸만 닮은 것은 버린다', async () => {
    const canvas = new Canvas(1920, 1080)
    canvas.panel(500, 400, 1.5, RARE6_SPEC)
    const [talisman] = await scanner.scan(canvas, reader(['피리명인', '재난대처능럭', '술', '6']))
    expect(talisman.skills.slice(0, 2).map((s) => [s.skillId, s.unsure])).toEqual([
      [skillIdByName(db, '피리 명인'), false],
      [skillIdByName(db, '재난대처능력'), false],
    ])
    // '술' 만 읽힌 줄: 칸 수(최대 3)에 맞는 '…술' 스킬 중 하나로 두되 확인 필요
    const guess = talisman.skills[2]
    expect(guess.unsure).toBe(true)
    expect(db.skill(guess.skillId!).maxLevel).toBe(3)
    expect(talisman.rarity).toBe(6)
    // 이름을 하나도 못 읽어도 슬롯이 또렷한 창은 남긴다 ('수정'에서 넣도록)
    const [unread] = await scanner.scan(canvas, reader(['', '', '', '6']))
    expect(unread.skills.map((s) => s.skillId)).toEqual([null, null, null])
    expect(unread.slots).toEqual([
      { kind: 'armor', level: 2 },
      { kind: 'armor', level: 1 },
    ])
    // 레벨 칸만 있고 이름·슬롯이 없으면 호석 창이 아니다
    const blank = new Canvas(1920, 1080)
    blank.panel(500, 400, 1.5, { ...RARE6_SPEC, slots: [null, null, null] })
    expect(await scanner.scan(blank, reader(['', '', '', '']))).toEqual([])
    // 이름이 애매하게 하나 맞아도 슬롯·레어도까지 모두 확실하지 않으면 버린다
    const vague = new Canvas(1920, 1080)
    vague.panel(500, 400, 1.5, {
      rows: [{ level: 1, maxLevel: 3 }],
      slots: [null, null, null],
      rarityColor: [120, 120, 120],
    })
    expect(await scanner.scan(vague, reader(['술', '']))).toEqual([])
  })
})
