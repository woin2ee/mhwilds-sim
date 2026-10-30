// 공유 이미지 배치 (DESIGN.md §8.6). 그릴 것을 좌표가 정해진 목록(DrawOp)으로 만든다.
// 글자 폭은 measure 로 받아 DOM 없이 돈다 (테스트는 가짜 폭, 화면은 캔버스 measureText).
import type { EquipKey, Slot } from '../../core/types'
import { signed } from '../../data/format'
import type { BuildImageModel, ImageBonus, ImageEquip, ImageSkill } from './buildImageModel'

/** index.css 의 색 토큰 이름 (그릴 때 지금 테마의 값을 읽는다) */
export type ColorToken = 'bg' | 'surface' | 'surface-2' | 'line' | 'fg' | 'muted' | 'accent' | 'good' | 'bad'
export interface Paint {
  token: ColorToken
  alpha?: number
}
export interface Font {
  size: number
  weight: 400 | 600 | 700
}

export type DrawOp =
  | { type: 'rect'; x: number; y: number; w: number; h: number; radius: number; fill?: Paint; stroke?: Paint }
  /** 가로 구분선 (높이 1px, 위 끝이 y) */
  | { type: 'line'; x: number; y: number; w: number; paint: Paint }
  /** y 는 글줄의 가운데 (textBaseline = middle) */
  | {
      type: 'text'
      x: number
      y: number
      text: string
      font: Font
      paint: Paint
      align?: 'left' | 'right' | 'center'
      strike?: boolean
    }
  /** 장식주 슬롯 (SlotBadge 와 같은 모양: 방어구 원·무기 마름모, 색 = 레벨). x·y 는 왼쪽 위 */
  | { type: 'slot'; x: number; y: number; size: number; slot: Slot; filled: boolean }
  /** 부위 아이콘 (EquipIcon 과 같은 도형). x·y 는 왼쪽 위 */
  | { type: 'icon'; x: number; y: number; size: number; equip: EquipKey; paint: Paint }

export interface ImageLayout {
  width: number
  height: number
  ops: DrawOp[]
}

export type Measure = (text: string, font: Font) => number

/**
 * 논리 폭(px). 그릴 때 3배로 키워 1260px 이미지가 된다. 휴대폰 화면 폭에 맞춰 보는 세로 이미지라, 넓으면 글자가 작아지고
 * 이름과 값이 멀어져서 내용 폭에 맞춰 좁게 둔다 (처음 540 은 스킬 이름과 레벨 사이가 너무 떴다)
 */
export const IMAGE_WIDTH = 420
/** 이미지 가장자리 여백 */
export const IMAGE_PAD = 14
const CARD_PAD = 14
const CARD_GAP = 12
const CONTENT_W = IMAGE_WIDTH - 2 * IMAGE_PAD - 2 * CARD_PAD

const FONT = {
  title: { size: 20, weight: 700 },
  name: { size: 15, weight: 600 },
  body: { size: 14, weight: 400 },
  bold: { size: 14, weight: 600 },
  small: { size: 13, weight: 400 },
  section: { size: 12, weight: 600 },
  tag: { size: 11, weight: 400 },
  number: { size: 13, weight: 700 },
  value: { size: 14, weight: 700 },
} as const satisfies Record<string, Font>

const FG: Paint = { token: 'fg' }
const MUTED: Paint = { token: 'muted' }
const ACCENT: Paint = { token: 'accent' }

/** 장비 줄: 아이콘 · 부위 · 이름. 아래 줄(스킬·장식주)은 이름 자리부터 */
const ICON = 16
const NAME_X = 56
const SUB_W = CONTENT_W - NAME_X
const SLOT = 16
/** 스킬·방어력·내성은 한 줄에 하나. 값은 오른쪽 끝이 아니라 가장 긴 이름 바로 뒤의 열에 맞춘다 (표처럼) */
const ROW = 22
const COL_GAP = 16
const PIP_W = 8
const PIP_GAP = 2

export function layoutBuildImage(model: BuildImageModel, measure: Measure): ImageLayout {
  const ops: DrawOp[] = []
  const text = (
    x: number,
    y: number,
    value: string,
    font: Font,
    paint: Paint,
    options: { align?: 'left' | 'right' | 'center'; strike?: boolean } = {},
  ) => ops.push({ type: 'text', x, y, text: value, font, paint, ...options })
  const fit = (value: string, font: Font, width: number) => fitText(measure, value, font, width)
  /** 표의 한 열 폭: 가장 넓은 글 (max 를 넘지 않게). 레벨 막대·구분선이 픽셀에 맞게 정수로 */
  const column = (values: readonly string[], font: Font, max = CONTENT_W) =>
    Math.floor(Math.min(max, Math.ceil(Math.max(0, ...values.map((v) => measure(v, font))))))

  /** 작은 테두리 글 상자 (Badge). 폭을 돌려준다 */
  const tag = (x: number, centerY: number, value: string) => {
    const w = measure(value, FONT.tag) + 10
    ops.push({ type: 'rect', x, y: centerY - 9, w, h: 18, radius: 4, fill: { token: 'surface-2' }, stroke: { token: 'line' } })
    text(x + 5, centerY, value, FONT.tag, MUTED)
    return w
  }
  const tagWidth = (value: string) => measure(value, FONT.tag) + 10

  /** 카드 하나: 내용을 그린 뒤 배경을 내용 앞에 끼운다. 다음 y 를 돌려준다 */
  const card = (top: number, content: (x: number, y: number) => number) => {
    const start = ops.length
    const bottom = content(IMAGE_PAD + CARD_PAD, top + CARD_PAD) + CARD_PAD
    ops.splice(start, 0, {
      type: 'rect',
      x: IMAGE_PAD,
      y: top,
      w: IMAGE_WIDTH - 2 * IMAGE_PAD,
      h: bottom - top,
      radius: 10,
      fill: { token: 'surface' },
      stroke: { token: 'line' },
    })
    return bottom
  }

  /** 카드 안 가로 구분선 (아래 칸까지 띄울 높이를 돌려준다) */
  const divider = (x: number, y: number) => {
    ops.push({ type: 'line', x, y: y + 7, w: CONTENT_W, paint: { token: 'line' } })
    return y + 14
  }

  /** 섹션 제목 줄 (제목 뒤에 개수 등). 다음 y 를 돌려준다 */
  const section = (x: number, y: number, title: string, aside?: string) => {
    text(x, y + 9, title, FONT.section, MUTED)
    if (aside) text(x + measure(title, FONT.section) + 6, y + 9, aside, FONT.section, MUTED)
    return y + 24
  }

  /** 폭이 정해진 줄에 왼쪽부터 늘어놓고 넘치면 다음 줄로. 다음 y 를 돌려준다 */
  const flow = (
    x: number,
    y: number,
    width: number,
    rowHeight: number,
    items: { width: number; draw: (x: number, centerY: number) => void }[],
    gap: number,
  ) => {
    let cx = x
    let cy = y
    for (const item of items) {
      if (cx > x && cx + item.width > x + width) {
        cx = x
        cy += rowHeight + 4
      }
      item.draw(cx, cy + rowHeight / 2)
      cx += item.width + gap
    }
    return items.length > 0 ? cy + rowHeight : y
  }

  const equipRow = (x: number, y: number, equip: ImageEquip) => {
    // 첫 줄: 아이콘 · 부위 · 이름 + 표시
    const lineY = y + 11
    ops.push({ type: 'icon', x, y: lineY - ICON / 2, size: ICON, equip: equip.key, paint: MUTED })
    text(x + ICON + 6, lineY, equip.label, FONT.small, MUTED)
    if (equip.name === null) {
      text(x + NAME_X, lineY, '—', FONT.name, MUTED)
      return y + 24
    }
    const nameMax = SUB_W - equip.tags.reduce((sum, t) => sum + tagWidth(t) + 6, 0)
    const name = fit(equip.name, FONT.name, nameMax)
    text(x + NAME_X, lineY, name, FONT.name, equip.unset ? MUTED : FG)
    let tagX = x + NAME_X + measure(name, FONT.name) + 6
    for (const t of equip.tags) tagX += tag(tagX, lineY, t) + 6
    let next = y + 24

    const subX = x + NAME_X
    if (equip.skills) {
      for (const line of wrapText(measure, equip.skills, FONT.small, SUB_W, 2)) {
        text(subX, next + 9, line, FONT.small, MUTED)
        next += 19
      }
      next += 3
    }
    if (equip.bonusSkills.length > 0) {
      const chips = equip.bonusSkills.map((bonus) => {
        const kind = bonus.kind === 'set' ? '시리즈' : '그룹'
        const kindW = measure(kind, FONT.tag)
        const name = fit(bonus.name, FONT.small, SUB_W - kindW - 22)
        const width = kindW + 6 + measure(name, FONT.small) + 14
        return {
          width,
          draw: (cx: number, cy: number) => {
            ops.push({
              type: 'rect',
              x: cx,
              y: cy - 10,
              w: width,
              h: 20,
              radius: 4,
              fill: { token: 'accent', alpha: 0.1 },
              stroke: { token: 'accent', alpha: 0.5 },
            })
            text(cx + 7, cy, kind, FONT.tag, { token: 'accent', alpha: 0.75 })
            text(cx + 7 + kindW + 6, cy, name, FONT.small, ACCENT)
          },
        }
      })
      next = flow(subX, next, SUB_W, 20, chips, 6) + 6
    }
    if (equip.slots.length > 0) {
      const items = equip.slots.map((s) => {
        const label = s.decoration ?? '빈 슬롯'
        const shown = fit(label, FONT.small, SUB_W - SLOT - 4)
        return {
          width: SLOT + 4 + measure(shown, FONT.small),
          draw: (cx: number, cy: number) => {
            ops.push({ type: 'slot', x: cx, y: cy - SLOT / 2, size: SLOT, slot: s.slot, filled: s.decoration !== null })
            const paint: Paint = s.decoration === null ? MUTED : s.invalid ? { token: 'bad' } : FG
            text(cx + SLOT + 4, cy, shown, FONT.small, paint, { strike: s.invalid })
          },
        }
      })
      next = flow(subX, next, SUB_W, 18, items, 10) + 2
    }
    return next
  }

  // 시리즈·그룹 스킬 표: 이름 + 시리즈/그룹 | 부위 수 | 단계 이름 (무기 포함)
  const bonusKind = (bonus: ImageBonus) => (bonus.kind === 'set' ? '시리즈' : '그룹')
  const bonusPieces = (bonus: ImageBonus) => `${bonus.pieces}부위`
  const bonusNameMax = CONTENT_W / 2
  const bonusNameCol = Math.ceil(
    Math.max(0, ...model.bonuses.map((b) => Math.min(bonusNameMax, measure(b.name, FONT.bold)) + 6 + tagWidth(bonusKind(b)))),
  )
  const bonusPiecesCol = column(model.bonuses.map(bonusPieces), FONT.small)
  const bonusRow = (x: number, y: number, bonus: ImageBonus) => {
    const lineY = y + 11
    const name = fit(bonus.name, FONT.bold, bonusNameMax)
    text(x, lineY, name, FONT.bold, ACCENT)
    tag(x + measure(name, FONT.bold) + 6, lineY, bonusKind(bonus))
    const piecesRight = x + bonusNameCol + COL_GAP + bonusPiecesCol
    text(piecesRight, lineY, bonusPieces(bonus), FONT.small, FG, { align: 'right' })
    const rankX = piecesRight + 10
    const rank = `${bonus.rank}${bonus.fromWeapon ? ' (무기 포함)' : ''}`
    text(rankX, lineY, fit(rank, FONT.small, x + CONTENT_W - rankX), FONT.small, MUTED)
    return y + 24
  }

  // 방어구·무기 스킬 표 (두 묶음이 같은 열): 이름 | 레벨 막대 (오른쪽 맞춤) | 3/5
  const skills = model.skillGroups.flatMap((g) => g.skills)
  const pipsWidth = (max: number) => max * (PIP_W + PIP_GAP) - PIP_GAP
  const pipsCol = Math.max(0, ...skills.map((s) => pipsWidth(s.maxLevel)))
  const levelText = (s: ImageSkill) => [String(s.level), `/${s.maxLevel}`] as const
  const levelCol = Math.ceil(
    Math.max(0, ...skills.map((s) => measure(levelText(s)[0], FONT.number) + measure(levelText(s)[1], FONT.small))),
  )
  const skillNameCol = column(
    skills.map((s) => s.name),
    FONT.body,
    CONTENT_W - COL_GAP - pipsCol - 6 - levelCol,
  )
  const skillRow = (x: number, centerY: number, skill: ImageSkill) => {
    text(x, centerY, fit(skill.name, FONT.body, skillNameCol), FONT.body, FG)
    const pipsRight = x + skillNameCol + COL_GAP + pipsCol
    const pipsLeft = pipsRight - pipsWidth(skill.maxLevel)
    for (let i = 0; i < skill.maxLevel; i++) {
      const filled = i < skill.level
      ops.push({
        type: 'rect',
        x: pipsLeft + i * (PIP_W + PIP_GAP),
        y: centerY - 3,
        w: PIP_W,
        h: 6,
        radius: 1.5,
        fill: filled ? ACCENT : { token: 'surface-2' },
        stroke: filled ? undefined : { token: 'line' },
      })
    }
    const [level, max] = levelText(skill)
    const right = pipsRight + 6 + levelCol
    text(right, centerY, max, FONT.small, MUTED, { align: 'right' })
    text(right - measure(max, FONT.small), centerY, level, FONT.number, FG, { align: 'right' })
  }

  let y = IMAGE_PAD
  if (model.title) {
    for (const line of wrapText(measure, model.title, FONT.title, IMAGE_WIDTH - 2 * IMAGE_PAD, 2)) {
      text(IMAGE_PAD, y + 13, line, FONT.title, FG)
      y += 28
    }
    y += 8
  }

  // 장비: 무기 · 방어구 5부위 · 호석, 부위마다 장식주 (빈 슬롯 포함)
  y = card(y, (x, top) => {
    let cy = top
    model.equipment.forEach((equip, i) => {
      if (i > 0) cy = divider(x, cy)
      cy = equipRow(x, cy, equip)
    })
    return cy
  })

  // 발동 스킬: 시리즈·그룹 → 방어구 스킬 → 무기 스킬
  if (model.bonuses.length > 0 || model.skillGroups.length > 0) {
    y = card(y + CARD_GAP, (x, top) => {
      let cy = top
      const blocks: ((at: number) => number)[] = []
      if (model.bonuses.length > 0) {
        blocks.push((at) => {
          let by = section(x, at, '시리즈 · 그룹 스킬')
          for (const bonus of model.bonuses) by = bonusRow(x, by, bonus)
          return by
        })
      }
      for (const group of model.skillGroups) {
        blocks.push((at) => {
          const gy = section(x, at, group.title, `${group.skills.length}개`)
          group.skills.forEach((skill, i) => skillRow(x, gy + i * ROW + ROW / 2, skill))
          return gy + group.skills.length * ROW
        })
      }
      blocks.forEach((block, i) => {
        cy = block(i > 0 ? cy + 12 : cy)
      })
      return cy
    })
  }

  // 방어력 · 내성 (게임 화면처럼 한 줄에 하나) · 남은 슬롯: 이름 | 값 (오른쪽 맞춤) 표
  y = card(y + CARD_GAP, (x, top) => {
    const rows = [
      { label: '방어력', value: String(model.defense), paint: FG },
      ...model.resistances.map((res) => ({
        label: res.label,
        value: signed(res.value),
        paint: (res.value > 0 ? { token: 'good' } : res.value < 0 ? { token: 'bad' } : FG) satisfies Paint,
      })),
    ]
    const labelCol = column([...rows.map((r) => r.label), '남은 슬롯'], FONT.body)
    const valueRight = x + labelCol + COL_GAP + column(rows.map((r) => r.value), FONT.value)
    let cy = top
    for (const row of rows) {
      text(x, cy + ROW / 2, row.label, FONT.body, FG)
      text(valueRight, cy + ROW / 2, row.value, FONT.value, row.paint, { align: 'right' })
      cy += ROW
    }

    cy = divider(x, cy)
    text(x, cy + ROW / 2, '남은 슬롯', FONT.body, FG)
    const slotsX = x + labelCol + COL_GAP
    if (model.freeSlots.length === 0) text(slotsX, cy + ROW / 2, '없음', FONT.small, MUTED)
    const items = sortedSlots(model.freeSlots).map((slot) => ({
      width: SLOT,
      draw: (sx: number, centerY: number) =>
        ops.push({ type: 'slot', x: sx, y: centerY - SLOT / 2, size: SLOT, slot, filled: false }),
    }))
    return Math.max(cy + ROW, flow(slotsX, cy, x + CONTENT_W - slotsX, ROW, items, 2))
  })

  y += 10
  text(IMAGE_WIDTH / 2, y + 8, fit(model.footer, FONT.tag, IMAGE_WIDTH - 2 * IMAGE_PAD), FONT.tag, MUTED, {
    align: 'center',
  })
  y += 16 + IMAGE_PAD

  return { width: IMAGE_WIDTH, height: Math.ceil(y), ops }
}

/** 무기 슬롯 먼저, 같은 종류면 레벨 높은 순 (SlotList 의 sorted 와 같다) */
function sortedSlots(slots: readonly Slot[]): Slot[] {
  return [...slots].sort((a, b) => (a.kind !== b.kind ? (a.kind === 'weapon' ? -1 : 1) : b.level - a.level))
}

/** 폭에 맞게 자르고 끝에 … */
export function fitText(measure: Measure, text: string, font: Font, width: number): string {
  if (measure(text, font) <= width) return text
  const chars = [...text]
  let lo = 0
  let hi = chars.length
  // … 를 붙여서 들어가는 가장 긴 앞부분
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (measure(chars.slice(0, mid).join('').trimEnd() + '…', font) <= width) lo = mid
    else hi = mid - 1
  }
  return chars.slice(0, lo).join('').trimEnd() + '…'
}

/** 폭에 맞게 줄을 나눈다 (띄어쓰기에서 먼저 나누고, 없으면 글자 사이). 줄이 넘치면 마지막 줄을 … 로 줄인다 */
export function wrapText(measure: Measure, text: string, font: Font, width: number, maxLines: number): string[] {
  const lines: string[] = []
  let chars = [...text.trim()]
  while (chars.length > 0 && lines.length < maxLines) {
    const rest = chars.join('')
    if (lines.length === maxLines - 1 || measure(rest, font) <= width) {
      lines.push(fitText(measure, rest, font, width))
      break
    }
    // 앞 end 글자가 들어간다 (한 글자도 안 들어가도 한 글자는 넣어 줄이 끝난다)
    let end = 1
    while (end < chars.length && measure(chars.slice(0, end + 1).join(''), font) <= width) end++
    // 띄어쓰기에서 나누되, 그러면 줄이 반도 안 차면 글자 사이에서
    let cut = end
    for (let i = end; i > end / 2; i--) {
      if (chars[i] === ' ') {
        cut = i
        break
      }
    }
    lines.push(chars.slice(0, cut).join('').trimEnd())
    chars = [...chars.slice(cut).join('').trimStart()]
  }
  return lines
}
