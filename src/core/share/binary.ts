// 공유 코드용 바이트 읽기/쓰기와 base64url (DESIGN.md §8.2)
import { ShareCodeError } from './types'

export const INVALID_CODE = '올바른 공유 코드가 아니에요'
/** str 필드 최대 바이트 수 */
export const STR_MAX_BYTES = 60

const encoder = new TextEncoder()

export class ByteWriter {
  private readonly bytes: number[] = []

  u8(value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 0xff) throw new RangeError(`u8 범위 밖: ${value}`)
    this.bytes.push(value)
  }

  /** LEB128 부호 없는 정수 (uint32) */
  varint(value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError(`varint 범위 밖: ${value}`)
    let rest = value
    do {
      const low = rest % 0x80
      rest = Math.floor(rest / 0x80)
      this.bytes.push(rest > 0 ? low | 0x80 : low)
    } while (rest > 0)
  }

  /** zigzag 인코딩한 int32 */
  zz(value: number): void {
    if (!Number.isInteger(value) || value < -(2 ** 31) || value >= 2 ** 31) throw new RangeError(`int32 범위 밖: ${value}`)
    this.varint(((value << 1) ^ (value >> 31)) >>> 0)
  }

  /** u8 바이트 길이 + UTF-8. STR_MAX_BYTES 를 넘으면 글자 경계에서 자른다. */
  str(text: string): void {
    const bytes = utf8Truncate(text, STR_MAX_BYTES)
    this.u8(bytes.length)
    for (const b of bytes) this.bytes.push(b)
  }

  toBytes(): Uint8Array {
    return Uint8Array.from(this.bytes)
  }
}

export class ByteReader {
  private readonly bytes: Uint8Array
  private pos = 0

  constructor(bytes: Uint8Array) {
    this.bytes = bytes
  }

  get done(): boolean {
    return this.pos === this.bytes.length
  }

  u8(): number {
    if (this.pos >= this.bytes.length) throw new ShareCodeError(INVALID_CODE)
    return this.bytes[this.pos++]
  }

  varint(): number {
    let result = 0
    let scale = 1
    for (let i = 0; i < 5; i++) {
      const b = this.u8()
      result += (b & 0x7f) * scale
      if ((b & 0x80) === 0) {
        if (result > 0xffffffff) throw new ShareCodeError(INVALID_CODE)
        return result
      }
      scale *= 0x80
    }
    throw new ShareCodeError(INVALID_CODE)
  }

  zz(): number {
    const u = this.varint()
    return ((u >>> 1) ^ -(u & 1)) | 0
  }

  str(): string {
    const length = this.u8()
    if (this.pos + length > this.bytes.length) throw new ShareCodeError(INVALID_CODE)
    const slice = this.bytes.subarray(this.pos, this.pos + length)
    this.pos += length
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(slice)
    } catch {
      throw new ShareCodeError(INVALID_CODE)
    }
  }
}

/** 글자(가능하면 자소 묶음) 경계에서 maxBytes 이하로 자른 UTF-8 */
export function utf8Truncate(text: string, maxBytes: number): Uint8Array {
  const full = encoder.encode(text)
  if (full.length <= maxBytes) return full
  let out = ''
  let size = 0
  for (const part of graphemes(text)) {
    const n = encoder.encode(part).length
    if (size + n > maxBytes) break
    out += part
    size += n
  }
  return encoder.encode(out)
}

function graphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), (s) => s.segment)
  }
  return Array.from(text)
}

const BASE64URL = /^[A-Za-z0-9_-]+$/

export function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  if (!BASE64URL.test(text)) throw new ShareCodeError(INVALID_CODE)
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/')
  let binary: string
  try {
    binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  } catch {
    throw new ShareCodeError(INVALID_CODE)
  }
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}
