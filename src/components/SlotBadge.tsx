import type { Slot } from '../core/types'
import { SLOT_KIND_LABEL } from '../data/labels'
import { cx } from '../lib/cx'

/**
 * 장식주 슬롯 표시. 게임 아이콘을 쓰지 않고 직접 그린다.
 * 방어구 슬롯 = 원, 무기 슬롯 = 마름모. filled = 장식주가 들어 있음.
 */
export function SlotBadge({
  slot,
  filled = false,
  size = 'md',
  title,
}: {
  slot: Slot
  filled?: boolean
  size?: 'sm' | 'md'
  title?: string
}) {
  const weapon = slot.kind === 'weapon'
  const dimension = size === 'sm' ? 'size-4 text-[9px]' : 'size-5 text-[11px]'
  return (
    <span
      title={title ?? `${SLOT_KIND_LABEL[slot.kind]} 슬롯 Lv${slot.level}`}
      className={cx('relative inline-flex shrink-0 items-center justify-center font-bold', dimension)}
    >
      <span
        aria-hidden
        className={cx(
          'absolute border-[1.5px]',
          weapon ? 'inset-[2px] rotate-45 rounded-[2px] border-slot-weapon' : 'inset-0 rounded-full border-slot-armor',
          filled && (weapon ? 'bg-slot-weapon/25' : 'bg-slot-armor/25'),
        )}
      />
      <span className={cx('relative leading-none', weapon ? 'text-slot-weapon' : 'text-slot-armor')}>
        {slot.level}
      </span>
    </span>
  )
}

export function SlotList({ slots, size = 'md', empty = '—' }: { slots: readonly Slot[]; size?: 'sm' | 'md'; empty?: string }) {
  if (slots.length === 0) return <span className="text-xs text-muted">{empty}</span>
  return (
    <span className="inline-flex flex-wrap items-center gap-0.5">
      {slots.map((slot, i) => (
        <SlotBadge key={i} slot={slot} size={size} />
      ))}
    </span>
  )
}
