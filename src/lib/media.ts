// 미디어 쿼리 구독. 레이아웃(1단/2단)은 화면 폭(Tailwind lg: 등)으로, 터치 크기·입력 방식은 포인터 종류로 나눈다.
import { useCallback, useSyncExternalStore } from 'react'

/** CSS 미디어 쿼리 일치 여부. 화면 크기·입력 장치가 바뀌면 다시 그린다. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches)
}

/** 손가락으로 조작하는 기기(휴대폰·태블릿). CSS 에서는 Tailwind 의 pointer-coarse: 변형과 같다. */
export function useCoarsePointer(): boolean {
  return useMediaQuery('(pointer: coarse)')
}
