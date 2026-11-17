import { useEffect, useState, type RefObject } from 'react'
import { cx } from '../lib/cx'

interface Edges {
  /** 넘기는 요소의 안쪽(스크롤바 빼고) 위치, 부모(relative) 기준 */
  top: number
  height: number
  left: number
  right: number
  /** 왼쪽·오른쪽으로 더 넘길 수 있는지 */
  start: boolean
  end: boolean
}

/**
 * 옆으로 넘기는 영역의 가장자리 그림자: 오른쪽(왼쪽)에 더 있으면 그쪽 끝에 옅은 그림자를 띄워, 열이 잘린 게 아니라 옆에 더 있다는 걸
 * 알린다 (리롤 표를 좁은 폭에서 열면 오른쪽 열 머리가 잘려 보이는데 더 있다는 표시가 없었다). 넘기는 요소의 relative 부모 안에 두면
 * 그 요소의 안쪽(스크롤바 빼고)에 맞춰 그린다. startInset: 왼쪽에 붙어 있는 열(sticky)의 폭(px) — 왼쪽 그림자를 그 오른쪽에 둔다
 */
export function ScrollEdges({ target, startInset = 0 }: { target: RefObject<HTMLElement | null>; startInset?: number }) {
  const [edges, setEdges] = useState<Edges | null>(null)

  useEffect(() => {
    const el = target.current
    if (!el) return
    const update = () => {
      const max = el.scrollWidth - el.clientWidth
      const left = el.offsetLeft + el.clientLeft
      const next: Edges = {
        top: el.offsetTop + el.clientTop,
        height: el.clientHeight,
        left,
        right: left + el.clientWidth,
        start: el.scrollLeft > 1,
        end: el.scrollLeft < max - 1,
      }
      setEdges((prev) =>
        prev && (Object.keys(next) as (keyof Edges)[]).every((k) => prev[k] === next[k]) ? prev : next,
      )
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    // 폭이 바뀌거나(창 크기) 내용 폭이 바뀌면(열을 더하거나 지움) 다시 잰다
    const observer = new ResizeObserver(update)
    observer.observe(el)
    if (el.firstElementChild) observer.observe(el.firstElementChild)
    return () => {
      el.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [target])

  if (!edges) return null
  const shade = 'pointer-events-none absolute z-20 w-5 from-line to-transparent transition-opacity'
  return (
    <>
      <div
        aria-hidden
        className={cx(shade, 'bg-linear-to-r', edges.start ? 'opacity-100' : 'opacity-0')}
        style={{ top: edges.top, height: edges.height, left: edges.left + startInset }}
      />
      <div
        aria-hidden
        className={cx(shade, 'bg-linear-to-l', edges.end ? 'opacity-100' : 'opacity-0')}
        style={{ top: edges.top, height: edges.height, left: edges.right - 20 }}
      />
    </>
  )
}
