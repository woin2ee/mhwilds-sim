import type { ReactNode } from 'react'
import { cx } from '../lib/cx'
import type { TabId } from '../state/context'
import { EquipIcon } from './EquipIcon'

// EquipIcon 과 같은 24×24 선 도형. 수동 세팅·내 호석은 장비 부위 아이콘(투구·호석)을 그대로 쓴다.
const SHAPES: Record<Exclude<TabId, 'manual' | 'talismans'>, ReactNode> = {
  // 돋보기
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.3 15.3 5.2 5.2" />
    </>
  ),
  // 책갈피
  saved: <path d="M18.5 21 12 17l-6.5 4V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2z" />,
  // 보관 상자
  backup: (
    <>
      <rect x="3" y="4" width="18" height="5" rx="1" />
      <path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9" />
      <path d="M10 13h4" />
    </>
  ),
}

/** 탭 메뉴 아이콘. 글자 라벨 옆에 붙이는 장식이라 스크린리더에는 숨긴다. 크기는 className 으로 준다. */
export function TabIcon({ tab, className }: { tab: TabId; className?: string }) {
  if (tab === 'manual') return <EquipIcon equip="head" className={className} />
  if (tab === 'talismans') return <EquipIcon equip="talisman" className={className} />
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
      {SHAPES[tab]}
    </svg>
  )
}
