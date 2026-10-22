import { useCallback, useLayoutEffect, useRef } from 'react'

/**
 * 한 문서 안에서 화면(탭·패널)을 바꿔 보여 줄 때 화면마다 스크롤 위치를 기억한다.
 * 반환하는 함수로 화면을 바꾸면 지금 위치를 저장하고 새 화면에서 마지막으로 보던 위치로 돌아간다
 * (top 이면 맨 위로). 이미 보고 있는 화면을 다시 고르면 맨 위로 올라간다.
 */
export function useScrollMemory<K extends string>(current: K, setCurrent: (next: K) => void) {
  const positions = useRef(new Map<K, number>())
  const pending = useRef<number | null>(null)

  // 새 화면이 그려진 직후(페인트 전)에 스크롤해야 깜빡이지 않는다
  useLayoutEffect(() => {
    if (pending.current === null) return
    window.scrollTo(0, pending.current)
    pending.current = null
  }, [current])

  return useCallback(
    (next: K, options?: { top?: boolean }) => {
      if (next === current) {
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }
      positions.current.set(current, window.scrollY)
      pending.current = options?.top ? 0 : (positions.current.get(next) ?? 0)
      setCurrent(next)
    },
    [current, setCurrent],
  )
}
