import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'

const PREFIX = 'mhwilds-sim:'

function read<T>(key: string, fallback: T, validate?: (value: unknown) => value is T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw === null) return fallback
    const value: unknown = JSON.parse(raw)
    return validate && !validate(value) ? fallback : (value as T)
  } catch {
    return fallback
  }
}

/**
 * localStorage 에 자동 저장되는 state. 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)에서도
 * 일반 state 처럼 동작한다. 저장 형식을 바꿀 때는 key 의 버전(:v1 → :v2)을 올린다.
 */
export function usePersistentState<T>(
  key: string,
  fallback: T | (() => T),
  validate?: (value: unknown) => value is T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() =>
    read(key, typeof fallback === 'function' ? (fallback as () => T)() : fallback, validate),
  )
  useEffect(() => {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value))
    } catch {
      // 저장 실패는 무시 (용량 초과·차단 등)
    }
  }, [key, value])
  return [value, setValue]
}
