import type { Slot } from '../core/types'
import { SLOT_KIND_LABEL } from '../data/labels'
import type { SlotLevel } from '../data/types'
import { cx } from '../lib/cx'

/** 레벨별 색 (index.css 의 slot-1/2/3). Tailwind 가 찾을 수 있게 클래스 이름을 통째로 적는다. */
const LEVEL_COLOR: Record<SlotLevel, { border: string; fill: string; text: string }> = {
  1: { border: 'border-slot-1', fill: 'bg-slot-1/25', text: 'text-slot-1' },
  2: { border: 'border-slot-2', fill: 'bg-slot-2/25', text: 'text-slot-2' },
  3: { border: 'border-slot-3', fill: 'bg-slot-3/25', text: 'text-slot-3' },
}

/**
 * 장식주 슬롯 표시. 게임 아이콘을 쓰지 않고 직접 그린다.
 * 모양 = 종류(방어구 슬롯 = 원, 무기 슬롯 = 마름모), 색 = 레벨. filled = 장식주가 들어 있음.
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
  const color = LEVEL_COLOR[slot.level]
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
          color.border,
          weapon ? 'inset-[2px] rotate-45 rounded-[2px]' : 'inset-0 rounded-full',
          filled && color.fill,
        )}
      />
      <span className={cx('relative leading-none', color.text)}>{slot.level}</span>
    </span>
  )
}

/** 무기 슬롯 먼저, 같은 종류면 레벨 높은 순 */
function compareSlots(a: Slot, b: Slot): number {
  if (a.kind !== b.kind) return a.kind === 'weapon' ? -1 : 1
  return b.level - a.level
}

/** sorted = 남은 슬롯 요약처럼 무기 슬롯 먼저·레벨 높은 순으로 보여 준다. 없으면 받은 순서(장비의 슬롯 순서) 그대로. */
export function SlotList({
  slots,
  size = 'md',
  empty = '—',
  sorted = false,
}: {
  slots: readonly Slot[]
  size?: 'sm' | 'md'
  empty?: string
  sorted?: boolean
}) {
  if (slots.length === 0) return <span className="text-xs text-muted">{empty}</span>
  const list = sorted ? [...slots].sort(compareSlots) : slots
  return (
    <span className="inline-flex flex-wrap items-center gap-0.5">
      {list.map((slot, i) => (
        <SlotBadge key={i} slot={slot} size={size} />
      ))}
    </span>
  )
}
