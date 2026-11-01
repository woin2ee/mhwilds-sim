import { useLayoutEffect, type RefObject } from 'react'

/** 화면 아래 여백 (위는 열의 sticky top) */
const BOTTOM_GAP = 16
/** 2단 화면 (Tailwind lg) */
const TWO_COLUMNS = '(min-width: 64rem)'

/**
 * 2단 화면에서 화면에 붙여 두고 안에서 스크롤하는 열(sticky)의 최대 높이를 CSS 변수 `--sticky-max-h` 로 맞춘다.
 * 보통은 sticky top 부터 화면 아래 여백까지다. 그런데 sticky 열은 그리드 칸(옆 열의 끝)을 넘지 못해서, 페이지 끝까지 내려
 * 푸터가 보이면 열이 통째로 밀려 올라가 맨 위(세팅 검색의 검색 버튼)가 헤더 밑으로 숨었다. 그래서 옆 열이 끝나는 곳까지로 줄이고,
 * 옆 열이 짧아도 페이지 끝에서 밀려 올라가지 않을 높이(화면 − top − 그리드 아래의 main 여백·푸터)는 남긴다.
 * columnRef 는 그리드의 칸이고 siblingRef 는 옆 칸이다.
 */
export function useStickyColumnHeight(
  columnRef: RefObject<HTMLElement | null>,
  siblingRef: RefObject<HTMLElement | null>,
) {
  useLayoutEffect(() => {
    const column = columnRef.current
    const sibling = siblingRef.current
    const grid = column?.parentElement
    if (!column || !sibling || !grid) return
    // 그리드 아래에는 main 의 아래 여백과 푸터(main 다음 형제)만 있다. 문서 높이로 재면 내용이 화면보다 짧을 때
    // main 이 화면 높이까지 늘어난 만큼(Shell 의 min-h-screen)이 섞여 열이 쓸데없이 짧아진다
    const main = grid.closest('main')
    const twoColumns = window.matchMedia(TWO_COLUMNS)
    const fit = () => {
      // 1단 화면이나 숨은 탭에서는 재지 않는다
      if (!twoColumns.matches || sibling.offsetParent === null) return
      const top = parseFloat(getComputedStyle(column).top) || 0
      const viewport = window.innerHeight
      const below = main
        ? parseFloat(getComputedStyle(main).paddingBottom) + (main.nextElementSibling?.getBoundingClientRect().height ?? 0)
        : 0
      // 페이지 끝까지 내리면 그리드는 화면 아래에서 below 만큼 위에서 끝난다
      const room = sibling.getBoundingClientRect().bottom - top
      const height = Math.min(viewport - top - BOTTOM_GAP, Math.max(viewport - top - below, room))
      column.style.setProperty('--sticky-max-h', `${Math.floor(height)}px`)
    }
    fit()
    window.addEventListener('scroll', fit, { passive: true })
    window.addEventListener('resize', fit)
    twoColumns.addEventListener('change', fit)
    // 옆 열의 패널을 접고 펴거나 숨은 탭이 다시 보일 때
    const observer = new ResizeObserver(fit)
    observer.observe(sibling)
    return () => {
      window.removeEventListener('scroll', fit)
      window.removeEventListener('resize', fit)
      twoColumns.removeEventListener('change', fit)
      observer.disconnect()
    }
  }, [columnRef, siblingRef])
}
