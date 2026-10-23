import { useMemo, useState } from 'react'
import { Button, EmptyState, Segmented } from '../../components/ui'
import type { SearchRequest, SearchResponse, SearchResultItem, SearchSort } from '../../core/search/types'
import { useDb } from '../../state/context'
import { formatCount } from './format'
import { ResultCard, type CompareControl, type ExcludeControl } from './ResultCard'

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
  exclude,
  compare,
}: {
  items: SearchResultItem[]
  request: SearchRequest
  exclude: ExcludeControl
  compare: CompareControl
}) {
  const [shown, setShown] = useState(PAGE_SIZE)
  return (
    <div className="space-y-2.5">
      {items.slice(0, shown).map((item, i) => (
        <ResultCard key={item.id} item={item} request={request} index={i + 1} exclude={exclude} compare={compare} />
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
  if (!request.useDecorations) hints.unshift('‘장식주 없이 찾기’를 끄면 모자란 스킬을 장식주로 채워요.')
  if (request.excludedSkills.length > 0 && request.excludeMode === 'exclude') {
    hints.push('비선호 스킬을 ‘표시만’으로 바꾸거나 줄여 보세요.')
  }
  if (!request.includeLowRank) hints.push('‘하위 랭크 방어구 포함’을 켜 보세요.')
  // 초월·무기 슬롯은 장식주를 넣을 자리만 늘리므로 장식주 없이 찾을 때는 도움이 안 된다
  if (!request.transcend && request.useDecorations) hints.push('초월한 방어구가 있다면 ‘방어구 초월 적용’을 켜 보세요.')
  if (request.talismans.length === 0) hints.push('호석을 ‘자동’으로 바꿔 보세요.')
  if (hasWeaponSkill && request.weapon.slots.length === 0 && request.useDecorations) {
    hints.push('무기 스킬은 무기 슬롯이 있어야 장식주로 채울 수 있어요. 무기를 지정해 보세요.')
  }
  return hints
}

export function ResultList({
  request,
  response,
  onSortChange,
  exclude,
  compare,
}: {
  request: SearchRequest
  response: SearchResponse
  onSortChange: (sort: SearchSort) => void
  /** 추가 스킬 칩에서 비선호 스킬을 넣고 뺄 때 쓰는 지금 검색 조건 */
  exclude: ExcludeControl
  compare: CompareControl
}) {
  const db = useDb()
  const { items } = response
  const variantTotal = useMemo(() => items.reduce((n, item) => n + item.variantCount, 0), [items])
  const hasWeaponSkill = request.required.some((r) => db.skills.get(r.skillId)?.kind === 'weapon')
  // 탐색 상한에 걸리면 전체 개수는 '최소' 개수다
  const atLeast = response.truncated ? ' 이상' : ''

  if (items.length === 0) {
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
          <span className="font-semibold">결과 {formatCount(items.length)}건</span>
          {response.total > items.length && (
            <span className="text-muted">
              {' '}
              (전체 {formatCount(response.total)}건{atLeast} 중 상위)
            </span>
          )}
          <span className="ml-2 text-xs text-muted">
            {!request.useDecorations && '장식주 없이 · '}대체 방어구 포함 {formatCount(variantTotal)}개 조합 ·{' '}
            {formatElapsed(response.elapsedMs)}
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

      <PagedCards items={items} request={request} exclude={exclude} compare={compare} />
    </div>
  )
}
