// 사진 파일 → 픽셀 (호석 창 찾기용) + 비트맵 (미리보기를 잘라 낼 원본)
import { clampRect, type Rect, type RgbaImage } from '../../core/talismanScan/image'

/** 이보다 큰 사진은 줄인다 (8K 스크린샷도 4K 로 충분하고 메모리를 아낀다) */
const MAX_SIDE = 3840

export interface Screenshot {
  image: RgbaImage
  /** 미리보기를 잘라 낼 원본. 4K 면 30MB 가 넘으니 잘라 낸 뒤 바로 close() */
  bitmap: ImageBitmap
}

export async function loadScreenshot(file: Blob): Promise<Screenshot> {
  const source = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(source.width, source.height))
  const width = Math.round(source.width * scale)
  const height = Math.round(source.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('canvas 2d unavailable')
  context.drawImage(source, 0, 0, width, height)
  const pixels = context.getImageData(0, 0, width, height)
  const bitmap = scale < 1 ? await createImageBitmap(canvas) : source
  if (bitmap !== source) source.close()
  return { image: { width, height, data: pixels.data }, bitmap }
}

/** 사진에서 호석 창 부분만 잘라 낸 작은 비트맵 (가로 maxWidth 까지 줄이고 키우지는 않는다) */
export function cropPreview(bitmap: ImageBitmap, area: Rect, maxWidth: number): Promise<ImageBitmap> {
  const rect = clampRect(area, bitmap.width, bitmap.height)
  const width = Math.max(1, Math.min(rect.width, Math.round(maxWidth)))
  return createImageBitmap(bitmap, rect.x, rect.y, rect.width, rect.height, {
    resizeWidth: width,
    resizeHeight: Math.max(1, Math.round((rect.height * width) / rect.width)),
    resizeQuality: 'high',
  })
}

/** 붙여 넣거나 끌어다 놓은 것 중 이미지 파일만 */
export function imageFiles(list: FileList | null | undefined): File[] {
  return Array.from(list ?? []).filter((file) => file.type.startsWith('image/'))
}
