// 공유 이미지를 캔버스에 그려 PNG 로 만든다 (DESIGN.md §8.6). 색은 지금 테마의 index.css 토큰 값을,
// 글꼴은 화면과 같은 글꼴(Pretendard)을 쓴다. 게임 이미지·아이콘은 쓰지 않는다.
import { EQUIP_ICON_PATHS } from '../../components/equipIconPaths'
import type { SlotLevel } from '../../data/types'
import type { BuildImageModel } from './buildImageModel'
import { layoutBuildImage, type ColorToken, type DrawOp, type Font, type Measure, type Paint } from './buildImageLayout'

/** 논리 크기의 3배로 그린다 (폭 420 → 1260px). 1px 선·테두리는 정수 좌표에 맞춰 3배에서도 번지지 않게 그린다 */
const SCALE = 3
/** 글꼴을 이만큼 기다려도 안 오면(오프라인 등) 있는 글꼴로 그린다 */
const FONT_TIMEOUT = 3000

type Palette = Record<ColorToken | `slot-${SlotLevel}`, string>

const PALETTE_TOKENS: readonly (keyof Palette)[] = [
  'bg',
  'surface',
  'surface-2',
  'line',
  'fg',
  'muted',
  'accent',
  'good',
  'bad',
  'slot-1',
  'slot-2',
  'slot-3',
]

function readPalette(): Palette {
  const style = getComputedStyle(document.documentElement)
  return Object.fromEntries(PALETTE_TOKENS.map((token) => [token, style.getPropertyValue(`--${token}`).trim()])) as Palette
}

const fontOf = (font: Font, family: string) => `${font.weight} ${font.size}px ${family}`

function canvasMeasure(family: string): Measure {
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) throw new Error('canvas 2d 를 쓸 수 없어요')
  const cache = new Map<string, number>()
  return (text, font) => {
    const key = `${font.weight}/${font.size}/${text}`
    let width = cache.get(key)
    if (width === undefined) {
      ctx.font = fontOf(font, family)
      width = ctx.measureText(text).width
      cache.set(key, width)
    }
    return width
  }
}

/**
 * 그릴 글자가 든 글꼴 파일을 받아 둔다. 화면 글꼴은 글자 범위별로 나뉜 웹 글꼴이라 캔버스는 아직 안 받은 범위의 글자를
 * 다른 글꼴로 그리고, 폭도 그 글꼴로 잰다
 */
async function loadFonts(family: string, fonts: readonly Font[], text: string): Promise<void> {
  if (!document.fonts) return
  const specs = [...new Set(fonts.map((font) => `${font.weight} 16px ${family}`))]
  const loading = Promise.all(specs.map((spec) => document.fonts.load(spec, text))).catch(() => undefined)
  await Promise.race([loading, new Promise((resolve) => setTimeout(resolve, FONT_TIMEOUT))])
}

/** 세팅 이미지를 PNG 로 만든다 */
export async function renderBuildImage(model: BuildImageModel): Promise<Blob> {
  const family = getComputedStyle(document.body).fontFamily || 'sans-serif'
  // 한 번 배치해 보고 쓰인 글자·굵기의 글꼴을 받은 뒤 그 글꼴의 폭으로 다시 배치한다
  const texts = new Set<string>()
  const fonts: Font[] = []
  const first = canvasMeasure(family)
  const draft = layoutBuildImage(model, (text, font) => {
    texts.add(text)
    fonts.push(font)
    return first(text, font)
  })
  for (const op of draft.ops) {
    if (op.type !== 'text') continue
    texts.add(op.text)
    fonts.push(op.font)
  }
  texts.add('123') // 슬롯 레벨 숫자
  await loadFonts(family, fonts, [...new Set([...texts].join(''))].join(''))
  const layout = layoutBuildImage(model, canvasMeasure(family))

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(layout.width * SCALE)
  canvas.height = Math.round(layout.height * SCALE)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d 를 쓸 수 없어요')
  ctx.scale(SCALE, SCALE)
  const palette = readPalette()
  ctx.fillStyle = palette.bg
  ctx.fillRect(0, 0, layout.width, layout.height)
  for (const op of layout.ops) paintOp(ctx, op, palette, family)

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('이미지를 만들지 못했어요'))), 'image/png'),
  )
}

function withPaint(ctx: CanvasRenderingContext2D, paint: Paint, palette: Palette, draw: (color: string) => void) {
  ctx.globalAlpha = paint.alpha ?? 1
  draw(palette[paint.token])
  ctx.globalAlpha = 1
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function paintOp(ctx: CanvasRenderingContext2D, op: DrawOp, palette: Palette, family: string) {
  switch (op.type) {
    case 'rect': {
      roundRectPath(ctx, op.x, op.y, op.w, op.h, op.radius)
      if (op.fill) {
        withPaint(ctx, op.fill, palette, (color) => {
          ctx.fillStyle = color
          ctx.fill()
        })
      }
      if (op.stroke) {
        // 1px 선이 반쯤 걸쳐 흐려지지 않게 테두리 안쪽으로
        roundRectPath(ctx, op.x + 0.5, op.y + 0.5, op.w - 1, op.h - 1, Math.max(0, op.radius - 0.5))
        withPaint(ctx, op.stroke, palette, (color) => {
          ctx.strokeStyle = color
          ctx.lineWidth = 1
          ctx.stroke()
        })
      }
      return
    }
    case 'line':
      // 가로 구분선: 정수 y 에서 1px 칸을 채운다 (선 가운데를 좌표에 두면 3배에서 위아래로 반 칸씩 번진다)
      withPaint(ctx, op.paint, palette, (color) => {
        ctx.fillStyle = color
        ctx.fillRect(op.x, op.y, op.w, 1)
      })
      return
    case 'text':
      withPaint(ctx, op.paint, palette, (color) => {
        ctx.font = fontOf(op.font, family)
        ctx.fillStyle = color
        ctx.textAlign = op.align ?? 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText(op.text, op.x, op.y)
        if (op.strike) {
          const width = ctx.measureText(op.text).width
          const left = op.align === 'right' ? op.x - width : op.align === 'center' ? op.x - width / 2 : op.x
          ctx.fillRect(left, op.y - 0.5, width, 1)
        }
      })
      return
    case 'slot':
      paintSlot(ctx, op, palette, family)
      return
    case 'icon':
      withPaint(ctx, op.paint, palette, (color) => {
        ctx.save()
        ctx.translate(op.x, op.y)
        ctx.scale(op.size / 24, op.size / 24)
        ctx.strokeStyle = color
        ctx.lineWidth = 1.75
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        for (const d of EQUIP_ICON_PATHS[op.equip]) ctx.stroke(new Path2D(d))
        ctx.restore()
      })
      return
  }
}

/** SlotBadge 와 같은 모양: 방어구 슬롯 = 원, 무기 슬롯 = 마름모, 색 = 레벨, 장식주가 들면 옅게 채운다 */
function paintSlot(
  ctx: CanvasRenderingContext2D,
  op: Extract<DrawOp, { type: 'slot' }>,
  palette: Palette,
  family: string,
) {
  const color = palette[`slot-${op.slot.level}`]
  const half = op.size / 2
  const border = 1.5
  ctx.save()
  ctx.translate(op.x + half, op.y + half)
  ctx.beginPath()
  if (op.slot.kind === 'weapon') {
    // 2px 안쪽 정사각형을 45° 돌린 것 (모서리 2px 둥글게)
    ctx.rotate(Math.PI / 4)
    const side = op.size - 4 - border
    roundRectPath(ctx, -side / 2, -side / 2, side, side, 2)
    ctx.rotate(-Math.PI / 4)
  } else {
    ctx.arc(0, 0, half - border / 2, 0, Math.PI * 2)
  }
  if (op.filled) {
    ctx.globalAlpha = 0.25
    ctx.fillStyle = color
    ctx.fill()
    ctx.globalAlpha = 1
  }
  ctx.strokeStyle = color
  ctx.lineWidth = border
  ctx.stroke()
  ctx.fillStyle = color
  ctx.font = `700 ${Math.round(op.size * 0.6)}px ${family}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(op.slot.level), 0, 0.5)
  ctx.restore()
}
