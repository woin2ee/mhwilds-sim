import type { ReactNode } from 'react'
import type { EquipKey } from '../core/types'
import { cx } from '../lib/cx'

// 24×24 격자에 직접 그린 선 도형. 게임 아이콘을 따라 그리지 않는다 (캡콤 2차 창작 가이드라인).
const SHAPES: Record<EquipKey, ReactNode> = {
  // 검
  weapon: (
    <>
      <path d="M7.9 13.9 16.4 5.4 20 4l-1.4 3.6-8.5 8.5" />
      <path d="m6 12 6 6M9 15l-3.6 3.6" />
      <circle cx="4.5" cy="19.5" r="1.3" />
    </>
  ),
  // T자 얼굴 트임 투구
  head: <path d="M4.5 20.5V11a7.5 7.5 0 0 1 15 0v9.5H14V14h3v-3.5H7V14h3v6.5z" />,
  // 어깨받이 달린 흉갑
  chest: (
    <>
      <path d="M9.5 4Q12 7 14.5 4L17 5.5l-.5 13Q12 20.5 7.5 18.5L7 5.5z" />
      <path d="M7 5.5C4.5 5.5 3.5 7.5 3.5 10.5L7 11M17 5.5c2.5 0 3.5 2 3.5 5L17 11" />
      <path d="M7.2 13Q12 15 16.8 13" />
    </>
  ),
  // 건틀릿
  arms: (
    <>
      <path d="M8.5 16V7.75a3.75 3.75 0 0 1 7.5 0V16" />
      <path d="M8.5 11.35 6.56 9.09a1.4 1.4 0 0 0-2.12 1.82l4.06 4.74" />
      <path d="M11 4.2V9M13.5 4.2V9M8.5 10.5H16" />
      <path d="M7.5 16H17l1 4.5H6.5z" />
    </>
  ),
  // 허리에 두른 버클 벨트. 아래로 늘어진 조각을 달면 투구(머리)와 윤곽이 비슷해져서 넣지 않는다
  waist: (
    <>
      <path d="M2.5 7.5q3 1.42 6 1.94M21.5 7.5q-3 1.42-6 1.94M2.5 14q3 1.42 6 1.94M21.5 14q-3 1.42-6 1.94M2.5 7.5V14M21.5 7.5V14" />
      <rect x="8.5" y="8.5" width="7" height="9" rx="1.5" />
      <rect x="10.5" y="10.5" width="3" height="5" rx=".5" />
    </>
  ),
  // 무릎받이 달린 장화
  legs: (
    <>
      <rect x="6" y="3" width="8.5" height="4.5" rx="2" />
      <path d="M7 7.5v13h13v-2.2a2.5 2.5 0 0 0-1.4-2.3l-5.1-2.7V7.5" />
    </>
  ),
  // 끈에 매단 부적
  talisman: (
    <>
      <path d="M8.5 3 12 7l3.5-4" />
      <ellipse cx="12" cy="14" rx="5.5" ry="6.5" />
      <path d="m12 11 2 3-2 3-2-3z" />
    </>
  ),
}

/** 장비 부위 아이콘. 글자 라벨 옆에 붙이는 장식이라 스크린리더에는 숨긴다. 크기는 className 으로 준다. */
export function EquipIcon({ equip, className }: { equip: EquipKey; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cx('shrink-0', className)}
    >
      {SHAPES[equip]}
    </svg>
  )
}
