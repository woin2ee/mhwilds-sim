import { useMemo, useState } from 'react'
import { Button, EmptyState, Segmented } from '../../components/ui'
import type { SearchRequest, SearchResponse, SearchResultItem, SearchSort } from '../../core/search/types'
import { useDb } from '../../state/context'
import { formatCount } from './format'
import { ResultCard } from './ResultCard'

const PAGE_SIZE = 30
const SORT_OPTIONS: { value: SearchSort; label: string }[] = [
  { value: 'slots', label: '남는 슬롯' },
  { value: 'defense', label: '방어력' },
]

function formatElapsed(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}초`
}

function PagedCards({
  items,
  request,
  deprioritized = false,
}: {
  items: SearchResultItem[]
  request: SearchRequest
  deprioritized?: boolean
}) {
  const [shown, setShown] = useState(PAGE_SIZE)
  return (
    <div className="space-y-2.5">
      {items.slice(0, shown).map((item, i) => (
        <ResultCard key={item.id} item={item} request={request} index={i + 1} deprioritized={deprioritized} />
      ))}
      {items.length > shown && (
        <Button className="w-full" onClick={() => setShown((n) => n + PAGE_SIZE)}>
          더 보기 ({formatCount(items.length - shown)}건 남음)
        </Button>
      )}
    </div>
  )
}

/** 결과가 없을 때 조건별로 해 볼 만한 것 */
function emptyHints(request: SearchRequest, hasWeaponSkill: boolean): string[] {
  const hints = ['원하는 스킬의 레벨을 낮추거나 스킬 수를 줄여 보세요.']
  if (request.excludedSkills.length > 0 && request.excludeMode === 'exclude') {
    hints.push('비선호 스킬을 ‘아래에 따로 표시’로 바꾸거나 줄여 보세요.')
  }
  if (!request.includeLowRank) hints.push('‘하위 랭크 방어구 포함’을 켜 보세요.')
  if (!request.transcend) hints.push('초월한 방어구가 있다면 ‘방어구 초월 적용’을 켜 보세요.')
  if (request.talismans.length === 0) hints.push('호석을 ‘자동’으로 바꿔 보세요.')
  if (hasWeaponSkill && request.weapon.slots.length === 0) {
    hints.push('무기 스킬은 무기 슬롯이 있어야 장식주로 채울 수 있어요. 무기를 지정해 보세요.')
  }
  return hints
}

export function ResultList({
  request,
  response,
  onSortChange,
}: {
  request: SearchRequest
  response: SearchResponse
  onSortChange: (sort: SearchSort) => void
}) {
  const db = useDb()
  const { preferred, deprioritized } = response
  const [showDeprioritized, setShowDeprioritized] = useState(preferred.length === 0)
  const variantTotal = useMemo(() => preferred.reduce((n, item) => n + item.variantCount, 0), [preferred])
  const hasWeaponSkill = request.required.some((r) => db.skills.get(r.skillId)?.kind === 'weapon')
  const deprioritizedTotal = Math.max(response.totalDeprioritized, deprioritized.length)
  // 탐색 상한에 걸리면 전체 개수는 '최소' 개수다
  const atLeast = response.truncated ? ' 이상' : ''

  if (preferred.length === 0 && deprioritized.length === 0) {
    return (
      <EmptyState>
        <p className="mb-2 font-medium text-fg">조건을 만족하는 조합이 없어요.</p>
        <ul className="space-y-0.5 text-xs">
          {emptyHints(request, hasWeaponSkill).map((hint) => (
            <li key={hint}>· {hint}</li>
          ))}
        </ul>
      </EmptyState>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <span className="font-semibold">결과 {formatCount(preferred.length)}건</span>
          {response.totalPreferred > preferred.length && (
            <span className="text-muted">
              {' '}
              (전체 {formatCount(response.totalPreferred)}건{atLeast} 중 상위)
            </span>
          )}
          <span className="ml-2 text-xs text-muted">
            대체 방어구 포함 {formatCount(variantTotal)}개 조합 · {formatElapsed(response.elapsedMs)}
          </span>
        </div>
        <Segmented size="sm" value={request.sort} options={SORT_OPTIONS} onChange={onSortChange} />
      </div>

      {response.truncated && (
        <p className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          조합이 너무 많아 일부만 탐색했어요. 유망한 조합부터 찾기 때문에 상위 결과는 대부분 좋은 조합이지만 놓친 조합이 있을
          수 있어요. 스킬을 추가하거나 레벨을 올리면 범위가 좁혀져요.
        </p>
      )}

      {preferred.length > 0 ? (
        <PagedCards items={preferred} request={request} />
      ) : (
        <p className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-muted">
          비선호 스킬 없이 조건을 만족하는 조합은 없어요. 아래 비선호 결과를 확인하세요.
        </p>
      )}

      {deprioritized.length > 0 && (
        <section className="space-y-2.5 pt-2">
          <button
            type="button"
            aria-expanded={showDeprioritized}
            onClick={() => setShowDeprioritized((v) => !v)}
            className="flex w-full items-center justify-between rounded-md border border-bad/40 bg-bad/5 px-3 py-2 text-left text-sm"
          >
            <span>
              <span className="font-semibold text-bad">
                비선호 결과 {formatCount(deprioritizedTotal)}건{atLeast}
              </span>
              <span className="text-muted"> (비선호 스킬 포함)</span>
            </span>
            <span className="text-muted">{showDeprioritized ? '접기 ▴' : '펼치기 ▾'}</span>
          </button>
          {showDeprioritized && <PagedCards items={deprioritized} request={request} deprioritized />}
        </section>
      )}
    </div>
  )
}
