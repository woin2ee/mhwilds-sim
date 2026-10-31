// 스크린샷 글자 인식(OCR): tesseract.js(WebAssembly) + 한국어 데이터. 사진은 브라우저 밖으로 나가지 않는다.
// 워커·엔진·데이터(약 5MB)는 사진으로 추가할 때 처음 한 번만 받는다 (사이트에 같이 올라가는 파일, ?url).
// 라이브러리 JS(약 17KB)만 페이지를 연 뒤 미리 받는다 (preloadOcrLibrary)
import workerUrl from 'tesseract.js/dist/worker.min.js?url'
import coreSimdUrl from 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url'
import coreUrl from 'tesseract.js-core/tesseract-core-lstm.wasm.js?url'
import korUrl from '@tesseract.js-data/kor/4.0.0_best_int/kor.traineddata.gz?url'
import type { LineReader } from '../../core/talismanScan/scan'

export interface OcrEngine {
  readLine: LineReader
  terminate: () => void
}

/**
 * 글자 인식을 준비하지 못함. library: 라이브러리 파일(사이트를 새로 배포한 뒤에도 열어 둔 탭은 옛 파일을 찾아서 못 받는다.
 * 실패한 import 는 브라우저가 기억해서 새로고침해야 한다), data: 워커·엔진·언어 데이터(인터넷 연결)
 */
export class OcrLoadError extends Error {
  readonly stage: 'library' | 'data'
  constructor(stage: 'library' | 'data', cause: unknown) {
    super(`OCR ${stage} failed to load`, { cause })
    this.stage = stage
  }
}

/** WebAssembly SIMD 지원 여부 (wasm-feature-detect 의 검사 모듈). 지원하면 빠른 코어를 쓴다 */
function simdSupported(): boolean {
  const module = [
    0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
  ]
  try {
    return WebAssembly.validate(new Uint8Array(module))
  } catch {
    return false
  }
}

let library: Promise<typeof import('tesseract.js')> | null = null

function loadLibrary(): Promise<typeof import('tesseract.js')> {
  library ??= import('tesseract.js').catch((error: unknown) => {
    library = null
    throw error
  })
  return library
}

/**
 * 라이브러리 파일(작은 JS)만 미리 받아 둔다. 이 파일은 이름이 배포마다 바뀌어서, 새로 배포한 뒤에도 열어 둔 탭은
 * 받을 수 없다. 워커·엔진·언어 데이터는 내용이 같으면 이름도 같아 배포 뒤에도 받을 수 있다
 */
export function preloadOcrLibrary(): void {
  loadLibrary().catch(() => {})
}

/** 한 줄 읽기 전용 OCR 엔진을 만든다. 다 쓰면 terminate (워커가 메모리를 꽤 쓴다). 준비하지 못하면 OcrLoadError */
export async function createOcrEngine(): Promise<OcrEngine> {
  let tesseract: typeof import('tesseract.js')
  try {
    tesseract = await loadLibrary()
  } catch (error) {
    throw new OcrLoadError('library', error)
  }
  const { createWorker, OEM, PSM } = tesseract
  // 7.0.0 의 createWorker 는 언어 데이터를 못 받으면 끝나지 않고 오류를 errorHandler 로만 알린다
  // (errorHandler 가 없으면 메시지 처리기에서 throw). 그 오류로 준비를 끝낸다
  let failToLoad: (error: unknown) => void = () => {}
  const loadFailed = new Promise<never>((_, reject) => {
    failToLoad = reject
  })
  // tesseract.js 는 언어 데이터를 '<langPath>/kor.traineddata.gz' 로 받는다. 빌드에서는 파일 이름을 그대로 두고
  // (vite.config.ts), 개발 서버에서는 node_modules 의 파일이라 어느 쪽이든 URL 에서 파일 이름만 떼면 폴더다.
  // (데이터를 바이트로 넘기는 방법은 7.0.0 에서 언어 이름 자리에 바이트가 들어가는 버그가 있어 쓰지 않는다)
  const worker = await Promise.race([
    createWorker('kor', OEM.LSTM_ONLY, {
      workerPath: workerUrl,
      corePath: simdSupported() ? coreSimdUrl : coreUrl,
      langPath: korUrl.slice(0, korUrl.lastIndexOf('/')),
      // 브라우저 HTTP 캐시만 쓴다 (IndexedDB 캐시는 데이터를 바꿔도 이름이 같아 옛 데이터가 남는다)
      cacheMethod: 'none',
      // 준비가 끝난 뒤의 오류는 그 작업(recognize)의 promise 로도 온다
      errorHandler: (error: unknown) => failToLoad(error),
    }),
    loadFailed,
  ]).catch((error: unknown) => {
    throw new OcrLoadError('data', error)
  })
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE })
  let whitelist = ''
  return {
    async readLine(pgm, nextWhitelist) {
      if (nextWhitelist !== whitelist) {
        await worker.setParameters({ tessedit_char_whitelist: nextWhitelist })
        whitelist = nextWhitelist
      }
      // 이미지 파일 바이트를 그대로 받는다 (PGM 은 Leptonica 가 읽는다)
      const { data } = await worker.recognize(pgm as unknown as Blob)
      return data.text
    },
    terminate: () => void worker.terminate(),
  }
}
