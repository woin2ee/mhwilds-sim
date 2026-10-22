// 공통 UI 기본 요소. 색상은 index.css 의 의미 기반 토큰(bg-surface, text-muted 등)만 사용한다.
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from '../lib/cx'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md'

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:brightness-110 border border-transparent',
  secondary: 'bg-surface-2 text-fg hover:border-muted border border-line',
  ghost: 'bg-transparent text-muted hover:text-fg hover:bg-surface-2 border border-transparent',
  danger: 'bg-transparent text-bad hover:bg-bad/10 border border-bad/40',
}
const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: 'h-7 px-2 text-xs gap-1',
  md: 'h-9 px-3 text-sm gap-1.5',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        BUTTON_VARIANT[variant],
        BUTTON_SIZE[size],
        className,
      )}
      {...props}
    />
  )
}

export function Panel({
  title,
  actions,
  children,
  className,
}: {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cx('rounded-lg border border-line bg-surface', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {actions && <div className="flex flex-wrap items-center justify-end gap-1.5">{actions}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: ReactNode
  description?: ReactNode
  disabled?: boolean
}) {
  return (
    <label className={cx('flex cursor-pointer items-start gap-2 text-sm', disabled && 'cursor-default opacity-50')}>
      <input
        type="checkbox"
        className="mt-0.5 size-4 accent-[var(--accent)]"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span>{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
    </label>
  )
}

/** icon 을 주면 아이콘만 보이고, label 은 툴팁과 스크린리더가 읽는 이름이 된다 */
type SegmentedOption<T extends string> =
  | { value: T; label: ReactNode; icon?: undefined }
  | { value: T; label: string; icon: ReactNode }

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
  ariaLabel,
  className,
}: {
  value: T
  options: readonly SegmentedOption<T>[]
  onChange: (value: T) => void
  size?: 'sm' | 'md'
  ariaLabel?: string
  className?: string
}) {
  return (
    <div
      className={cx('inline-flex rounded-md border border-line bg-surface-2 p-0.5', className)}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const iconOnly = option.icon !== undefined
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === value}
            aria-label={iconOnly ? option.label : undefined}
            title={iconOnly ? option.label : undefined}
            onClick={() => onChange(option.value)}
            className={cx(
              'rounded font-medium transition-colors',
              size === 'sm' ? 'h-6 text-xs' : 'h-8 text-sm',
              iconOnly ? 'inline-flex items-center justify-center' : 'px-2.5',
              iconOnly && (size === 'sm' ? 'w-6' : 'w-8'),
              option.value === value ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
            )}
          >
            {iconOnly ? option.icon : option.label}
          </button>
        )
      })}
    </div>
  )
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded border border-line bg-surface-2 px-1.5 py-px text-[11px] text-muted',
        className,
      )}
    >
      {children}
    </span>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-dashed border-line px-4 py-8 text-center text-sm text-muted">{children}</div>
}

/** 1 ~ max 레벨 선택 */
export function LevelSelect({
  value,
  max,
  min = 1,
  onChange,
  className,
  ariaLabel = '레벨',
}: {
  value: number
  max: number
  min?: number
  onChange: (level: number) => void
  className?: string
  ariaLabel?: string
}) {
  const levels = Array.from({ length: Math.max(0, max - min + 1) }, (_, i) => min + i)
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cx('h-8 rounded-md border border-line bg-surface-2 px-1.5 text-sm', className)}
    >
      {levels.map((level) => (
        <option key={level} value={level}>
          Lv{level}
        </option>
      ))}
    </select>
  )
}
