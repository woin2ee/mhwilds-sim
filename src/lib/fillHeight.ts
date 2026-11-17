import { useLayoutEffect, type RefObject } from 'react'

/** 2단 화면 (Tailwind lg) */
const TWO_COLUMNS = '(min-width: 64rem)'
/** 창이 아주 낮아도 이만큼은 남긴다 (그보다 낮으면 페이지가 스크롤된다) */
const MIN_HEIGHT = 240

/**
 * 2단 화면에서 안에서 스크롤하는 요소(리롤 표)의 최대 높이를 CSS 변수 `--fill-h` 로 맞춰, 페이지 전체가 화면 높이에 딱 들어가게 한다.
 * 표가 어차피 한 화면에 다 안 들어가는데 페이지까지 스크롤되면 스크롤이 두 겹이라 불편했다.
 * 높이 = 화면 − 요소 위쪽(헤더·안내·패널 머리) − 요소 아래 패널 안의 내용 − main 아래 여백 − 푸터.
 * 요소는 그리드 칸인 패널(`section`) 안에 있고, 그리드는 main 의 마지막 내용이라고 본다. 옆 칸이 더 길면 그만큼은 페이지가 스크롤된다.
 * 1단 화면(휴대폰)은 표 아래에 다른 패널이 있어 페이지 스크롤이 필요하므로 재지 않는다 (CSS 기본값을 쓴다).
 */
export function useFillViewportHeight(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = ref.current
    const panel = el?.closest('section')
    const main = el?.closest('main')
    if (!el || !panel || !main) return
    const twoColumns = window.matchMedia(TWO_COLUMNS)
    const fit = () => {
      // 1단 화면이나 숨은 탭에서는 재지 않는다
      if (!twoColumns.matches || el.offsetParent === null) {
        el.style.removeProperty('--fill-h')
        return
      }
      const rect = el.getBoundingClientRect()
      const top = rect.top + window.scrollY
      const inPanel = panel.getBoundingClientRect().bottom - rect.bottom
      const footer = main.nextElementSibling?.getBoundingClientRect().height ?? 0
      const below = inPanel + parseFloat(getComputedStyle(main).paddingBottom) + footer
      const height = Math.max(MIN_HEIGHT, Math.floor(window.innerHeight - top - below))
      el.style.setProperty('--fill-h', `${height}px`)
    }
    fit()
    window.addEventListener('resize', fit)
    twoColumns.addEventListener('change', fit)
    // 숨은 탭이 보이게 되거나 위쪽 글이 줄바꿈되어 자리가 바뀔 때. 높이만 맞추는 것이라 다시 재도 같은 값에서 멈춘다
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    observer.observe(panel)
    return () => {
      window.removeEventListener('resize', fit)
      twoColumns.removeEventListener('change', fit)
      observer.disconnect()
    }
  }, [ref])
}
