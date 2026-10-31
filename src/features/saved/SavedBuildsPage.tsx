import { useMemo, useState } from 'react'
import { EquipIcon } from '../../components/EquipIcon'
import { Badge, Button, EmptyState, Panel } from '../../components/ui'
import { NAME_MAX, newSavedBuild, weaponKindOf, type SavedBuild } from '../../core/savedBuilds'
import { WEAPON_KIND_LABEL } from '../../data/labels'
import { WEAPON_KINDS, type WeaponKind } from '../../data/types'
import { cx } from '../../lib/cx'
import { matchesQuery } from '../../lib/text'
import { useAppState } from '../../state/context'
import { useToast } from '../../state/toast'
import { CompareDialog } from '../compare/CompareDialog'
import { COMPARE_MAX, type CompareItem } from '../compare/compareRows'
import { CompareTray } from '../compare/CompareTray'
import { useSearchPresets } from '../search/conditionsContext'
import { buildSkills } from '../search/fromBuild'
import { formatDateTime } from './backupFile'
import { BackupTabLink } from './BackupPage'
import { BuildPreview } from './BuildPreview'
import { ImportDialog } from './ImportDialog'
import { EditSavedDialog } from './SaveBuildDialog'
import { SearchWithBuildDialog } from './SearchWithBuildDialog'
import { ShareDialog } from './ShareDialog'
import { useConfirmReplaceManual } from './useBuildActions'
import { useSearchWithBuild } from './useSearchWithBuild'

/** 세팅의 무기 종류 (none = 미지정: 직접 입력 무기·무기 없는 세팅에서 종류를 고르지 않음) */
type KindKey = WeaponKind | 'none'
/** 무기 종류 거르기 (all = 전체) */
type KindFilter = KindKey | 'all'

const kindLabel = (kind: KindKey) => (kind === 'none' ? '무기 미지정' : WEAPON_KIND_LABEL[kind])

/** 내 세팅: 브라우저에 저장한 세팅 목록, 공유 코드 가져오기 (백업은 백업 탭) */
export function SavedBuildsPage() {
  const { db, customTalismans, savedBuilds, setSavedBuilds, openInManual, manualSourceId } = useAppState()
  const toast = useToast()
  const confirmReplace = useConfirmReplaceManual()
  const { presets } = useSearchPresets()
  const { startNew, loadPreset } = useSearchWithBuild()
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [importOpen, setImportOpen] = useState(false)
  const [shareTarget, setShareTarget] = useState<SavedBuild | null>(null)
  const [editTarget, setEditTarget] = useState<SavedBuild | null>(null)
  /** '검색 조건으로'에서 저장한 조건을 고르는 세팅 */
  const [searchTarget, setSearchTarget] = useState<SavedBuild | null>(null)
  /** 비교할 세팅 id (넣은 순서). 지운 세팅은 빠진다. 브라우저에 저장하지 않는다 */
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [comparing, setComparing] = useState(false)

  /** 세팅 id → 무기 종류 */
  const kinds = useMemo(
    () => new Map(savedBuilds.map((s): [string, KindKey] => [s.id, weaponKindOf(db, s) ?? 'none'])),
    [db, savedBuilds],
  )
  const kindOf = (saved: SavedBuild): KindKey => kinds.get(saved.id) ?? 'none'
  /** 세팅이 있는 무기 종류만 게임 순서로, 미지정은 맨 뒤 */
  const kindGroups = useMemo(() => {
    const counts = new Map<KindKey, number>()
    for (const kind of kinds.values()) counts.set(kind, (counts.get(kind) ?? 0) + 1)
    return [...WEAPON_KINDS, 'none' as const].flatMap((key) => {
      const count = counts.get(key)
      return count ? [{ key, count }] : []
    })
  }, [kinds])
  // 종류가 하나뿐이거나 고른 종류의 세팅이 없어지면(삭제·종류 바꿈) 전체를 보인다
  const activeFilter: KindFilter =
    kindGroups.length > 1 && kindGroups.some((g) => g.key === kindFilter) ? kindFilter : 'all'

  const list = useMemo(
    () =>
      savedBuilds
        .filter((s) => activeFilter === 'all' || kinds.get(s.id) === activeFilter)
        .filter((s) => matchesQuery(query, [s.name, s.memo]))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [savedBuilds, kinds, activeFilter, query],
  )

  const compared = useMemo(
    () => compareIds.flatMap((id) => savedBuilds.find((s) => s.id === id) ?? []),
    [compareIds, savedBuilds],
  )
  const compareItems = useMemo(
    () =>
      compared.map((saved): CompareItem => {
        const kind = kinds.get(saved.id) ?? 'none'
        const badges = [kind !== 'none' ? kindLabel(kind) : '', saved.id === manualSourceId ? '수동 세팅에서 사용 중' : '']
        return { key: saved.id, title: saved.name, badges: badges.filter(Boolean), build: saved.build }
      }),
    [kinds, compared, manualSourceId],
  )
  const removeCompare = (id: string) => setCompareIds((ids) => ids.filter((x) => x !== id))
  const toggleCompare = (saved: SavedBuild) => {
    if (compared.some((s) => s.id === saved.id)) removeCompare(saved.id)
    else if (compared.length >= COMPARE_MAX) toast(`비교는 ${COMPARE_MAX}개까지 할 수 있어요. 비교 목록에서 하나를 빼 주세요.`)
    // 지운 세팅의 id 는 이때 정리한다
    else setCompareIds(() => [...compared.map((s) => s.id), saved.id])
  }

  const load = (saved: SavedBuild): boolean => {
    if (!confirmReplace()) return false
    openInManual(saved.build, saved.id)
    toast(`수동 세팅에서 열었어요 · ${saved.name}`)
    return true
  }
  /** 저장한 검색 조건이 있으면 더할 조건을 고르는 창을 열고, 없으면 바로 새 조건으로 */
  const searchWith = (saved: SavedBuild) => {
    if (buildSkills(db, saved.build, customTalismans).length === 0) toast('이 세팅에는 발동 스킬이 없어요')
    else if (presets.length > 0) setSearchTarget(saved)
    else startNew(saved)
  }
  const duplicate = (saved: SavedBuild) => {
    const name = `${saved.name} (복사)`.slice(0, NAME_MAX)
    setSavedBuilds((all) => [newSavedBuild(saved.build, name, saved.memo, saved.weaponKind), ...all])
    toast('복제했어요')
  }
  const remove = (saved: SavedBuild) => {
    if (!window.confirm(`‘${saved.name}’을(를) 삭제할까요?`)) return
    setSavedBuilds((all) => all.filter((s) => s.id !== saved.id))
    toast('삭제했어요')
  }

  return (
    <div className="space-y-4">
      <Panel
        title={`내 세팅 ${savedBuilds.length}개`}
        actions={
          <Button size="sm" onClick={() => setImportOpen(true)}>
            코드로 가져오기
          </Button>
        }
      >
        <p className="text-sm leading-relaxed text-muted">
          세팅은 이 브라우저에 저장돼요. 다른 기기에서도 쓰려면 <BackupTabLink /> 탭에서 Google 드라이브 동기화를 켜거나,
          가끔 내 호석과 함께 내보내 두세요.
        </p>
        {savedBuilds.length > 0 && (
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름·메모 검색"
            aria-label="내 세팅 검색"
            className="mt-3 h-9 w-full rounded-md border border-line bg-surface-2 px-2.5 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none sm:w-72 pointer-coarse:h-10"
          />
        )}
        {kindGroups.length > 1 && (
          <div role="radiogroup" aria-label="무기 종류" className="mt-2 flex flex-wrap gap-1 pointer-coarse:gap-1.5">
            <KindChip
              label="전체"
              count={savedBuilds.length}
              checked={activeFilter === 'all'}
              onClick={() => setKindFilter('all')}
            />
            {kindGroups.map((g) => (
              <KindChip
                key={g.key}
                label={g.key === 'none' ? '미지정' : WEAPON_KIND_LABEL[g.key]}
                count={g.count}
                checked={activeFilter === g.key}
                onClick={() => setKindFilter(g.key)}
              />
            ))}
          </div>
        )}
      </Panel>

      {savedBuilds.length === 0 ? (
        <EmptyState>
          저장한 세팅이 없어요. 수동 세팅이나 검색 결과에서 ‘저장’을 누르거나, 공유받은 코드를 가져와 보세요.
        </EmptyState>
      ) : list.length === 0 ? (
        <EmptyState>
          ‘{query}’에 맞는 {activeFilter !== 'all' && `${kindLabel(activeFilter)} `}세팅이 없어요.
        </EmptyState>
      ) : (
        // grid-cols-1(minmax(0,1fr)): 칸 폭을 화면에 묶어야 긴 이름(truncate)이 카드를 화면 밖으로 밀지 않는다
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {list.map((saved) => (
            <SavedBuildCard
              key={saved.id}
              saved={saved}
              weaponKind={kindOf(saved)}
              active={saved.id === manualSourceId}
              compared={compareIds.includes(saved.id)}
              onToggleCompare={() => toggleCompare(saved)}
              onLoad={() => load(saved)}
              onSearch={() => searchWith(saved)}
              onShare={() => setShareTarget(saved)}
              onEdit={() => setEditTarget(saved)}
              onDuplicate={() => duplicate(saved)}
              onDelete={() => remove(saved)}
            />
          ))}
        </div>
      )}

      {/* 스크롤하는 동안 화면 아래에 떠 있는 비교 목록 (이 화면은 아래 조작 바가 없어 모든 폭에서 쓴다) */}
      {compared.length > 0 && (
        <CompareTray
          items={compared.map((saved) => {
            const kind = kindOf(saved)
            return { key: saved.id, label: saved.name, note: kind !== 'none' ? kindLabel(kind) : undefined }
          })}
          onOpen={() => setComparing(true)}
          onRemove={removeCompare}
          onClear={() => setCompareIds([])}
        />
      )}
      <CompareDialog
        open={comparing && compared.length > 0}
        onClose={() => setComparing(false)}
        title="세팅 비교"
        items={compareItems}
        onRemove={removeCompare}
        onClear={() => setCompareIds([])}
        renderActions={(item) => {
          const saved = compared.find((s) => s.id === item.key)
          return (
            saved && (
              <Button
                size="sm"
                variant="primary"
                className="max-sm:w-full"
                onClick={() => {
                  // 수동 세팅 탭으로 옮겨 가므로 닫는다 (바꿀지 묻는 창에서 취소하면 그대로 둔다)
                  if (load(saved)) setComparing(false)
                }}
              >
                불러오기
              </Button>
            )
          )
        }}
      />

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
      <EditSavedDialog target={editTarget} onClose={() => setEditTarget(null)} />
      {/* 알림이 창에 가리지 않게 창을 먼저 닫는다 */}
      <SearchWithBuildDialog
        target={searchTarget}
        onClose={() => setSearchTarget(null)}
        onStartNew={(saved) => {
          setSearchTarget(null)
          startNew(saved)
        }}
        onChoosePreset={(saved, preset, mode) => {
          setSearchTarget(null)
          loadPreset(saved, preset, mode)
        }}
      />
      {shareTarget && (
        <ShareDialog
          open
          onClose={() => setShareTarget(null)}
          build={shareTarget.build}
          name={shareTarget.name}
          weaponKind={shareTarget.weaponKind ?? null}
        />
      )}
    </div>
  )
}

function SavedBuildCard({
  saved,
  weaponKind,
  active,
  compared,
  onToggleCompare,
  onLoad,
  onSearch,
  onShare,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  saved: SavedBuild
  weaponKind: KindKey
  active: boolean
  /** 비교 목록에 넣은 세팅 */
  compared: boolean
  onToggleCompare: () => void
  onLoad: () => void
  /** 이 세팅의 스킬로 세팅 검색 (저장한 조건에 더하기 / 새 조건) */
  onSearch: () => void
  onShare: () => void
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  return (
    <article
      className={cx(
        'space-y-3 rounded-lg border bg-surface p-3',
        compared ? 'border-accent ring-1 ring-accent' : active ? 'border-accent/60' : 'border-line',
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* 이름이 길면 무기 종류 아래 줄로 내려 예전만큼의 폭에서 자른다 */}
          <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
            <WeaponKindBadge kind={weaponKind} />
            <span className="truncate">{saved.name}</span>
            {active && <Badge className="shrink-0">수동 세팅에서 사용 중</Badge>}
          </h3>
          {saved.memo && <p className="mt-0.5 text-xs whitespace-pre-line text-muted">{saved.memo}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[11px] text-muted" title={`만든 날 ${formatDateTime(saved.createdAt)}`}>
            {formatDateTime(saved.updatedAt)}
          </span>
          <Button
            size="sm"
            variant={compared ? 'primary' : 'ghost'}
            aria-pressed={compared}
            title={compared ? '비교 목록에서 빼기' : '비교 목록에 넣기'}
            onClick={onToggleCompare}
          >
            {compared ? '✓ 비교' : '비교'}
          </Button>
        </div>
      </header>
      <BuildPreview build={saved.build} maxSkills={10} />
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="primary" onClick={onLoad}>
          불러오기
        </Button>
        <Button
          size="sm"
          title="이 세팅의 발동 스킬로 세팅 검색을 해요. 저장한 조건에 없는 스킬만 더하거나 있는 스킬만 체크하고, 새 조건으로 원하는 스킬·무기를 이 세팅대로 바꿀 수도 있어요."
          onClick={onSearch}
        >
          검색 조건으로
        </Button>
        <Button size="sm" onClick={onShare}>
          공유
        </Button>
        <Button size="sm" variant="ghost" onClick={onEdit}>
          정보 수정
        </Button>
        <Button size="sm" variant="ghost" onClick={onDuplicate}>
          복제
        </Button>
        <Button size="sm" variant="danger" className="ml-auto" onClick={onDelete}>
          삭제
        </Button>
      </div>
    </article>
  )
}

/** 카드 제목 앞의 무기 종류 (스킬 칩과 헷갈리지 않게 무기 아이콘을 붙인다). 미지정이면 점선 테두리로 흐리게 */
function WeaponKindBadge({ kind }: { kind: KindKey }) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1 rounded border py-px pr-1.5 pl-1 text-xs',
        kind === 'none' ? 'border-dashed border-line font-normal text-muted' : 'border-line bg-surface-2 font-semibold text-fg',
      )}
    >
      <EquipIcon equip="weapon" className="size-3.5" />
      {kindLabel(kind)}
    </span>
  )
}

/** 무기 종류 거르기 칩 (사전의 무기 종류 칩과 같은 모양) */
function KindChip({
  label,
  count,
  checked,
  onClick,
}: {
  label: string
  count: number
  checked: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      className={cx(
        'rounded-md border px-2 py-1 text-xs whitespace-nowrap pointer-coarse:px-2.5 pointer-coarse:py-1.5 pointer-coarse:text-sm',
        checked ? 'border-accent bg-accent/10 font-semibold text-accent' : 'border-line bg-surface-2 text-muted hover:text-fg',
      )}
    >
      {label} <span className="tabular-nums opacity-70">{count}</span>
    </button>
  )
}
