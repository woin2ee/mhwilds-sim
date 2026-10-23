import { useMemo, useState } from 'react'
import { Badge, Button, EmptyState, Panel } from '../../components/ui'
import { NAME_MAX, newSavedBuild, type SavedBuild } from '../../core/savedBuilds'
import { cx } from '../../lib/cx'
import { matchesQuery } from '../../lib/text'
import { useAppState } from '../../state/context'
import { useToast } from '../../state/toast'
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

  const list = useMemo(
    () =>
      savedBuilds
        .filter((s) => matchesQuery(query, [s.name, s.memo]))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [savedBuilds, query],
  )

  const load = (saved: SavedBuild) => {
    if (!confirmReplace()) return
    openInManual(saved.build, saved.id)
    toast(`수동 세팅에서 열었어요 · ${saved.name}`)
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
        <div className="grid gap-3 lg:grid-cols-2">
          {list.map((saved) => (
            <SavedBuildCard
              key={saved.id}
              saved={saved}
              active={saved.id === manualSourceId}
              onLoad={() => load(saved)}
              onShare={() => setShareTarget(saved)}
              onEdit={() => setEditTarget(saved)}
              onDuplicate={() => duplicate(saved)}
              onDelete={() => remove(saved)}
            />
          ))}
        </div>
      )}

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
  onLoad,
  onShare,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  saved: SavedBuild
  active: boolean
  onLoad: () => void
  onShare: () => void
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  return (
    <article className={cx('space-y-3 rounded-lg border bg-surface p-3', active ? 'border-accent/60' : 'border-line')}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <span className="truncate">{saved.name}</span>
            {active && <Badge className="shrink-0">수동 세팅에서 사용 중</Badge>}
          </h3>
          {saved.memo && <p className="mt-0.5 text-xs whitespace-pre-line text-muted">{saved.memo}</p>}
        </div>
        <span className="shrink-0 text-[11px] text-muted" title={`만든 날 ${formatDateTime(saved.createdAt)}`}>
          {formatDateTime(saved.updatedAt)}
        </span>
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
