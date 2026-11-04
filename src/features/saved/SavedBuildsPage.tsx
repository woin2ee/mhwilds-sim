import { useMemo, useState, type MouseEvent } from 'react'
import { Badge, Button, EmptyState, Panel } from '../../components/ui'
import { collectTags, tagKey, tagsOf } from '../../core/buildTags'
import { isFavorite, NAME_MAX, newSavedBuild, weaponKindOf, withFavorite, type SavedBuild } from '../../core/savedBuilds'
import { isCardClick } from '../../lib/cardClick'
import { cx } from '../../lib/cx'
import { matchesQuery } from '../../lib/text'
import { useAppState } from '../../state/context'
import { useToast } from '../../state/toast'
import { CompareDialog } from '../compare/CompareDialog'
import { COMPARE_MAX, type CompareItem } from '../compare/compareRows'
import { CompareTray } from '../compare/CompareTray'
import { useGameOverlay } from '../manual/overlayContext'
import { useSearchPresets } from '../search/conditionsContext'
import { buildSkills } from '../search/fromBuild'
import { formatDateTime } from './backupFile'
import { BackupTabLink } from './BackupPage'
import { BuildPreview } from './BuildPreview'
import { ImportDialog } from './ImportDialog'
import { activeKindFilter, kindGroups, kindLabel, type KindFilter } from './kindFilter'
import { FavoriteButton, StarIcon } from './FavoriteStar'
import { EditSavedDialog } from './SaveBuildDialog'
import { SearchWithBuildDialog } from './SearchWithBuildDialog'
import { ShareDialog } from './ShareDialog'
import { useConfirmReplaceManual } from './useBuildActions'
import { useSearchWithBuild } from './useSearchWithBuild'
import { WeaponKindBadge, type KindKey } from './WeaponKindBadge'
import { WeaponKindFilter } from './WeaponKindFilter'

/** 내 세팅: 브라우저에 저장한 세팅 목록, 공유 코드 가져오기 (백업은 백업 탭) */
export function SavedBuildsPage() {
  const { db, customTalismans, savedBuilds, setSavedBuilds, openInManual, manualSourceId } = useAppState()
  const toast = useToast()
  const confirmReplace = useConfirmReplaceManual()
  const overlay = useGameOverlay()
  const { presets } = useSearchPresets()
  const { startNew, loadPreset } = useSearchWithBuild()
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  /** 거르는 태그의 열쇠 (tagKey, 고른 순서). 모두 붙은 세팅만 보인다 (무기 종류·검색 칸과 함께 걸린다) */
  const [tagFilter, setTagFilter] = useState<string[]>([])
  /** 즐겨찾기만 보기 (무기 종류·검색 칸과 함께 걸린다) */
  const [favoritesOnly, setFavoritesOnly] = useState(false)
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
  const groups = useMemo(() => kindGroups(kinds.values()), [kinds])
  const activeFilter = activeKindFilter(groups, kindFilter)

  const favoriteCount = useMemo(() => savedBuilds.filter(isFavorite).length, [savedBuilds])
  // 즐겨찾기가 하나도 없으면(다른 기기에서 끈 것이 동기화돼도) 전체를 보인다
  const showFavorites = favoritesOnly && favoriteCount > 0

  /** 세팅 id → 태그 */
  const tagsById = useMemo(() => new Map(savedBuilds.map((s) => [s.id, tagsOf(s)])), [savedBuilds])
  const tagsOfSaved = (saved: SavedBuild): string[] => tagsById.get(saved.id) ?? []
  /** 내 세팅에 붙은 태그 (많이 붙은 순) */
  const allTags = useMemo(() => collectTags(savedBuilds), [savedBuilds])
  // 거르는 태그 (글자는 내 세팅에 붙은 그대로). 어느 세팅에도 없게 되면(태그를 빼거나 세팅을 지움) 거르기에서 빠진다
  const activeTags = useMemo(
    () => tagFilter.flatMap((key) => allTags.find((t) => tagKey(t.tag) === key)?.tag ?? []),
    [tagFilter, allTags],
  )
  const isActiveTag = (tag: string) => activeTags.some((t) => tagKey(t) === tagKey(tag))
  const toggleTag = (tag: string) => {
    const keys = activeTags.map(tagKey)
    const key = tagKey(tag)
    setTagFilter(keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key])
  }

  const list = useMemo(
    () =>
      savedBuilds
        .filter((s) => !showFavorites || isFavorite(s))
        .filter((s) => activeFilter === 'all' || kinds.get(s.id) === activeFilter)
        .filter((s) => {
          const keys = (tagsById.get(s.id) ?? []).map(tagKey)
          return activeTags.every((tag) => keys.includes(tagKey(tag)))
        })
        .filter((s) => matchesQuery(query, [s.name, s.memo, ...(tagsById.get(s.id) ?? [])]))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [savedBuilds, kinds, showFavorites, activeFilter, tagsById, activeTags, query],
  )

  const compared = useMemo(
    () => compareIds.flatMap((id) => savedBuilds.find((s) => s.id === id) ?? []),
    [compareIds, savedBuilds],
  )
  const compareItems = useMemo(
    () =>
      compared.map((saved): CompareItem => {
        const kind = kinds.get(saved.id) ?? 'none'
        const badges = [
          kind !== 'none' ? kindLabel(kind) : '',
          saved.id === manualSourceId ? '수동 세팅에서 사용 중' : '',
          ...(tagsById.get(saved.id) ?? []).map((tag) => `#${tag}`),
        ]
        return { key: saved.id, title: saved.name, badges: badges.filter(Boolean), build: saved.build }
      }),
    [kinds, compared, manualSourceId, tagsById],
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
  /** 게임 위에 띄우기: 수동 세팅에 불러오지 않고 이 세팅을 띄운다 (창에 다른 세팅이 떠 있으면 이 세팅으로 바꾼다) */
  const isFloating = (saved: SavedBuild) => overlay.target?.type === 'saved' && overlay.target.id === saved.id
  const toggleFloat = (saved: SavedBuild) =>
    isFloating(saved) ? overlay.close() : overlay.show({ type: 'saved', id: saved.id })
  /** 저장한 검색 조건이 있으면 더할 조건을 고르는 창을 열고, 없으면 바로 새 조건으로 */
  const searchWith = (saved: SavedBuild) => {
    if (buildSkills(db, saved.build, customTalismans).length === 0) toast('이 세팅에는 발동 스킬이 없어요')
    else if (presets.length > 0) setSearchTarget(saved)
    else startNew(saved)
  }
  /** 즐겨찾기 켜기/끄기. 세팅을 고친 것이 아니라 고친 날·목록 순서는 그대로다 */
  const toggleFavorite = (saved: SavedBuild) => {
    const on = !isFavorite(saved)
    const setFavorite = (value: boolean) =>
      setSavedBuilds((all) => all.map((s) => (s.id === saved.id ? withFavorite(s, value) : s)))
    setFavorite(on)
    if (on || !showFavorites) return
    // 즐겨찾기만 보는 중에 끄면 카드가 목록에서 사라지므로 알리고 되돌릴 수 있게 한다.
    // 마지막 하나를 끄면 거르기도 푼다 (다음에 별을 켰을 때 갑자기 그 세팅만 보이지 않게)
    if (favoriteCount <= 1) setFavoritesOnly(false)
    toast(`즐겨찾기에서 뺐어요 · ${saved.name}`, {
      label: '되돌리기',
      onClick: () => {
        setFavorite(true)
        setFavoritesOnly(true)
      },
    })
  }
  const duplicate = (saved: SavedBuild) => {
    const name = `${saved.name} (복사)`.slice(0, NAME_MAX)
    setSavedBuilds((all) => [newSavedBuild(saved.build, name, saved.memo, saved.weaponKind, tagsOfSaved(saved)), ...all])
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
          <div className="mt-3 flex items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름·태그 검색"
              aria-label="내 세팅 검색"
              className="h-9 min-w-0 flex-1 rounded-md border border-line bg-surface-2 px-2.5 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none sm:w-72 sm:flex-none pointer-coarse:h-10"
            />
            {favoriteCount > 0 && (
              <FavoriteFilter
                count={favoriteCount}
                checked={showFavorites}
                onClick={() => setFavoritesOnly(!showFavorites)}
              />
            )}
          </div>
        )}
        <WeaponKindFilter
          className="mt-2"
          total={savedBuilds.length}
          groups={groups}
          value={activeFilter}
          onChange={setKindFilter}
        />
        {allTags.length > 0 && (
          <div role="group" aria-label="태그" className="mt-2 flex flex-wrap items-center gap-1 pointer-coarse:gap-1.5">
            {allTags.map(({ tag, count }) => (
              <TagChip key={tag} tag={tag} count={count} pressed={isActiveTag(tag)} onClick={() => toggleTag(tag)} />
            ))}
            {activeTags.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setTagFilter([])}>
                태그 거르기 풀기
              </Button>
            )}
          </div>
        )}
      </Panel>

      {savedBuilds.length === 0 ? (
        <EmptyState>
          저장한 세팅이 없어요. 수동 세팅이나 검색 결과에서 ‘저장’을 누르거나, 공유받은 코드를 가져와 보세요.
        </EmptyState>
      ) : list.length === 0 ? (
        <EmptyState>
          {query && `‘${query}’에 맞는 `}
          {showFavorites && '즐겨찾기한 '}
          {activeTags.length > 0 && `${activeTags.map((tag) => `#${tag}`).join('·')} 태그가 붙은 `}
          {activeFilter !== 'all' && `${kindLabel(activeFilter)} `}세팅이 없어요.
        </EmptyState>
      ) : (
        // grid-cols-1(minmax(0,1fr)): 칸 폭을 화면에 묶어야 긴 이름(truncate)이 카드를 화면 밖으로 밀지 않는다
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {list.map((saved) => (
            <SavedBuildCard
              key={saved.id}
              saved={saved}
              weaponKind={kindOf(saved)}
              tags={tagsOfSaved(saved)}
              isActiveTag={isActiveTag}
              onToggleTag={toggleTag}
              favorite={isFavorite(saved)}
              active={saved.id === manualSourceId}
              compared={compareIds.includes(saved.id)}
              floating={isFloating(saved)}
              onToggleFavorite={() => toggleFavorite(saved)}
              onToggleCompare={() => toggleCompare(saved)}
              onLoad={() => load(saved)}
              onToggleFloat={() => toggleFloat(saved)}
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
  tags,
  isActiveTag,
  onToggleTag,
  favorite,
  active,
  compared,
  floating,
  onToggleFavorite,
  onToggleCompare,
  onLoad,
  onToggleFloat,
  onSearch,
  onShare,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  saved: SavedBuild
  weaponKind: KindKey
  tags: readonly string[]
  /** 목록을 이 태그로 거르는 중인지 */
  isActiveTag: (tag: string) => boolean
  /** 카드의 태그를 누르면 그 태그로 거르거나 거르기를 푼다 */
  onToggleTag: (tag: string) => void
  favorite: boolean
  active: boolean
  /** 비교 목록에 넣은 세팅 */
  compared: boolean
  /** 게임 위에 띄운 창에 보이는 세팅 */
  floating: boolean
  onToggleFavorite: () => void
  onToggleCompare: () => void
  onLoad: () => void
  /** 게임 위에 띄우기 / 띄운 창 닫기 */
  onToggleFloat: () => void
  /** 이 세팅의 스킬로 세팅 검색 (저장한 조건에 더하기 / 새 조건) */
  onSearch: () => void
  onShare: () => void
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  // 카드 빈 곳이나 글자를 눌러도 공유 창을 연다 (이미지 탭이면 장식주·스킬까지 다 든 세팅 이미지). 키보드는 '공유' 버튼
  const onCardClick = (event: MouseEvent<HTMLElement>) => {
    if (isCardClick(event)) onShare()
  }
  return (
    <article
      onClick={onCardClick}
      className={cx(
        'cursor-pointer space-y-3 rounded-lg border bg-surface p-3',
        compared ? 'border-accent ring-1 ring-accent' : active ? 'border-accent/60' : 'border-line hover:border-muted/60',
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* 이름이 길면 별·무기 종류 아래 줄로 내려 예전만큼의 폭에서 자른다. 별은 줄 높이를 늘리지 않게 바깥 여백을 줄인다 */}
          <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
            <FavoriteButton
              on={favorite}
              onToggle={onToggleFavorite}
              className="-my-1 -mr-1 -ml-1.5 pointer-coarse:-my-2 pointer-coarse:-ml-2"
            />
            <WeaponKindBadge kind={weaponKind} />
            <span className="truncate">{saved.name}</span>
            {active && <Badge className="shrink-0">수동 세팅에서 사용 중</Badge>}
          </h3>
          {saved.memo && <p className="mt-0.5 text-xs whitespace-pre-line text-muted">{saved.memo}</p>}
          {tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {tags.map((tag) => {
                const on = isActiveTag(tag)
                return (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={on}
                    title={on ? '이 태그로 거르기 풀기' : '이 태그가 붙은 세팅만 보기'}
                    onClick={() => onToggleTag(tag)}
                    className={cx(
                      'rounded border px-1.5 py-px text-[11px] pointer-coarse:px-2 pointer-coarse:py-0.5 pointer-coarse:text-xs',
                      on ? 'border-accent/60 bg-accent/10 text-accent' : 'border-line bg-surface-2 text-muted hover:text-fg',
                    )}
                  >
                    #{tag}
                  </button>
                )
              })}
            </div>
          )}
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
        {/* 게임은 PC 에서 하므로 휴대폰·태블릿에서는 숨긴다 */}
        <Button
          size="sm"
          title="수동 세팅으로 불러오지 않고 이 세팅을 다른 창 위에 늘 떠 있는 작은 창으로 띄워요. 게임 화면으로 돌아가도 보여요."
          className="pointer-coarse:hidden"
          onClick={onToggleFloat}
        >
          {floating ? '띄운 창 닫기' : '게임 위에 띄우기'}
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

/** 즐겨찾기만 보기 (검색 칸 옆이라 칸 높이에 맞춘다, 켜진 모양은 무기 종류 칩과 같음) */
function FavoriteFilter({ count, checked, onClick }: { count: number; checked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      title="즐겨찾기한 세팅만 보기"
      onClick={onClick}
      className={cx(
        'inline-flex h-9 shrink-0 items-center gap-1 rounded-md border px-2.5 text-sm whitespace-nowrap pointer-coarse:h-10',
        checked ? 'border-accent bg-accent/10 font-semibold text-accent' : 'border-line bg-surface-2 text-muted hover:text-fg',
      )}
    >
      <StarIcon filled className="size-3.5" />
      즐겨찾기 <span className="tabular-nums opacity-70">{count}</span>
    </button>
  )
}

/** 태그 거르기 칩. 무기 종류 칩과 같은 모양이고 여러 개를 함께 켠다 (모두 붙은 세팅만) */
function TagChip({
  tag,
  count,
  pressed,
  onClick,
}: {
  tag: string
  count: number
  pressed: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cx(
        'rounded-md border px-2 py-1 text-xs whitespace-nowrap pointer-coarse:px-2.5 pointer-coarse:py-1.5 pointer-coarse:text-sm',
        pressed ? 'border-accent bg-accent/10 font-semibold text-accent' : 'border-line bg-surface-2 text-muted hover:text-fg',
      )}
    >
      #{tag} <span className="tabular-nums opacity-70">{count}</span>
    </button>
  )
}
