// 글 코드: JSON 을 복사·붙여넣기로 옮기는 한 줄 글. 백업 코드(DESIGN.md §8.3)와 검색 조건 코드(§8.4)가 같은 방식이다
import { fromBase64Url, toBase64Url } from './binary'
import { ShareCodeError } from './types'

/** 압축 방식 등 코드 형식이 바뀌면 올린다 (담은 내용의 버전은 JSON 안에) */
const CODE_VERSION = 1
/** 풀었을 때 이보다 크면 잘못된 코드로 본다 (localStorage 전체보다 큼) */
const MAX_JSON_BYTES = 8 * 1024 * 1024

export interface TextCode {
  /** 붙여 넣은 글에 이 코드가 들어 있는지 */
  has(text: string): boolean
  /** 값 → 코드: JSON 을 deflate-raw 로 압축해 base64url 로 쓴다 */
  encode(value: unknown): Promise<string>
  /**
   * 코드 → JSON 값. 앞뒤 글과 코드 중간의 공백·줄바꿈은 무시한다
   * (메신저·메모 앱이 줄을 바꿔 붙여도 되게). 형식이 틀리면 ShareCodeError.
   */
  decode(text: string): Promise<unknown>
}

/**
 * 'mhwilds-<kind>-<형식 버전>.' + base64url(deflate-raw(UTF-8 JSON)). '.' 이 있어 공유 코드(base64url 만)와 섞이지 않고,
 * kind 가 달라 글 코드끼리도 섞이지 않는다. label·fileLabel 은 오류 문구에 들어가는 받침 없는 말 (예: '백업 코드', '백업 파일')
 */
export function textCode(kind: string, label: string, fileLabel: string): TextCode {
  const pattern = new RegExp(`mhwilds-${kind}-(\\d{1,4})\\.([A-Za-z0-9_\\-\\s]*)`, 'i')
  const invalid = `올바른 ${label}가 아니에요`
  const unsupported = `이 브라우저는 ${label}를 지원하지 않아요. 브라우저를 업데이트하거나 ${fileLabel}을 써 주세요`

  return {
    has: (text) => pattern.test(text),
    async encode(value) {
      if (!codeSupported()) throw new ShareCodeError(unsupported)
      const compressed = await deflateRaw(new TextEncoder().encode(JSON.stringify(value)))
      return `mhwilds-${kind}-${CODE_VERSION}.${toBase64Url(compressed)}`
    },
    async decode(text) {
      const match = pattern.exec(text)
      if (!match) throw new ShareCodeError(invalid)
      const version = Number(match[1])
      if (version !== CODE_VERSION) {
        throw new ShareCodeError(
          version > CODE_VERSION ? `더 새로운 형식의 ${label}예요. 페이지를 새로고침해 보세요` : invalid,
        )
      }
      if (!codeSupported()) throw new ShareCodeError(unsupported)
      try {
        const json = await inflateRaw(fromBase64Url(match[2].replace(/\s/g, '')), MAX_JSON_BYTES)
        return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(json)) as unknown
      } catch {
        // base64url·압축·UTF-8·JSON 중 어디가 틀렸든 (잘려서 붙은 경우 포함)
        throw new ShareCodeError(invalid)
      }
    },
  }
}

/** CompressionStream 이 있는 환경인지 (사파리 16.4+, 크롬 103+, 파이어폭스 113+) */
function codeSupported(): boolean {
  return typeof CompressionStream === 'function' && typeof DecompressionStream === 'function'
}

async function deflateRaw(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** maxBytes 를 넘게 풀리면 멈추고 실패한다 (압축 폭탄 방지) */
async function inflateRaw(bytes: Uint8Array<ArrayBuffer>, maxBytes: number): Promise<Uint8Array<ArrayBuffer>> {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > maxBytes) {
      void reader.cancel()
      throw new RangeError('코드가 너무 커요')
    }
    chunks.push(value)
  }
  const out = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}
