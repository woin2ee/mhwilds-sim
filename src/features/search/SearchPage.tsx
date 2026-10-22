import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, EmptyState, Panel, Segmented, Toggle } from '../../components/ui'
import { SearchCancelledError, SearchClient, type RunningSearch } from '../../core/search/client'
import type {
  ExcludeMode,
  SearchProgress,
  SearchRequest,
  SearchResponse,
  SearchSort,
} from '../../core/search/types'
import { usePersistentState } from '../../lib/storage'
import { useAppState } from '../../state/context'
import {
  DEFAULT_CONDITIONS,
  buildRequest,
  isStoredConditions,
  normalizeConditions,
  requestKey,
  type SearchConditions,
} from './conditions'
import { formatCount } from './format'
import { ExcludedSkills, RequiredSkills } from './RequiredSkills'
import { ResultList } from './ResultList'
import { TalismanCondition } from './TalismanCondition'
import { WeaponCondition } from './WeaponCondition'

const EXCLUDE_MODE_OPTIONS: { value: ExcludeMode; label: string }[] = [
  { value: 'deprioritize', label: '아래에 따로 표시' },
  { value: 'exclude', label: '아예 제외' },
]
const EXCLUDE_MODE_HELP: Record<ExcludeMode, string> = {
  deprioritize: '비선호 스킬이 들어간 조합은 결과 맨 아래 ‘비선호 결과’로 따로 모아요.',
  exclude: '비선호 스킬이 붙은 방어구·호석·장식주를 후보에서 아예 빼고 찾아요.',
}

interface SearchResultState {
  seq: number
  request: SearchRequest
  response: SearchResponse
}

export function SearchPage() {
  const { db, customTalismans } = useAppState()
  const [stored, setStored] = usePersistentState<Partial<SearchConditions>>(
    'search-conditions:v1',
    DEFAULT_CONDITIONS,
    isStoredConditions,
  )
  const cond = useMemo(() => normalizeConditions(stored), [stored])
  const patch = useCallback(
    (change: Partial<SearchConditions>) => setStored((prev) => ({ ...normalizeConditions(prev), ...change })),
    [setStored],
  )
  const request = useMemo(() => buildRequest(db, cond, customTalismans), [db, cond, customTalismans])

  // ---- 검색 실행 ----
  const clientRef = useRef<SearchClient | null>(null)
  const runningRef = useRef<RunningSearch | null>(null)
  const lastRequestRef = useRef<SearchRequest | null>(null)
  const seqRef = useRef(0)
  const [progress, setProgress] = useState<SearchProgress | null>(null)
  const [result, setResult] = useState<SearchResultState | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(
    () => () => {
      runningRef.current?.cancel()
      runningRef.current = null
      clientRef.current?.dispose()
      clientRef.current = null
    },
    [db],
  )

  const run = useCallback(
    (req: SearchRequest) => {
      runningRef.current?.cancel()
      clientRef.current ??= new SearchClient(db.data)
      lastRequestRef.current = req
      setError(null)
      setProgress({ ratio: 0, found: 0 })
      const running = clientRef.current.search(req, setProgress)
      runningRef.current = running
      running.promise
        .then((response) => {
          if (runningRef.current !== running) return
          runningRef.current = null
          setProgress(null)
          setResult({ seq: ++seqRef.current, request: req, response })
        })
        .catch((err: unknown) => {
          if (runningRef.current !== running) return
          runningRef.current = null
          setProgress(null)
          if (!(err instanceof SearchCancelledError)) setError(err instanceof Error ? err.message : String(err))
        })
    },
    [db],
  )

  const onSortChange = (sort: SearchSort) => {
    patch({ sort })
    if (lastRequestRef.current) run({ ...lastRequestRef.current, sort })
  }

  const running = progress !== null
  const currentKey = useMemo(() => requestKey(request), [request])
  const resultKey = useMemo(() => (result ? requestKey(result.request) : null), [result])
  const stale = resultKey !== null && resultKey !== currentKey
  const isWeaponSkill = (skillId: number) => db.skills.get(skillId)?.kind === 'weapon'
  const weaponSkillWithoutWeapon =
    request.required.some((r) => isWeaponSkill(r.skillId)) &&
    request.weapon.slots.length === 0 &&
    request.weapon.skills.length === 0 &&
    !request.talismans.some(
      (t) => t.slots.some((s) => s.kind === 'weapon') || t.skills.some((p) => isWeaponSkill(p.skillId)),
    )

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)] lg:items-start">
      <div className="space-y-4">
        <Panel
          title="원하는 스킬"
          actions={
            cond.required.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => patch({ required: [] })}>
                비우기
              </Button>
            )
          }
        >
          <RequiredSkills
            required={cond.required}
            excluded={cond.excluded}
            onChange={(required) => patch({ required })}
          />
        </Panel>

        <Panel
          title="비선호 스킬"
          actions={
            cond.excluded.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => patch({ excluded: [] })}>
                비우기
              </Button>
            )
          }
        >
          <div className="space-y-3">
            <ExcludedSkills
              excluded={cond.excluded}
              required={cond.required}
              onChange={(excluded) => patch({ excluded })}
            />
            <div className="space-y-1.5">
              <Segmented
                size="sm"
                value={cond.excludeMode}
                options={EXCLUDE_MODE_OPTIONS}
                onChange={(excludeMode) => patch({ excludeMode })}
              />
              <p className="text-xs text-muted">{EXCLUDE_MODE_HELP[cond.excludeMode]}</p>
            </div>
          </div>
        </Panel>

        <Panel title="무기">
          <WeaponCondition cond={cond} onChange={patch} />
        </Panel>

        <Panel title="호석">
          <TalismanCondition cond={cond} onChange={patch} />
        </Panel>

        <Panel title="옵션">
          <div className="space-y-2.5">
            <Toggle
              checked={cond.includeLowRank}
              onChange={(includeLowRank) => patch({ includeLowRank })}
              label="하위 랭크 방어구 포함"
              description="레어도 1~4 방어구도 후보에 넣어요."
            />
            <Toggle
              checked={cond.transcend}
              onChange={(transcend) => patch({ transcend })}
              label="방어구 초월 적용"
              description="레어도 5는 슬롯 3칸 +1, 레어도 6은 앞 2칸 +1 (빈 칸은 Lv1, 최대 Lv3). 레어도 5~8은 최대 방어력도 올라가요."
            />
          </div>
        </Panel>
      </div>

      <div className="min-w-0 space-y-4">
        <Panel>
          <div className="flex flex-wrap items-center gap-3">
            {running ? (
              <Button className="min-w-24" onClick={() => runningRef.current?.cancel()}>
                취소
              </Button>
            ) : (
              <Button
                variant="primary"
                className="min-w-24"
                disabled={request.required.length === 0}
                onClick={() => run(request)}
              >
                검색
              </Button>
            )}
            <p className="text-sm text-muted">
              원하는 스킬 {request.required.length}개 · 비선호 {request.excludedSkills.length}개
              {request.excludedSkills.length > 0 && ` (${cond.excludeMode === 'exclude' ? '제외' : '아래에 표시'})`} · 호석
              후보 {request.talismans.length}개
            </p>
          </div>
          {running && (
            <div className="mt-3 space-y-1">
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-accent transition-[width]"
                  style={{ width: `${Math.round(progress.ratio * 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted">
                탐색 중… {Math.round(progress.ratio * 100)}% · {formatCount(progress.found)}건 발견
              </p>
            </div>
          )}
          {request.required.length === 0 && (
            <p className="mt-2 text-xs text-muted">원하는 스킬을 하나 이상 추가하면 검색할 수 있어요.</p>
          )}
          {weaponSkillWithoutWeapon && (
            <p className="mt-2 text-xs text-warn">
              무기 스킬은 무기·호석·무기 장식주로만 얻을 수 있어요. 무기나 무기 슬롯을 지정하세요.
            </p>
          )}
          {stale && !running && <p className="mt-2 text-xs text-warn">조건이 바뀌었어요. 다시 검색하면 반영돼요.</p>}
        </Panel>

        {error && (
          <p className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
            검색 중 오류가 발생했어요: {error}
          </p>
        )}

        {result ? (
          <div className={running ? 'pointer-events-none opacity-60' : undefined}>
            <ResultList
              key={result.seq}
              request={result.request}
              response={result.response}
              onSortChange={onSortChange}
            />
          </div>
        ) : (
          !running && <EmptyState>원하는 스킬을 고르고 검색을 눌러 주세요.</EmptyState>
        )}
      </div>
    </div>
  )
}
