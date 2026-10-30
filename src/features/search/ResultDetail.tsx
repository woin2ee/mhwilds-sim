import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { SectionTitle } from '../../components/controls'
import { Dialog } from '../../components/Dialog'
import { SlotBadge } from '../../components/SlotBadge'
import { Button } from '../../components/ui'
import { computeBuild, unwantedSkillsOf, type BuildSummary } from '../../core/calc'
import { suggestName } from '../../core/savedBuilds'
import { resultToBuild } from '../../core/search/toBuild'
import type { SearchRequest, SearchResultItem } from '../../core/search/types'
import { canTranscend } from '../../core/transcend'
import { EQUIP_KEYS, type BuildState, type EquipKey } from '../../core/types'
import { nameOf, type GameDb } from '../../data/db'
import { skillName, skillPointsText } from '../../data/format'
import { WEAPON_KIND_LABEL } from '../../data/labels'
import { cx } from '../../lib/cx'
import { useAppState, useDb } from '../../state/context'
import { COMPARE_MAX } from '../compare/compareRows'
import { EQUIP_LABEL } from '../manual/labels'
import { DefenseSection, ResistanceSection, SkillSections } from '../manual/SummaryPanel'
import { SaveBuildDialog } from '../saved/SaveBuildDialog'
import { buildKey, isAlternative, NO_VARIANT, type ResultVariant } from './compareList'
import type { CompareControl } from './ResultCard'

/** 목록에 보이는 결과 하나 (index = 검색 결과 안의 순위 #N) */
interface DetailEntry {
  item: SearchResultItem
  index: number
}

/**
 * 검색 결과 상세 창. 결과 카드를 누르면 목록 모양은 그대로 두고 위에 띄운다 (휴대폰은 화면 아래 시트).
 * 창이 목록을 가리므로 이전·다음(← → 키)으로 목록 순서대로 넘겨 보고, 카드처럼 비교·저장·수동 세팅에서 열기를 바로 한다.
 * 카드에서 고른 대체 방어구·호석(variants)대로 보인다
 */
export function ResultDetailDialog({
  entries,
  openId,
  onOpen,
  request,
  variants,
  compare,
}: {
  /** 목록에 보이는 결과 (숨긴 것 빼고 목록 순서). 이전·다음은 이 순서로 */
  entries: readonly DetailEntry[]
  /** 상세를 연 결과 id (null 이면 닫힘) */
  openId: string | null
  onOpen: (id: string | null) => void
  request: SearchRequest
  variants: ReadonlyMap<string, ResultVariant>
  compare: CompareControl
}) {
  const { db, customTalismans } = useAppState()
  const position = openId === null ? -1 : entries.findIndex((e) => e.item.id === openId)
  const entry = position >= 0 ? entries[position] : undefined
  const prev = position > 0 ? entries[position - 1] : undefined
  const next = position >= 0 && position < entries.length - 1 ? entries[position + 1] : undefined
  const variant = (entry && variants.get(entry.item.id)) ?? NO_VARIANT
  const build = useMemo(() => entry && resultToBuild(db, entry.item, request, variant), [db, entry, request, variant])
  const summary = useMemo(() => build && computeBuild(db, build, customTalismans), [db, build, customTalismans])
  const bodyRef = useRef<HTMLDivElement>(null)

  // 다른 결과로 넘기면 본문을 맨 위부터 보인다 (본문 스크롤 칸은 Dialog 안에서 이 div 를 바로 감싼다)
  useLayoutEffect(() => {
    bodyRef.current?.parentElement?.scrollTo({ top: 0 })
  }, [openId])

  // ← → 키로 이전·다음. 입력 칸이나 이 창 위에 연 저장 창에서는 넘기지 않는다
  useEffect(() => {
    if (!entry) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      const target = event.key === 'ArrowLeft' ? prev : event.key === 'ArrowRight' ? next : undefined
      const from = event.target instanceof Element ? event.target : null
      const own = bodyRef.current?.closest('dialog')
      if (!target || from?.closest('input, textarea, select') || (from?.closest('dialog') ?? own) !== own) return
      event.preventDefault()
      onOpen(target.item.id)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [entry, prev, next, onOpen])

  return (
    <Dialog
      open={entry !== undefined}
      onClose={() => onOpen(null)}
      title={entry ? `#${entry.index} 상세` : ''}
      className="sm:w-[min(48rem,calc(100vw-2rem))]"
      footer={
        entry &&
        build && (
          <>
            <div className="mr-auto flex gap-1.5">
              <Button size="sm" disabled={!prev} title="이전 결과 (←)" onClick={() => prev && onOpen(prev.item.id)}>
                ‹ 이전
              </Button>
              <Button size="sm" disabled={!next} title="다음 결과 (→)" onClick={() => next && onOpen(next.item.id)}>
                다음 ›
              </Button>
            </div>
            {/* 저장했는지 같은 버튼 상태는 결과마다 따로 */}
            <DetailActions
              key={entry.item.id}
              entry={entry}
              build={build}
              request={request}
              alternative={isAlternative(entry.item, variant)}
              compare={compare}
              onClose={() => onOpen(null)}
            />
          </>
        )
      }
    >
      {build && summary && (
        <div ref={bodyRef}>
          <ResultDetail build={build} summary={summary} excludedSkills={request.excludedSkills} />
        </div>
      )}
    </Dialog>
  )
}

/** 상세 창 아래 버튼: 카드와 같은 비교·저장·수동 세팅에서 열기 (알림은 창에 가려지므로 버튼 글자로 알린다) */
function DetailActions({
  entry,
  build,
  request,
  alternative,
  compare,
  onClose,
}: {
  entry: DetailEntry
  build: BuildState
  request: SearchRequest
  /** 대표 대신 대체 방어구·호석을 고른 세팅 (비교 목록 표시) */
  alternative: boolean
  compare: CompareControl
  onClose: () => void
}) {
  const { db, openInManual } = useAppState()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const key = useMemo(() => buildKey(build), [build])
  const compared = compare.has(key)
  const toggleCompare = () => {
    if (compared) compare.remove(key)
    else compare.add({ key, build, request, index: entry.index, variant: alternative })
  }
  return (
    <div className="flex gap-1.5">
      <Button
        size="sm"
        variant={compared ? 'primary' : 'ghost'}
        aria-pressed={compared}
        disabled={!compared && compare.full}
        title={
          compared
            ? '비교 목록에서 빼기'
            : compare.full
              ? `비교는 ${COMPARE_MAX}개까지 할 수 있어요`
              : '비교 목록에 넣기'
        }
        onClick={toggleCompare}
      >
        {compared ? '✓ 비교' : '비교'}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setSaving(true)}>
        {saved ? '✓ 저장함' : '저장'}
      </Button>
      <Button
        size="sm"
        onClick={() => {
          // 탭을 옮기기 전에 닫아야 숨은 검색 화면에 창이 남지 않는다
          onClose()
          openInManual(build)
        }}
      >
        {/* 휴대폰 폭에는 다 안 들어가서 줄인다 (버튼 안 gap 때문에 글자를 둘로 나누지 않는다) */}
        <span className="sm:hidden">수동 세팅</span>
        <span className="max-sm:hidden">수동 세팅에서 열기</span>
      </Button>
      {saving && (
        <SaveBuildDialog
          open
          onClose={() => setSaving(false)}
          build={build}
          defaultName={suggestName(db, request.required)}
          onSaved={() => setSaved(true)}
        />
      )}
    </div>
  )
}

/**
 * 검색 결과 상세 창의 본문: 카드에 다 못 싣는 방어력(기본 · 강화 최대)·내성 다섯 가지·부위마다 슬롯에 넣는 장식주와 장비 자체 스킬,
 * 발동 스킬의 효과·출처(수동 세팅 결과와 같은 목록). 창이 넓으면 장비 | 스킬 두 칸으로 나눈다
 */
function ResultDetail({
  build,
  summary,
  excludedSkills,
}: {
  build: BuildState
  summary: BuildSummary
  /** 결과를 만든 검색의 비선호 스킬. 카드처럼 그 스킬과 그 스킬을 주는 장식주를 빨강으로 */
  excludedSkills: readonly number[]
}) {
  const db = useDb()
  const unwanted = new Set(unwantedSkillsOf(summary, excludedSkills))
  // 무기는 지정했을 때만 (무기 없이 찾으면 줄을 빼고, 호석은 없어도 '없음'으로 둔다)
  const keys = EQUIP_KEYS.filter((key) => key !== 'weapon' || summary.equipment.weapon)
  return (
    <div className="@container">
      <div className="grid gap-x-6 gap-y-4 @xl:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <DefenseSection summary={summary} />
          <ResistanceSection summary={summary} />
          <section>
            <SectionTitle>장비 · 장식주</SectionTitle>
            <ul className="divide-y divide-line">
              {keys.map((key) => (
                <EquipLine key={key} db={db} equipKey={key} build={build} summary={summary} unwanted={unwanted} />
              ))}
            </ul>
          </section>
        </div>
        <div className="min-w-0 space-y-4">
          <SkillSections summary={summary} />
        </div>
      </div>
    </div>
  )
}

/** 장비 한 줄: 이름(레어도·초월), 장비 자체 스킬과 시리즈·그룹 스킬, 슬롯마다 넣는 장식주 (빈 슬롯 포함) */
function EquipLine({
  db,
  equipKey,
  build,
  summary,
  unwanted,
}: {
  db: GameDb
  equipKey: EquipKey
  build: BuildState
  summary: BuildSummary
  unwanted: ReadonlySet<number>
}) {
  const equipment = summary.equipment[equipKey]
  const usages = summary.slots.filter((s) => s.key === equipKey)
  const choice = equipKey === 'weapon' || equipKey === 'talisman' ? null : build.armor[equipKey]
  const piece = choice ? db.armor.get(choice.id) : undefined
  const weapon = equipKey === 'weapon' && build.weapon?.type === 'db' ? db.weapons.get(build.weapon.id) : undefined
  const tags = piece ? [`R${piece.rarity}`, ...(choice?.transcend && canTranscend(piece) ? ['초월'] : [])] : []
  // 무기 자체 스킬은 비선호로 세지 않는다 (unwantedSkillsOf)
  const isUnwanted = (skillId: number) => equipKey !== 'weapon' && unwanted.has(skillId)

  return (
    <li className="flex gap-2 py-1.5">
      <span className="w-7 shrink-0 pt-0.5 text-xs text-muted">{EQUIP_LABEL[equipKey]}</span>
      {equipment ? (
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm break-keep">
            {weapon && <span className="text-muted">{WEAPON_KIND_LABEL[weapon.kind]} · </span>}
            {equipment.name}
            {tags.length > 0 && <span className="ml-1 text-[11px] text-muted">{tags.join(' · ')}</span>}
          </p>
          {(equipment.skills.length > 0 || equipment.bonusSkillIds.length > 0) && (
            <p className="text-xs text-muted">
              {equipment.skills.map((p, i) => (
                <Fragment key={p.skillId}>
                  {i > 0 && ' · '}
                  <span className={cx(isUnwanted(p.skillId) && 'text-bad')}>
                    {skillName(db, p.skillId)} {p.level}
                  </span>
                </Fragment>
              ))}
              {equipment.bonusSkillIds.map((id, i) => (
                <Fragment key={id}>
                  {(i > 0 || equipment.skills.length > 0) && ' · '}
                  <span className="text-accent">{skillName(db, id)}</span>
                </Fragment>
              ))}
            </p>
          )}
          {usages.length > 0 && (
            <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
              {usages.map((usage) => {
                const decoration = usage.decorationId !== null ? db.decorations.get(usage.decorationId) : undefined
                return (
                  <li key={usage.index} className="inline-flex min-w-0 items-center gap-1">
                    <SlotBadge slot={usage.slot} size="sm" filled={decoration !== undefined} />
                    {decoration ? (
                      <span
                        title={skillPointsText(db, decoration.skills)}
                        className={cx(decoration.skills.some((p) => unwanted.has(p.skillId)) && 'text-bad')}
                      >
                        {nameOf(decoration.name)}
                      </span>
                    ) : (
                      <span className="text-muted">빈 슬롯</span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : (
        <span className="text-sm text-muted">{equipKey === 'talisman' ? '없음' : '미장착'}</span>
      )}
    </li>
  )
}
