import { Button } from '../../components/ui'
import { cx } from '../../lib/cx'
import { COMPARE_MAX, type CompareTrayItem } from './compareRows'

/**
 * 비교 목록 바. 목록 화면 맨 끝에 두면 sticky 라서 스크롤하는 동안 화면 아래에 떠 있다.
 * 화면 아래 조작 바(MobileBar)가 있는 화면은 그 폭에서 숨기고 조작 바에 '비교' 버튼을 둔다.
 * 휴대폰 폭에서는 한 줄에 들어가게 이름 칩 대신 개수만 보여 준다 (빼기는 비교 창이나 카드에서).
 */
export function CompareTray({
  items,
  onOpen,
  onRemove,
  onClear,
  className,
}: {
  items: readonly CompareTrayItem[]
  onOpen: () => void
  onRemove: (key: string) => void
  onClear: () => void
  className?: string
}) {
  return (
    <div className={cx('sticky bottom-[calc(1rem+env(safe-area-inset-bottom))] z-20', className)}>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent bg-surface/95 px-3 py-2 shadow-lg backdrop-blur">
        <span className="text-sm font-semibold">비교</span>
        {items.map((item) => (
          <span
            key={item.key}
            className="inline-flex min-w-0 items-center rounded border border-line bg-surface-2 pl-1.5 text-xs tabular-nums max-sm:hidden"
          >
            <span className="max-w-40 truncate" title={item.label}>
              {item.label}
            </span>
            {item.note && <span className="ml-1 shrink-0 text-muted">{item.note}</span>}
            <button
              type="button"
              aria-label={`${item.label} 비교에서 빼기`}
              title="비교에서 빼기"
              onClick={() => onRemove(item.key)}
              className="shrink-0 px-1.5 py-0.5 text-muted hover:text-fg pointer-coarse:px-2.5 pointer-coarse:py-1.5"
            >
              ×
            </button>
          </span>
        ))}
        <span className="text-xs text-muted tabular-nums">
          <span className="sm:hidden">
            {items.length}/{COMPARE_MAX}
          </span>
          <span className="max-sm:hidden">
            {items.length < 2 ? '하나 더 고르면 나란히 비교해요' : `${items.length}/${COMPARE_MAX}`}
          </span>
        </span>
        <div className="ml-auto flex gap-1.5">
          <Button size="sm" variant="ghost" onClick={onClear}>
            비우기
          </Button>
          <Button size="sm" variant="primary" onClick={onOpen}>
            비교하기
          </Button>
        </div>
      </div>
    </div>
  )
}
