// 스크린샷 처리용 최소 이미지 도구. DOM 없이 RGBA·회색 배열만 다룬다 (Node 테스트에서도 그대로 돈다)

export interface RgbaImage {
  readonly width: number
  readonly height: number
  /** RGBA 순서, ImageData.data 와 같은 배치 */
  readonly data: Uint8ClampedArray | Uint8Array
}

export interface GrayImage {
  readonly width: number
  readonly height: number
  readonly data: Uint8Array
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** 이미지 안으로 자르고 정수 픽셀로 맞춘다 */
export function clampRect(rect: Rect, width: number, height: number): Rect {
  const x0 = Math.max(0, Math.floor(rect.x))
  const y0 = Math.max(0, Math.floor(rect.y))
  const x1 = Math.min(width, Math.ceil(rect.x + rect.width))
  const y1 = Math.min(height, Math.ceil(rect.y + rect.height))
  return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) }
}

function grayOf(img: RgbaImage, area: Rect, pick: (r: number, g: number, b: number) => number): GrayImage {
  const rect = clampRect(area, img.width, img.height)
  const out = new Uint8Array(rect.width * rect.height)
  for (let y = 0; y < rect.height; y++) {
    let src = ((rect.y + y) * img.width + rect.x) * 4
    let dst = y * rect.width
    for (let x = 0; x < rect.width; x++, src += 4, dst++) {
      out[dst] = pick(img.data[src], img.data[src + 1], img.data[src + 2])
    }
  }
  return { width: rect.width, height: rect.height, data: out }
}

/** 흰 글자일수록 큰 값: RGB 중 가장 작은 값 (색이 있거나 어두운 배경은 작다) */
export function whiteness(img: RgbaImage, area: Rect): GrayImage {
  return grayOf(img, area, (r, g, b) => Math.min(r, g, b))
}

/** 색이 있는 글자('RARE 8' 의 레어도 색 등)도 밝게: RGB 중 가장 큰 값 */
export function brightness(img: RgbaImage, area: Rect): GrayImage {
  return grayOf(img, area, (r, g, b) => Math.max(r, g, b))
}

/** 크기 조정: 확대는 쌍선형 보간, 축소는 면적 평균 */
export function resizeGray(img: GrayImage, width: number, height: number): GrayImage {
  width = Math.max(1, Math.round(width))
  height = Math.max(1, Math.round(height))
  const out = new Uint8Array(width * height)
  const sx = img.width / width
  const sy = img.height / height
  if (sx >= 1 && sy >= 1) {
    for (let y = 0; y < height; y++) {
      const y0 = Math.floor(y * sy)
      const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy))
      for (let x = 0; x < width; x++) {
        const x0 = Math.floor(x * sx)
        const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx))
        let sum = 0
        for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) sum += img.data[yy * img.width + xx]
        out[y * width + x] = Math.round(sum / ((y1 - y0) * (x1 - x0)))
      }
    }
    return { width, height, data: out }
  }
  for (let y = 0; y < height; y++) {
    const fy = Math.min(img.height - 1, Math.max(0, (y + 0.5) * sy - 0.5))
    const y0 = Math.floor(fy)
    const y1 = Math.min(img.height - 1, y0 + 1)
    const ty = fy - y0
    for (let x = 0; x < width; x++) {
      const fx = Math.min(img.width - 1, Math.max(0, (x + 0.5) * sx - 0.5))
      const x0 = Math.floor(fx)
      const x1 = Math.min(img.width - 1, x0 + 1)
      const tx = fx - x0
      const top = img.data[y0 * img.width + x0] * (1 - tx) + img.data[y0 * img.width + x1] * tx
      const bottom = img.data[y1 * img.width + x0] * (1 - tx) + img.data[y1 * img.width + x1] * tx
      out[y * width + x] = Math.round(top * (1 - ty) + bottom * ty)
    }
  }
  return { width, height, data: out }
}

/** 오츠 이진화 문턱값 (두 무리의 분산이 가장 잘 갈리는 값) */
export function otsuThreshold(img: GrayImage): number {
  const hist = new Array<number>(256).fill(0)
  for (const v of img.data) hist[v]++
  const total = img.data.length
  let sumAll = 0
  for (let t = 0; t < 256; t++) sumAll += t * hist[t]
  let countBelow = 0
  let sumBelow = 0
  let best = -1
  let threshold = 128
  for (let t = 0; t < 256; t++) {
    countBelow += hist[t]
    if (countBelow === 0) continue
    const countAbove = total - countBelow
    if (countAbove === 0) break
    sumBelow += t * hist[t]
    const meanBelow = sumBelow / countBelow
    const meanAbove = (sumAll - sumBelow) / countAbove
    const between = countBelow * countAbove * (meanBelow - meanAbove) ** 2
    if (between > best) {
      best = between
      threshold = t
    }
  }
  return threshold
}

/** OCR 입력: 문턱값보다 밝은 글자 → 검정, 배경 → 흰색. 둘레에 흰 여백을 둔다 */
export function inkOnPaper(img: GrayImage, threshold: number, padding: number): GrayImage {
  const width = img.width + padding * 2
  const height = img.height + padding * 2
  const out = new Uint8Array(width * height).fill(255)
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[y * img.width + x] > threshold) out[(y + padding) * width + x + padding] = 0
    }
  }
  return { width, height, data: out }
}

/** 이진 PGM(P5). 테서랙트(Leptonica)가 그대로 읽어서 캔버스로 PNG 를 만들 필요가 없다 */
export function encodePgm(img: GrayImage): Uint8Array {
  const header = new TextEncoder().encode(`P5\n${img.width} ${img.height}\n255\n`)
  const out = new Uint8Array(header.length + img.data.length)
  out.set(header)
  out.set(img.data, header.length)
  return out
}
