import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MobileBar } from '../../components/MobileBar'
import { Button, EmptyState, Panel, Segmented, Toggle } from '../../components/ui'
import { SearchCancelledError, SearchClient, type RunningSearch } from '../../core/search/client'
import type {
  ExcludeMode,
  SearchProgress,
  SearchRequest,
  SearchResponse,
  SearchSort,
} from '../../core/search/types'
import { cx } from '../../lib/cx'
import { useScrollMemory } from '../../lib/scroll'
import { usePersistentState } from '../../lib/storage'
import { useAppState } from '../../state/context'
import {
  DEFAULT_CONDITIONS,
  buildRequest,
  isStoredConditions,
  normalizeConditions,
  requestKey,
  withRequiredOrder,
  type SearchConditions,
} from './conditions'
import { CompareDialog } from '../compare/CompareDialog'
import { COMPARE_MAX } from '../compare/compareRows'
import { CompareTray } from '../compare/CompareTray'
import { formatCount } from './format'
import { ExcludedSkills, RequiredSkills } from './RequiredSkills'
import type { CompareControl } from './ResultCard'
import { ResultCompareActions } from './ResultCompareActions'
import { ResultList } from './ResultList'
import { SearchPresets } from './SearchPresets'
import { TalismanCondition } from './TalismanCondition'
import { WeaponCondition } from './WeaponCondition'
import { compareItemOf, compareTrayItemOf } from './compareList'
import { ExcludedArmorCondition } from './ExcludedArmorCondition'
import { excludedArmorIds } from './excludedArmor'
import { useCompareList } from './useCompareList'

const EXCLUDE_MODE_OPTIONS: { value: ExcludeMode; label: string }[] = [
  { value: 'mark', label: '표시만' },
  { value: 'exclude', label: '아예 제외' },
]
const EXCLUDE_MODE_HELP: Record<ExcludeMode, string> = {
  mark: '비선호 스킬이 든 조합도 같은 순서로 보여 주고, 결과에서 그 스킬에만 표시해요. 장식주로는 되도록 넣지 않아요.',
  exclude: '비선호 스킬이 붙은 방어구·호석·장식주를 후보에서 아예 빼고 찾아요.',
}

/** lg 미만(1단)에서 한 번에 하나만 보여 주는 패널 */
type Pane = 'conditions' | 'results'
const PANE_OPTIONS: { value: Pane; label: string }[] = [
  { value: 'conditions', label: '조건' },
  { value: 'results', label: '결과' },
]

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
  const excludedArmorCount = useMemo(() => excludedArmorIds(db, cond.excludedArmor).length, [db, cond.excludedArmor])

  // ---- 검색 실행 ----
  const clientRef = useRef<SearchClient | null>(null)
  const runningRef = useRef<RunningSearch | null>(null)
  const lastRequestRef = useRef<SearchRequest | null>(null)
  const seqRef = useRef(0)
  const [progress, setProgress] = useState<SearchProgress | null>(null)
  const [result, setResult] = useState<SearchResultState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pane, setPane] = useState<Pane>('conditions')
  const showPane = useScrollMemory(pane, setPane)
  const {
    entries: compareEntries,
    add: addCompare,
    remove: removeCompare,
    clear: clearCompare,
    relink: relinkCompare,
  } = useCompareList(db)
  const [comparing, setComparing] = useState(false)

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
      setProgress({ ratio: 0, found: 0, relaxed: false })
      const running = clientRef.current.search(req, setProgress)
      runningRef.current = running
      running.promise
        .then((response) => {
          if (runningRef.current !== running) return
          runningRef.current = null
          setProgress(null)
          const seq = ++seqRef.current
          setResult({ seq, request: req, response })
          relinkCompare(seq, req, response)
        })
        .catch((err: unknown) => {
          if (runningRef.current !== running) return
          runningRef.current = null
          setProgress(null)
          if (!(err instanceof SearchCancelledError)) setError(err instanceof Error ? err.message : String(err))
        })
    },
    [db, relinkCompare],
  )

  const onSortChange = (sort: SearchSort) => {
    patch({ sort })
    if (lastRequestRef.current) run({ ...lastRequestRef.current, sort })
  }

  const running = progress !== null
  const currentKey = useMemo(() => requestKey(request), [request])
  // 고정은 조건을 채우는 조합이 없을 때만 쓰이므로, 조건을 채운 결과가 있으면 고정만 바꿔도 다시 검색할 필요가 없다
  const resultKey = useMemo(() => {
    if (!result) return null
    const exact = result.response.total > 0 && result.response.shortfall === 0
    return requestKey(exact ? { ...result.request, lockedSkills: request.lockedSkills } : result.request)
  }, [result, request.lockedSkills])
  const stale = resultKey !== null && resultKey !== currentKey
  // 원하는 스킬 순서만 바꾸면 다시 검색하지 않아도 되므로(requestKey) 결과 칩이 바로 지금 순서를 따르게 한다
  // (순서가 같으면 결과 요청을 그대로 넘겨 결과 카드가 다시 계산하지 않는다)
  const shownRequest = useMemo(
    () => result && withRequiredOrder(result.request, request.required),
    [result, request.required],
  )
  const resultSeq = result?.seq ?? 0
  const compare = useMemo<CompareControl>(
    () => ({
      has: (key) => compareEntries.some((e) => e.key === key),
      full: compareEntries.length >= COMPARE_MAX,
      add: (entry) => addCompare({ ...entry, seq: resultSeq }),
      remove: removeCompare,
    }),
    [compareEntries, addCompare, removeCompare, resultSeq],
  )
  const compareItems = useMemo(
    () => compareEntries.map((entry) => compareItemOf(entry, resultSeq)),
    [compareEntries, resultSeq],
  )
  const isWeaponSkill = (skillId: number) => db.skills.get(skillId)?.kind === 'weapon'
  const weaponSkillWithoutWeapon =
    request.useDecorations &&
    request.required.some((r) => isWeaponSkill(r.skillId)) &&
    request.weapon.slots.length === 0 &&
    request.weapon.skills.length === 0 &&
    !request.talismans.some(
      (t) => t.slots.some((s) => s.kind === 'weapon') || t.skills.some((p) => isWeaponSkill(p.skillId)),
    )
  // 장식주 없이 찾으면 무기 스킬은 무기·호석에 붙은 것만 센다
  const weaponSkillWithoutDecorations =
    !request.useDecorations &&
    request.required.some(
      (r) =>
        isWeaponSkill(r.skillId) &&
        ![request.weapon.skills, ...request.talismans.map((t) => t.skills)].some((skills) =>
          skills.some((p) => p.skillId === r.skillId),
        ),
    )

  return (
    // 1단(lg 미만)에서는 블록으로 둬야 맨 끝의 MobileBar 가 sticky 로 화면 아래에 붙는다 (grid 칸 안에선 안 움직임)
    <div className="max-lg:space-y-4 lg:grid lg:grid-cols-[380px_minmax(0,1fr)] lg:items-start lg:gap-4">
      <div className={cx('space-y-4', pane !== 'conditions' && 'max-lg:hidden')}>
        <SearchPresets cond={cond} onLoad={setStored} />

        <Panel
          title="원하는 스킬"
          actions={
            cond.required.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => patch({ required: [], requiredDividers: [] })}>
                비우기
              </Button>
            )
          }
        >
          <RequiredSkills
            required={cond.required}
            dividers={cond.requiredDividers}
            excluded={cond.excluded}
            onChange={patch}
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

        <Panel
          title="제외할 방어구"
          actions={
            cond.excludedArmor.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => patch({ excludedArmor: [] })}>
                비우기
              </Button>
            )
          }
        >
          <ExcludedArmorCondition
            excluded={cond.excludedArmor}
            onChange={(excludedArmor) => patch({ excludedArmor })}
          />
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
              checked={cond.excludeHr100}
              onChange={(excludeHr100) => patch({ excludeHr100 })}
              label="HR 100 장비 제외"
              description="★9·★10 퀘스트 등 HR 100 이상에서만 얻는 방어구(이그졸스γ·다하딜라γ·슈바르카γ·고그·오메가 의상 등)는 빼고, 자동 호석은 HR 100 전에 만들 수 있는 등급까지만 써요. 방어구 초월도 HR 100부터 할 수 있어요."
            />
            <Toggle
              checked={cond.transcend}
              onChange={(transcend) => patch({ transcend })}
              label="방어구 초월 적용"
              description="레어도 5는 슬롯 3칸 +1, 레어도 6은 앞 2칸 +1 (빈 칸은 Lv1, 최대 Lv3). 레어도 5~8은 최대 방어력도 올라가요."
            />
            <Toggle
              checked={!cond.useDecorations}
              onChange={(withoutDecorations) => patch({ useDecorations: !withoutDecorations })}
              label="장식주 없이 찾기"
              description="방어구·호석·무기에 붙은 스킬만으로 찾고, 슬롯은 모두 비워 둬요."
            />
          </div>
        </Panel>
      </div>

      <div className={cx('min-w-0 space-y-4', pane !== 'results' && 'max-lg:hidden')}>
        <Panel>
          <div className="flex flex-wrap items-center gap-3">
            {/* 휴대폰·태블릿에서는 화면 아래 바의 버튼을 쓴다 */}
            {running ? (
              <Button className="min-w-24 max-lg:hidden" onClick={() => runningRef.current?.cancel()}>
                취소
              </Button>
            ) : (
              <Button
                variant="primary"
                className="min-w-24 max-lg:hidden"
                disabled={request.required.length === 0}
                onClick={() => run(request)}
              >
                검색
              </Button>
            )}
            <p className="text-sm text-muted">
              원하는 스킬 {request.required.length}개 · 비선호 {request.excludedSkills.length}개
              {request.excludedSkills.length > 0 && ` (${cond.excludeMode === 'exclude' ? '제외' : '표시만'})`} · 호석
              후보 {request.talismans.length}개{cond.excludeHr100 && ' · HR 100 장비 제외'}
              {excludedArmorCount > 0 && ` · 방어구 ${formatCount(excludedArmorCount)}개 제외`}
              {!request.useDecorations && ' · 장식주 없이'}
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
                {progress.relaxed ? '조건을 모두 채우는 조합이 없어 가장 가까운 조합을 찾는 중…' : '탐색 중…'}{' '}
                {Math.round(progress.ratio * 100)}% · {formatCount(progress.found)}건 발견
              </p>
            </div>
          )}
          {request.required.length === 0 && (
            <p className="mt-2 text-xs text-muted">
              원하는 스킬을 하나 이상 {cond.required.some((r) => r.off) ? '켜면' : '추가하면'} 검색할 수 있어요.
            </p>
          )}
          {weaponSkillWithoutWeapon && (
            <p className="mt-2 text-xs text-warn">
              무기 스킬은 무기·호석·무기 장식주로만 얻을 수 있어요. 무기나 무기 슬롯을 지정하세요.
            </p>
          )}
          {weaponSkillWithoutDecorations && (
            <p className="mt-2 text-xs text-warn">
              장식주 없이 찾으면 무기 스킬은 무기·호석에 붙은 것으로만 얻을 수 있어요. 그 스킬이 붙은 무기를 지정하거나
              ‘장식주 없이 찾기’를 끄세요.
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
              request={shownRequest ?? result.request}
              response={result.response}
              onSortChange={onSortChange}
              exclude={{ excluded: cond.excluded, required: cond.required, onChange: (excluded) => patch({ excluded }) }}
              compare={compare}
            />
          </div>
        ) : (
          !running && <EmptyState>원하는 스킬을 고르고 검색을 눌러 주세요.</EmptyState>
        )}

        {/* 데스크톱: 결과를 스크롤하는 동안 화면 아래에 떠 있는 비교 목록. 휴대폰·태블릿은 아래 바의 '비교' 버튼 */}
        {compareEntries.length > 0 && (
          <CompareTray
            items={compareEntries.map((entry) => compareTrayItemOf(entry, resultSeq))}
            onOpen={() => setComparing(true)}
            onRemove={removeCompare}
            onClear={clearCompare}
            className="max-lg:hidden"
          />
        )}
      </div>

      <CompareDialog
        open={comparing && compareEntries.length > 0}
        onClose={() => setComparing(false)}
        title="결과 비교"
        items={compareItems}
        onRemove={removeCompare}
        onClear={clearCompare}
        renderActions={(item) => <ResultCompareActions item={item} onClose={() => setComparing(false)} />}
      />

      {/* 휴대폰·태블릿: 조건/결과 전환 + 검색. 검색하면 결과 패널로 넘어간다 */}
      <MobileBar progress={running ? progress.ratio : null}>
        <Segmented
          value={pane}
          options={PANE_OPTIONS}
          onChange={(next) => showPane(next)}
          ariaLabel="보기 전환"
          className="shrink-0"
        />
        {compareEntries.length > 0 && (
          <Button className="shrink-0" onClick={() => setComparing(true)}>
            비교 {compareEntries.length}
          </Button>
        )}
        {running ? (
          <Button className="ml-auto min-w-24" onClick={() => runningRef.current?.cancel()}>
            취소
          </Button>
        ) : (
          <Button
            variant="primary"
            className="ml-auto min-w-24"
            disabled={request.required.length === 0}
            onClick={() => {
              run(request)
              showPane('results', { top: true })
            }}
          >
            검색
          </Button>
        )}
      </MobileBar>
    </div>
  )
}
