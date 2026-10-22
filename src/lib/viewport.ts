// 휴대폰에서 키보드가 올라오면 화면에 보이는 영역(visual viewport)은 줄어들지만 position: fixed 요소의 기준(layout
// viewport)은 그대로라 아래쪽이 키보드에 가린다. 시트·대화상자는 이 훅이 붙이는 CSS 변수로 보이는 영역에 맞춘다.
import { useLayoutEffect, type RefObject } from 'react'

/**
 * active 인 동안 요소에 보이는 영역의 위치를 CSS 변수로 붙인다 (fixed 요소 기준 좌표).
 *   --vv-top: 보이는 영역의 위쪽 끝, --vv-height: 보이는 영역의 높이
 * 쓰는 쪽은 값이 없을 때를 위해 var(--vv-top, 0px), var(--vv-height, 100dvh) 처럼 기본값을 둔다.
 */
export function useVisualViewportVars(ref: RefObject<HTMLElement | null>, active: boolean) {
  useLayoutEffect(() => {
    const el = ref.current
    const viewport = window.visualViewport
    if (!active || !el || !viewport) return
    const update = () => {
      el.style.setProperty('--vv-top', `${viewport.offsetTop}px`)
      el.style.setProperty('--vv-height', `${viewport.height}px`)
    }
    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
    }
  }, [ref, active])
}
