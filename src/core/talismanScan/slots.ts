// 호석 상세 창의 슬롯·레어도 판독: 소켓 유무, 슬롯 레벨(아래쪽 삼각형 개수), 무기/방어구(오른쪽 위 작은 그림 색),
// 'RARE N' 글자 색. 레벨 칸 기준 위치(layout.ts)로 자른 칸을 받는다
import { APPRAISED_SLOT_PATTERNS, RARITY_TEXT_HUES, WEAPON_SLOT_RARITY } from '../appraisedTalisman'
import type { Slot } from '../types'
import { clampRect, type Rect, type RgbaImage } from './image'

export type SlotReading = { kind: 'none' } | { kind: 'socket'; level: 1 | 2 | 3 | null; weapon: boolean | null }

interface Pixel {
  lum: number
  sat: number
  r: number
  b: number
}

type PixelAt = (x: number, y: number) => Pixel

function pixelsOf(img: RgbaImage, area: Rect): { w: number; h: number; at: PixelAt } {
  const rect = clampRect(area, img.width, img.height)
  return {
    w: rect.width,
    h: rect.height,
    at: (x, y) => {
      const i = ((rect.y + y) * img.width + rect.x + x) * 4
      const r = img.data[i]
      const g = img.data[i + 1]
      const b = img.data[i + 2]
      const max = Math.max(r, g, b)
      return { lum: 0.299 * r + 0.587 * g + 0.114 * b, sat: max ? (max - Math.min(r, g, b)) / max : 0, r, b }
    },
  }
}

/** 슬롯 칸 하나 (기준 26×23: 왼쪽 0.8 이 소켓, 오른쪽 위가 무기/방어구 표시) */
export function readSlot(img: RgbaImage, area: Rect): SlotReading {
  const { w, h, at } = pixelsOf(img, area)
  if (w < 8 || h < 8) return { kind: 'none' }
  // 소켓 몸통(회색) 줄. 오른쪽 위 표시와 겹치지 않게 왼쪽 절반만 본다
  const x0 = Math.floor(w * 0.08)
  const x1 = Math.ceil(w * 0.5)
  const isBody: boolean[] = []
  for (let y = 0; y < h; y++) {
    let n = 0
    for (let x = x0; x < x1; x++) {
      const p = at(x, y)
      if (p.lum >= 55 && p.lum <= 200 && p.sat < 0.35) n++
    }
    isBody.push(n >= (x1 - x0) * 0.25)
  }
  // 가운데에서 가장 가까운 몸통 줄부터 위아래로 넓힌다 (Lv2·3 소켓은 가운데가 넓게 비어 가운데 줄이 몸통이 아닐 수 있다).
  // 위쪽은 한 줄 끊김을 넘어가고, 아래쪽 끝 다음은 어두운 배경이라 넘지 않는다 (넘으면 아래 테두리까지 잡힌다)
  const mid = Math.floor(h / 2)
  let start = -1
  for (let d = 0; d <= h * 0.2 && start < 0; d++) {
    if (isBody[mid + d]) start = mid + d
    else if (isBody[mid - d]) start = mid - d
  }
  if (start < 0) return { kind: 'none' }
  let top = start
  while (top - 1 >= 0 && (isBody[top - 1] || (top - 2 >= 0 && isBody[top - 2]))) top -= isBody[top - 1] ? 1 : 2
  let bottom = start
  while (bottom + 1 < h && isBody[bottom + 1]) bottom++
  // 소켓은 칸 높이의 대부분을 차지하고, 빈 칸('—')은 가운데 가는 막대뿐이다
  if (bottom - top + 1 < h * 0.55) return { kind: 'none' }
  return { kind: 'socket', level: readLevel(w, top, bottom, at), weapon: readWeapon(w, h, at) }
}

/** 소켓 아래쪽 삼각형 줄의 구멍(빈 슬롯은 어둡고, 장식주가 들면 그 색) 개수 = 슬롯 레벨 */
function readLevel(w: number, top: number, bottom: number, at: PixelAt): 1 | 2 | 3 | null {
  const span = bottom - top
  const y0 = Math.round(bottom - span * 0.22)
  const y1 = Math.max(y0 + 1, Math.round(bottom - span * 0.04))
  const bodyW = Math.round(w * 0.8)
  // 열마다 삼각형 줄의 평균 밝기와 가장 어두운 두 줄의 평균 (구멍은 한두 줄 높이라 평균에는 묻힌다)
  const mean: number[] = []
  const dark: number[] = []
  const colorful: boolean[] = []
  for (let x = 0; x < bodyW; x++) {
    const lums: number[] = []
    let sat = 0
    for (let y = y0; y <= y1; y++) {
      const p = at(x, y)
      lums.push(p.lum)
      if (p.lum > 60) sat = Math.max(sat, p.sat)
    }
    mean.push(lums.reduce((a, b) => a + b, 0) / lums.length)
    lums.sort((a, b) => a - b)
    dark.push((lums[0] + lums[Math.min(1, lums.length - 1)]) / 2)
    colorful.push(sat >= 0.45)
  }
  // 소켓 몸통의 좌우 끝 (바깥은 어두운 배경)
  const left = mean.findIndex((v) => v >= 60)
  const right = mean.length - 1 - [...mean].reverse().findIndex((v) => v >= 60)
  if (left < 0 || right - left < bodyW * 0.4) return null
  const body = mean
    .slice(left, right + 1)
    .filter((v) => v >= 60)
    .sort((a, b) => a - b)
  const bodyLum = body[Math.floor(body.length / 2)]
  // 테두리 두께만큼 안쪽에서 구멍을 센다
  const edge = Math.max(1, Math.round((right - left) * 0.08))
  const runs: [number, number][] = []
  let runStart = -1
  for (let x = left + edge; x <= right - edge + 1; x++) {
    const hole = x <= right - edge && (dark[x] < bodyLum * 0.6 || colorful[x])
    if (hole && runStart < 0) runStart = x
    if (!hole && runStart >= 0) {
      runs.push([runStart, x - 1])
      runStart = -1
    }
  }
  // 한 픽셀짜리 잡음은 큰 화면에서만 버린다 (720p 에서는 구멍이 1~2px)
  const minRun = right - left >= 24 ? 2 : 1
  const holes = runs.filter(([a, b]) => b - a + 1 >= minRun)
  if (holes.length < 1 || holes.length > 3) return null
  const pos = holes.map(([a, b]) => ((a + b) / 2 - left) / Math.max(1, right - left))
  // 하나면 가운데, 둘이면 양쪽에 있어야 한다
  if (holes.length === 1 && (pos[0] < 0.3 || pos[0] > 0.7)) return null
  if (holes.length === 2 && (pos[0] > 0.45 || pos[1] < 0.55)) return null
  return holes.length as 1 | 2 | 3
}

/** 오른쪽 위 작은 그림: 무기 슬롯은 분홍빛 칼, 방어구 슬롯은 푸른빛 투구 */
function readWeapon(w: number, h: number, at: PixelAt): boolean | null {
  let n = 0
  let tint = 0
  for (let y = 0; y < Math.round(h * 0.62); y++) {
    for (let x = Math.floor(w * 0.55); x < w; x++) {
      const p = at(x, y)
      if (p.lum < 150) continue
      n++
      tint += p.r - p.b
    }
  }
  if (n < 6) return null
  if (tint / n > 5) return true
  if (tint / n < -2) return false
  return null
}

export interface ResolvedSlots {
  slots: Slot[]
  /** 감정 호석 규칙과 읽은 값이 딱 맞음 */
  sure: boolean
  /** 슬롯으로 짐작한 레어도 (무기 슬롯이면 8, 한 레어도에만 있는 조합이면 그 레어도) */
  rarity: number | null
}

const slotsKey = (slots: readonly Slot[]) => slots.map((s) => `${s.kind}${s.level}`).join(',')

/**
 * 읽은 슬롯을 감정 호석 규칙에 맞춘다. 레어도를 알면 그 레어도의 조합 중 가장 가까운 것,
 * 모르면 읽은 그대로(레벨을 못 읽은 칸은 1). 다 읽었고 규칙에 있는 조합이면 확실하다고 본다.
 */
export function resolveSlots(readings: readonly SlotReading[], rarity: number | null): ResolvedSlots {
  const sockets = readings.filter((r) => r.kind === 'socket')
  const guessedRarity = rarity ?? (sockets.some((s) => s.weapon === true) ? WEAPON_SLOT_RARITY : null)
  const patterns = guessedRarity !== null ? APPRAISED_SLOT_PATTERNS[guessedRarity] : undefined
  if (!patterns) {
    const slots = sockets.map((s): Slot => ({ kind: s.weapon ? 'weapon' : 'armor', level: s.level ?? 1 }))
    const complete = sockets.every((s) => s.level !== null && s.weapon !== null)
    const key = slotsKey(slots)
    const rarities = Object.entries(APPRAISED_SLOT_PATTERNS)
      .filter(([, list]) => list.some((pattern) => slotsKey(pattern) === key))
      .map(([r]) => Number(r))
    return { slots, sure: complete && rarities.length > 0, rarity: rarities.length === 1 ? rarities[0] : guessedRarity }
  }
  let best = patterns[0]
  let bestCost = Infinity
  let ties = 0
  for (const pattern of patterns) {
    let cost = Math.abs(pattern.length - sockets.length) * 4
    pattern.forEach((slot, i) => {
      const s = sockets[i]
      if (!s) return
      if (s.weapon !== null && s.weapon !== (slot.kind === 'weapon')) cost += 2
      cost += s.level === null ? 0.5 : s.level === slot.level ? 0 : 1
    })
    if (cost < bestCost) {
      bestCost = cost
      best = pattern
      ties = 0
    } else if (cost === bestCost) ties++
  }
  return { slots: best.map((s) => ({ ...s })), sure: bestCost === 0 && ties === 0, rarity: guessedRarity }
}

/** 'RARE N' 글자 색(배경 = 중앙값 색에서 많이 먼 픽셀들의 평균 색상)으로 짐작한 레어도 */
export function rarityFromTextColor(img: RgbaImage, area: Rect): { rarity: number; verified: boolean } | null {
  const rect = clampRect(area, img.width, img.height)
  if (rect.width < 4 || rect.height < 4) return null
  const px: [number, number, number][] = []
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      const i = (y * img.width + x) * 4
      px.push([img.data[i], img.data[i + 1], img.data[i + 2]])
    }
  }
  const bg = [0, 1, 2].map((c) => px.map((p) => p[c]).sort((a, b) => a - b)[px.length >> 1])
  const dist = px.map((p) => Math.hypot(p[0] - bg[0], p[1] - bg[1], p[2] - bg[2]))
  const farthest = Math.max(...dist)
  if (farthest < 60) return null
  const cut = Math.max(40, farthest * 0.5)
  let sx = 0
  let sy = 0
  let n = 0
  px.forEach((p, i) => {
    const max = Math.max(...p)
    if (dist[i] < cut || max - Math.min(...p) < max * 0.25) return
    const hue = (rgbHue(p[0], p[1], p[2]) * Math.PI) / 180
    sx += Math.cos(hue)
    sy += Math.sin(hue)
    n++
  })
  // 색이 고르지 않으면(평균 벡터가 짧으면) 글자 색이 아니다
  if (n < 5 || Math.hypot(sx, sy) / n < 0.6) return null
  const hue = (Math.atan2(sy, sx) * 180) / Math.PI
  const match = RARITY_TEXT_HUES.find((h) => inHueRange(hue, h.from, h.to))
  return match ? { rarity: match.rarity, verified: match.verified } : null
}

function rgbHue(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  if (d === 0) return 0
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (h * 60 + 360) % 360
}

function inHueRange(hue: number, from: number, to: number): boolean {
  const norm = (deg: number) => ((deg % 360) + 360) % 360
  const [h, a, b] = [norm(hue), norm(from), norm(to)]
  return a <= b ? h >= a && h < b : h >= a || h < b
}
