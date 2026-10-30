import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'

const PREFIX = 'mhwilds-sim:'

/** 같은 키의 저장값이 다른 곳(같은 키를 쓰는 다른 훅, 동기화, 다른 탭)에서 바뀌었을 때. raw 는 JSON (지워졌으면 null) */
type Listener = (raw: string | null) => void

const listeners = new Map<string, Set<Listener>>()
/** 이 기기에서 저장값을 바꿨을 때 (기본값을 처음 저장하거나 동기화가 받아서 쓴 것은 빼고) */
const changeListeners = new Set<(key: string) => void>()
/** 다른 탭에서 바꾼 값을 바로 받아 오는 키 */
const sharedKeys = new Set<string>()

/** 저장된 JSON (없거나 저장소를 쓸 수 없으면 null) */
export function readStoredRaw(key: string): string | null {
  try {
    return localStorage.getItem(PREFIX + key)
  } catch {
    return null
  }
}

/** 저장된 값 (없거나 JSON 이 깨졌으면 undefined) */
export function readStored(key: string): unknown {
  const raw = readStoredRaw(key)
  if (raw === null) return undefined
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return undefined
  }
}

/**
 * 값을 저장하고 이 키를 쓰는 훅에 알린다. 동기화가 받은 값을 쓸 때 쓰며, 이 기기에서 바꾼 것으로 치지 않는다.
 * undefined 면 지운다 (훅은 지금 값을 그대로 둔다)
 */
export function writeStored(key: string, value: unknown): void {
  if (value === undefined) {
    try {
      localStorage.removeItem(PREFIX + key)
    } catch {
      // 무시
    }
    return
  }
  const raw = JSON.stringify(value)
  if (readStoredRaw(key) === raw) return
  try {
    localStorage.setItem(PREFIX + key, raw)
  } catch {
    return
  }
  emit(key, raw)
}

/** 이 기기에서 저장값을 바꿀 때마다 키를 알려 준다 (기기끼리 동기화). 구독을 끊는 함수를 돌려준다 */
export function onStoredChange(listener: (key: string) => void): () => void {
  changeListeners.add(listener)
  return () => changeListeners.delete(listener)
}

/**
 * 이 키들은 다른 탭에서 바꾼 값을 바로 받아 온다. 동기화한 값을 다른 탭이 옛 값으로 덮어 다른 기기까지 되돌리지 않게
 * 기기끼리 맞추는 값에만 쓴다 (화면 상태인 탭 등은 탭마다 따로).
 */
export function shareAcrossTabs(keys: readonly string[]): () => void {
  if (sharedKeys.size === 0) window.addEventListener('storage', onOtherTab)
  keys.forEach((key) => sharedKeys.add(key))
  return () => {
    keys.forEach((key) => sharedKeys.delete(key))
    if (sharedKeys.size === 0) window.removeEventListener('storage', onOtherTab)
  }
}

function onOtherTab(event: StorageEvent) {
  if (!event.key?.startsWith(PREFIX)) return
  const key = event.key.slice(PREFIX.length)
  if (sharedKeys.has(key)) emit(key, event.newValue)
}

function emit(key: string, raw: string | null, except?: Listener) {
  listeners.get(key)?.forEach((listener) => {
    if (listener !== except) listener(raw)
  })
}

function parse<T>(raw: string | null, fallback: T, validate?: (value: unknown) => value is T): T {
  if (raw === null) return fallback
  try {
    const value: unknown = JSON.parse(raw)
    return validate && !validate(value) ? fallback : (value as T)
  } catch {
    return fallback
  }
}

/**
 * localStorage 에 자동 저장되는 state. 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)에서도
 * 일반 state 처럼 동작한다. 저장 형식을 바꿀 때는 key 의 버전(:v1 → :v2)을 올린다.
 * 같은 키를 쓰는 다른 훅이나 동기화(writeStored)가 저장값을 바꾸면 따라 바뀐다 (형식이 틀린 값은 무시).
 */
export function usePersistentState<T>(
  key: string,
  fallback: T | (() => T),
  validate?: (value: unknown) => value is T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() =>
    parse(readStoredRaw(key), typeof fallback === 'function' ? (fallback as () => T)() : fallback, validate),
  )
  // 마지막으로 저장했거나 받은 JSON. 받은 값을 다시 저장하지 않고, null 이면 아직 저장 전(마운트 직후)이다
  const saved = useRef<string | null>(null)
  const [listener] = useState<Listener>(() => (raw: string | null) => {
    if (raw === null || raw === saved.current) return
    let next: unknown
    try {
      next = JSON.parse(raw)
    } catch {
      return
    }
    if (validate && !validate(next)) return
    saved.current = raw
    setValue(next as T)
  })

  useEffect(() => {
    let set = listeners.get(key)
    if (!set) listeners.set(key, (set = new Set()))
    set.add(listener)
    return () => {
      set.delete(listener)
    }
  }, [key, listener])

  useEffect(() => {
    const raw = JSON.stringify(value)
    if (raw === saved.current) return
    // 마운트 직후 첫 저장(없던 기본값, 형식이 틀려 기본값으로 바꾼 값)은 이 기기에서 바꾼 것으로 치지 않는다
    const changed = saved.current !== null
    saved.current = raw
    const previous = readStoredRaw(key)
    if (previous === raw) return
    try {
      localStorage.setItem(PREFIX + key, raw)
    } catch {
      // 저장 실패는 무시 (용량 초과·차단 등)
      return
    }
    emit(key, raw, listener)
    if (changed) changeListeners.forEach((notify) => notify(key))
  }, [key, value, listener])

  return [value, setValue]
}

/**
 * 브라우저에 저장소 보존을 요청한다 (공간이 부족해도 지우지 않도록). 이미 허용됐거나 허용되면 true.
 * 브라우저마다 자동 허용·사용자 확인·미지원이 달라서 결과는 참고용이다.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (await navigator.storage?.persisted?.()) return true
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}

/** 저장소 보존 여부 (알 수 없으면 null) */
export async function isStoragePersisted(): Promise<boolean | null> {
  try {
    return (await navigator.storage?.persisted?.()) ?? null
  } catch {
    return null
  }
}
