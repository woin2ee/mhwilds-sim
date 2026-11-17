import type { ReactNode } from 'react'
import { Button } from '../../components/ui'
import { weaponLabel, type RerollEntry, type RerollRoute } from '../../core/gogmaRolls'
import { cx } from '../../lib/cx'

/**
 * 루트 요약과 진행: 차례를 '태도 물 5 → 수렵피리 용 7' 처럼 한 줄로, 그 아래 몇 번째까지 했는지와 다음 할 일.
 * 칸의 내용(스킬)은 표에서 보므로 여기선 무기와 번째만 보인다
 */
export function RouteView<T extends RerollEntry>({
  route,
  progress,
  actionOf,
  tagOf,
  onForward,
  onBack,
  tips,
}: {
  route: RerollRoute<T>
  progress: number
  /** 다음 할 일에 보이는 동작. 예: '재부여', '격화', '초기화' */
  actionOf: (stop: T) => string
  /** 루트 요약의 차례 옆 짧은 표시 (예: '격화', '수치 재부여') */
  tagOf?: (stop: T) => string | undefined
  onForward: () => void
  onBack: () => void
  tips: ReactNode
}) {
  const next = progress + 1
  const isDone = (stop: T) => stop.done === true || stop.step <= progress
  const nextStop = route.stops.find((s) => !isDone(s))
  const remaining = nextStop ? route.total - progress : 0

  return (
    <div className="space-y-3">
      {route.stops.length === 0 ? (
        <p className="text-sm text-muted">표에 잘 뜬 칸을 적으면 재료를 가장 아끼는 순서를 짜 줘요.</p>
      ) : (
        <ol className="flex flex-wrap items-center gap-x-1 gap-y-1.5 text-sm" aria-label="루트">
          {route.stops.map((stop, i) => {
            const done = isDone(stop)
            const tag = tagOf?.(stop)
            return (
              <li key={stop.id} className="flex items-center gap-1">
                {i > 0 && (
                  <span className="text-muted" aria-hidden>
                    →
                  </span>
                )}
                <span
                  className={cx(
                    'rounded-md px-1.5 py-0.5 whitespace-nowrap',
                    done ? 'text-muted line-through' : stop === nextStop ? 'bg-accent text-accent-fg' : 'bg-good/15',
                  )}
                >
                  {weaponLabel(stop)} <b className="tabular-nums">{stop.step}</b>
                  {tag && <span className={done || stop === nextStop ? '' : 'text-muted'}> {tag}</span>}
                </span>
              </li>
            )
          })}
        </ol>
      )}

      {/* 진행 */}
      <div className="space-y-2 rounded-md border border-line bg-surface-2/50 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm">
            <b className="tabular-nums">{progress}</b>번째까지 했어요
          </span>
          <span className="flex gap-1.5">
            <Button size="sm" variant="ghost" disabled={progress === 0} onClick={onBack}>
              되돌리기
            </Button>
            {/* 따라갈 루트가 있을 때만 강조한다. 표가 비었을 때도 주황이면 '+ 무기 열 더하기'와 눈길을 다퉜다 */}
            <Button size="sm" variant={nextStop ? 'primary' : 'secondary'} onClick={onForward}>
              한 번 했어요
            </Button>
          </span>
        </div>
        {nextStop && (
          <p className="text-xs text-muted">
            다음 <b className="text-fg">{next}번째</b>:{' '}
            {nextStop.step === next ? (
              <b className="text-fg">
                {weaponLabel(nextStop)} {actionOf(nextStop)}
              </b>
            ) : (
              <>
                넘기기 — {nextStop.step}번째 {weaponLabel(nextStop)}까지 {nextStop.step - next}번
              </>
            )}
            <span className="block">루트 끝까지 {remaining}번 남았어요.</span>
          </p>
        )}
      </div>

      {route.left.length > 0 && (
        <p className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          루트에 못 넣은 무기: {route.left.map(weaponLabel).join(', ')} — 다른 무기와 같은 번째에만 잘 떴거나 남은 번째에 기록이
          없어요.
        </p>
      )}
      <details className="text-xs text-muted">
        {/* 글자 한 줄(16px)이라 누르기 어려워서 위아래 여백으로 누르는 곳을 넓힌다 (터치 기기 36px) */}
        <summary className="cursor-pointer py-1 select-none hover:text-fg pointer-coarse:py-2.5">넘기기 요령</summary>
        <p className="mt-1.5 leading-relaxed">{tips}</p>
      </details>
    </div>
  )
}
