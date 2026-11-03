import { cx } from '../../lib/cx'

/** 즐겨찾기 별. 켠 것은 속을 채운다 (색은 currentColor) */
export function StarIcon({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinejoin="round"
      aria-hidden
      className={cx('shrink-0', className)}
    >
      <path d="M12 3 14.53 9.12 21.13 9.63 16.09 13.93 17.64 20.37 12 16.9 6.36 20.37 7.91 13.93 2.87 9.63 9.47 9.12z" />
    </svg>
  )
}

/** 내 세팅 카드 이름 앞의 즐겨찾기 켜기/끄기 */
export function FavoriteButton({ on, onToggle, className }: { on: boolean; onToggle: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label="즐겨찾기"
      title={on ? '즐겨찾기에서 빼기' : '즐겨찾기에 넣기'}
      onClick={onToggle}
      className={cx(
        'inline-flex size-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-surface-2 pointer-coarse:size-9',
        on ? 'text-accent' : 'text-muted hover:text-fg',
        className,
      )}
    >
      <StarIcon filled={on} className="size-4 pointer-coarse:size-5" />
    </button>
  )
}
