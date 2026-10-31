// 스크린샷에서 호석(장비) '상세' 창 찾기. 스킬 레벨 칸(주황 ■)을 기준점으로 스킬 이름·레어도·슬롯 위치를 계산한다
import type { Rect, RgbaImage } from './image'

/**
 * 기준 해상도(1280×720)에서 잰 창 안 위치. 기준점은 첫 스킬 줄 첫 레벨 칸의 왼쪽 위.
 * 다른 해상도는 줄 간격(줄이 하나면 레벨 칸 간격)으로 구한 배율(unit)을 곱한다. 장비 변경·감정 결과·마카 연금·
 * 장비 확인/매각 화면에서 같다. 칸 간격 : 줄 간격 = 0.300 (일본어판 720p, 한국어판 1440p·1080p 무게중심으로 잼)
 */
const REF = {
  pipPitch: 12,
  pipSize: 6.5,
  rowPitch: 40,
  skillName: { x: -6, y: -25, width: 160, height: 21 },
  /** 스킬 줄인지 볼 때 흰 글자를 세는 이름 앞부분 (두 글자 이름도 이름 칸 전체로 재면 글자 비율이 너무 작다) */
  skillNameStart: { x: -6, y: -25, width: 64, height: 21 },
  /** 줄 오른쪽 끝 'Lv3' (최대 레벨이면 금색) */
  levelText: { x: 148, y: -3, width: 30, height: 13 },
  /** 'RARE 8' 의 숫자 칸 (오른쪽 정렬). 한국어 OCR 모델은 'RARE' 를 잘 못 읽어서 숫자만 읽는다 */
  rarityDigit: { x: 162, y: -107, width: 20, height: 18 },
  /** 'RARE 8' 글자 전체 (글자 색 = 레어도 색) */
  rarityText: { x: 118, y: -105, width: 60, height: 14 },
  /** 슬롯 세 칸의 가운데 x. 빈 칸은 '—'. 소켓은 기준 -83~-66 (한국어판 1440p 는 -81~-65 라 아래로 여유를 둔다) */
  slotCenters: [111, 137, 163],
  slot: { width: 26, y: -89, height: 26 },
  /** 미리보기로 보여 줄 창 영역 (아래쪽은 마지막 스킬 줄에서 extraBottom 만큼) */
  bounds: { x: -48, y: -140, width: 232, extraBottom: 14 },
} as const

export interface ScanRow {
  /** 채워진 레벨 칸 수 = 스킬 레벨 */
  level: number
  /** 전체 칸 수 = 스킬 최대 레벨 (빈 칸을 못 읽으면 null) */
  maxLevel: number | null
  name: Rect
}

export interface ScanPanel {
  /** 기준 해상도 1px 이 이 이미지에서 몇 px 인지 */
  unit: number
  rows: ScanRow[]
  rarityDigit: Rect
  rarityText: Rect
  slots: Rect[]
  bounds: Rect
}

interface Blob {
  x: number
  y: number
  w: number
  h: number
  /** 무게중심. 칸 간격·줄 간격·기준점은 이것으로 잰다 (경계는 JPEG 번짐으로 칸마다 1px 씩 달라 720p 에서 배율이 2~3% 틀린다) */
  cx: number
  cy: number
}

interface FoundRow {
  x: number
  y: number
  unit: number
  level: number
  maxLevel: number | null
}

function isPipColor(r: number, g: number, b: number): boolean {
  return r >= 150 && r - b >= 80 && g >= 0.45 * r && g <= 0.85 * r
}

/** 주황 픽셀 덩어리 중 꽉 찬 작은 정사각형만 (레벨 칸 후보) */
function findPipBlobs(img: RgbaImage): Blob[] {
  const { width, height, data } = img
  const seen = new Uint8Array(width * height)
  const stack: number[] = []
  const out: Blob[] = []
  const visit = (j: number) => {
    if (seen[j]) return
    const q = j * 4
    if (!isPipColor(data[q], data[q + 1], data[q + 2])) return
    seen[j] = 1
    stack.push(j)
  }
  for (let start = 0; start < width * height; start++) {
    if (seen[start]) continue
    const p = start * 4
    if (!isPipColor(data[p], data[p + 1], data[p + 2])) continue
    seen[start] = 1
    stack.push(start)
    let minX = width
    let maxX = 0
    let minY = height
    let maxY = 0
    let n = 0
    let sumX = 0
    let sumY = 0
    while (stack.length > 0) {
      const i = stack.pop()!
      const x = i % width
      const y = (i - x) / width
      n++
      sumX += x
      sumY += y
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      if (x > 0) visit(i - 1)
      if (x < width - 1) visit(i + 1)
      if (y > 0) visit(i - width)
      if (y < height - 1) visit(i + width)
    }
    const w = maxX - minX + 1
    const h = maxY - minY + 1
    if (w < 4 || h < 4 || w > 64 || h > 64) continue
    if (w / h < 0.7 || w / h > 1.45 || n / (w * h) < 0.6) continue
    out.push({ x: minX, y: minY, w, h, cx: sumX / n + 0.5, cy: sumY / n + 0.5 })
  }
  return out
}

/** 같은 높이에 일정한 간격으로 이어진 레벨 칸 묶음 (왼쪽부터) */
function groupRuns(blobs: readonly Blob[]): Blob[][] {
  const sorted = [...blobs].sort((a, b) => a.x - b.x)
  const used = new Set<Blob>()
  const runs: Blob[][] = []
  for (const first of sorted) {
    if (used.has(first)) continue
    const run = [first]
    used.add(first)
    for (let last = first; ;) {
      const size = (last.w + last.h) / 2
      const next = sorted.find(
        (b) =>
          !used.has(b) &&
          Math.abs(b.y + b.h / 2 - (last.y + last.h / 2)) <= size * 0.35 &&
          Math.abs(b.h - last.h) <= Math.max(2, size * 0.35) &&
          b.x - last.x >= size * 1.4 &&
          b.x - last.x <= size * 2.4,
      )
      if (!next) break
      run.push(next)
      used.add(next)
      last = next
    }
    runs.push(run)
  }
  return runs
}

function pixelRange(img: RgbaImage, area: Rect) {
  return {
    x0: Math.max(0, Math.floor(area.x)),
    y0: Math.max(0, Math.floor(area.y)),
    x1: Math.min(img.width, Math.ceil(area.x + area.width)),
    y1: Math.min(img.height, Math.ceil(area.y + area.height)),
  }
}

function meanLuminance(img: RgbaImage, area: Rect): number {
  const { x0, y0, x1, y1 } = pixelRange(img, area)
  let sum = 0
  let n = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++, n++) {
      const i = (y * img.width + x) * 4
      sum += 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]
    }
  }
  return n ? sum / n : 0
}

/** 글자 픽셀 비율. white: 세 채널 모두 밝음(흰 글자), 아니면 가장 밝은 채널(금색 'Lv' 글자 포함) */
function textRatio(img: RgbaImage, area: Rect, white: boolean): number {
  const { x0, y0, x1, y1 } = pixelRange(img, area)
  let count = 0
  let n = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++, n++) {
      const i = (y * img.width + x) * 4
      const r = img.data[i]
      const g = img.data[i + 1]
      const b = img.data[i + 2]
      if (white ? Math.min(r, g, b) >= 165 : Math.max(r, g, b) >= 175) count++
    }
  }
  return n ? count / n : 0
}

/** 채워진 칸 뒤로 이어지는 어두운 빈 칸까지 세어 최대 레벨을 구한다. 배경이 너무 어두워 못 가리면 null */
function measureMaxLevel(img: RgbaImage, run: readonly Blob[], pitch: number): number | null {
  const first = run[0]
  const last = run[run.length - 1]
  const size = (last.w + last.h) / 2
  const around =
    (meanLuminance(img, { x: first.x, y: last.y - size * 0.6, width: pitch * 8, height: size * 0.3 }) +
      meanLuminance(img, { x: first.x, y: last.y + last.h + size * 0.3, width: pitch * 8, height: size * 0.3 })) /
    2
  if (around < 18) return null
  const start = last.x + last.w
  let end = start
  let gap = 0
  for (let x = start; x < start + pitch * 8; x++) {
    const lum = meanLuminance(img, { x, y: last.y + last.h * 0.2, width: 1, height: last.h * 0.6 })
    if (lum < around * 0.75 && around - lum >= 6) {
      end = x + 1
      gap = 0
    } else if (++gap > pitch * 0.6) break
  }
  return run.length + Math.round((end - start) / pitch)
}

/**
 * 칸이 하나뿐인 줄의 칸 간격 = 채운 칸 무게중심에서 바로 뒤 빈 칸(가장 어두운 네모) 가운데까지.
 * 칸 크기로 짐작하면 JPEG 번짐 때문에 3~8% 틀려 슬롯 칸이 어긋난다. 빈 칸이 없으면(최대 레벨) null
 */
function pitchToEmptyPip(img: RgbaImage, pip: Blob): number | null {
  const size = (pip.w + pip.h) / 2
  const band = { y: pip.y + pip.h * 0.2, height: Math.max(1, pip.h * 0.6) }
  const x0 = pip.x + pip.w
  const x1 = Math.min(img.width, Math.floor(pip.cx + size * 3.2))
  const lums: number[] = []
  for (let x = x0; x < x1; x++) lums.push(meanLuminance(img, { x, ...band, width: 1 }))
  if (lums.length === 0) return null
  const around =
    (meanLuminance(img, { x: x0, y: pip.y - size * 0.6, width: x1 - x0, height: size * 0.3 }) +
      meanLuminance(img, { x: x0, y: pip.y + pip.h + size * 0.3, width: x1 - x0, height: size * 0.3 })) /
    2
  const darkest = Math.min(...lums)
  if (around - darkest < 8) return null
  // 빈 칸 사이 틈도 어둡지만 빈 칸 속만큼은 아니다 (1440p: 칸 14, 틈 17~24, 띠 26~35)
  const cut = darkest + (around - darkest) * 0.35
  let best: [number, number] | null = null
  let start = -1
  for (let i = 0; i <= lums.length; i++) {
    const dark = i < lums.length && lums[i] <= cut
    if (dark && start < 0) start = i
    if (!dark && start >= 0) {
      if (!best || i - start > best[1] - best[0]) best = [start, i]
      start = -1
    }
  }
  if (!best || best[1] - best[0] < size * 0.5) return null
  const pitch = x0 + (best[0] + best[1]) / 2 - pip.cx
  return pitch >= size * 1.4 && pitch <= size * 2.4 ? pitch : null
}

function place(r: { x: number; y: number; width: number; height: number }, ox: number, oy: number, unit: number): Rect {
  return { x: ox + r.x * unit, y: oy + r.y * unit, width: r.width * unit, height: r.height * unit }
}

/** 레벨 칸 묶음이 스킬 줄이면 그 기준점·배율 (오른쪽 끝 'Lv' 글자와 위쪽 스킬 이름 글자가 있어야 한다) */
function toRow(img: RgbaImage, run: readonly Blob[]): FoundRow | null {
  const first = run[0]
  const last = run[run.length - 1]
  const size = run.reduce((s, b) => s + (b.w + b.h) / 2, 0) / run.length
  const pitch =
    run.length > 1
      ? (last.cx - first.cx) / (run.length - 1)
      : (pitchToEmptyPip(img, first) ?? (size * REF.pipPitch) / REF.pipSize)
  const unit = pitch / REF.pipPitch
  // 기준점(첫 칸 왼쪽 위)은 칸 무게중심에서 구한다 (JPEG 번짐으로 칸마다 1px 씩 다른 경계보다 안정적)
  const x = first.cx - (REF.pipSize / 2) * unit
  const y = run.reduce((s, b) => s + b.cy, 0) / run.length - (REF.pipSize / 2) * unit
  const levelText = textRatio(img, place(REF.levelText, x, y, unit), false)
  const nameText = textRatio(img, place(REF.skillNameStart, x, y, unit), true)
  if (levelText < 0.04 || nameText < 0.02 || nameText > 0.6) return null
  return { x, y, unit, level: run.length, maxLevel: measureMaxLevel(img, run, pitch) }
}

/** 스크린샷에서 호석(장비) 상세 창들을 찾는다. 위에서 아래, 왼쪽에서 오른쪽 순 */
export function findPanels(img: RgbaImage): ScanPanel[] {
  const rows = groupRuns(findPipBlobs(img))
    .map((run) => toRow(img, run))
    .filter((row): row is FoundRow => row !== null)
    .sort((a, b) => a.y - b.y || a.x - b.x)
  // 같은 창의 줄: 왼쪽 끝이 맞고 세로 간격이 스킬 줄 간격
  const groups: FoundRow[][] = []
  for (const row of rows) {
    const group = groups.find((g) => {
      const prev = g[g.length - 1]
      return (
        Math.abs(row.x - prev.x) <= 3 * prev.unit &&
        Math.abs(row.y - prev.y - REF.rowPitch * prev.unit) <= 5 * prev.unit
      )
    })
    if (group) group.push(row)
    else groups.push([row])
  }
  return groups.map((group) => {
    // 배율: 줄이 둘 이상이면 줄 간격, 아니면 레벨 칸 간격(칸이 하나면 칸 크기)으로
    const first = group[0]
    const last = group[group.length - 1]
    const unit = group.length > 1 ? (last.y - first.y) / ((group.length - 1) * REF.rowPitch) : first.unit
    const { x, y } = first
    return {
      unit,
      rows: group.map((r) => ({ level: r.level, maxLevel: r.maxLevel, name: place(REF.skillName, r.x, r.y, unit) })),
      rarityDigit: place(REF.rarityDigit, x, y, unit),
      rarityText: place(REF.rarityText, x, y, unit),
      slots: REF.slotCenters.map((cx) =>
        place(
          { x: cx - REF.slot.width / 2, y: REF.slot.y, width: REF.slot.width, height: REF.slot.height },
          x,
          y,
          unit,
        ),
      ),
      bounds: {
        x: x + REF.bounds.x * unit,
        y: y + REF.bounds.y * unit,
        width: REF.bounds.width * unit,
        height: last.y - y + (REF.bounds.extraBottom - REF.bounds.y) * unit,
      },
    }
  })
}
