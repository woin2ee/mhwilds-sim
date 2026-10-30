import type { EquipKey } from '../core/types'
import { cx } from '../lib/cx'
import { EQUIP_ICON_PATHS } from './equipIconPaths'

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
      {EQUIP_ICON_PATHS[equip].map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  )
}
