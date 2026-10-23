import { useMemo, useState } from 'react'
import { Badge, Button, EmptyState, Panel } from '../../components/ui'
import { NAME_MAX, newSavedBuild, type SavedBuild } from '../../core/savedBuilds'
import { cx } from '../../lib/cx'
import { matchesQuery } from '../../lib/text'
import { useAppState } from '../../state/context'
import { useToast } from '../../state/toast'
import { CompareDialog } from '../compare/CompareDialog'
import { COMPARE_MAX, type CompareItem } from '../compare/compareRows'
import { CompareTray } from '../compare/CompareTray'
import { formatDateTime } from './backupFile'
import { BackupTabLink } from './BackupPage'
import { BuildPreview } from './BuildPreview'
import { ImportDialog } from './ImportDialog'
import { EditSavedDialog } from './SaveBuildDialog'
import { ShareDialog } from './ShareDialog'
import { useConfirmReplaceManual } from './useBuildActions'

/** 내 세팅: 브라우저에 저장한 세팅 목록, 공유 코드 가져오기 (백업은 백업 탭) */
export function SavedBuildsPage() {
  const { savedBuilds, setSavedBuilds, openInManual, manualSourceId } = useAppState()
  const toast = useToast()
  const confirmReplace = useConfirmReplaceManual()
  const [query, setQuery] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [shareTarget, setShareTarget] = useState<SavedBuild | null>(null)
  const [editTarget, setEditTarget] = useState<SavedBuild | null>(null)
  /** 비교할 세팅 id (넣은 순서). 지운 세팅은 빠진다. 브라우저에 저장하지 않는다 */
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [comparing, setComparing] = useState(false)

  const list = useMemo(
    () =>
      savedBuilds
        .filter((s) => matchesQuery(query, [s.name, s.memo]))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [savedBuilds, query],
  )

  const compared = useMemo(
    () => compareIds.flatMap((id) => savedBuilds.find((s) => s.id === id) ?? []),
    [compareIds, savedBuilds],
  )
  const compareItems = useMemo(
    () =>
      compared.map(
        (saved): CompareItem => ({
          key: saved.id,
          title: saved.name,
          badges: saved.id === manualSourceId ? ['수동 세팅에서 사용 중'] : [],
          build: saved.build,
        }),
      ),
    [compared, manualSourceId],
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
  const duplicate = (saved: SavedBuild) => {
    setSavedBuilds((all) => [newSavedBuild(saved.build, `${saved.name} (복사)`.slice(0, NAME_MAX), saved.memo), ...all])
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
          세팅은 이 브라우저에만 저장돼요. 브라우저 데이터를 지우거나 기기를 바꾸면 사라지니, 가끔 <BackupTabLink /> 탭에서
          내 호석과 함께 내보내 두세요.
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
      </Panel>

      {savedBuilds.length === 0 ? (
        <EmptyState>
          저장한 세팅이 없어요. 수동 세팅이나 검색 결과에서 ‘저장’을 누르거나, 공유받은 코드를 가져와 보세요.
        </EmptyState>
      ) : list.length === 0 ? (
        <EmptyState>‘{query}’에 맞는 세팅이 없어요.</EmptyState>
      ) : (
        // grid-cols-1(minmax(0,1fr)): 칸 폭을 화면에 묶어야 긴 이름(truncate)이 카드를 화면 밖으로 밀지 않는다
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {list.map((saved) => (
            <SavedBuildCard
              key={saved.id}
              saved={saved}
              active={saved.id === manualSourceId}
              compared={compareIds.includes(saved.id)}
              onToggleCompare={() => toggleCompare(saved)}
              onLoad={() => load(saved)}
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
          items={compared.map((saved) => ({ key: saved.id, label: saved.name }))}
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
      {shareTarget && (
        <ShareDialog open onClose={() => setShareTarget(null)} build={shareTarget.build} name={shareTarget.name} />
      )}
    </div>
  )
}

function SavedBuildCard({
  saved,
  active,
  compared,
  onToggleCompare,
  onLoad,
  onShare,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  saved: SavedBuild
  active: boolean
  /** 비교 목록에 넣은 세팅 */
  compared: boolean
  onToggleCompare: () => void
  onLoad: () => void
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
          <h3 className="flex items-center gap-2 text-sm font-semibold">
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
        <Button size="sm" onClick={onShare}>
          공유
        </Button>
        <Button size="sm" variant="ghost" onClick={onEdit}>
          이름·메모
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
