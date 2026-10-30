import { useState } from 'react'
import { SkillChip } from '../../components/SkillChip'
import { SlotList } from '../../components/SlotBadge'
import { Badge, Button, EmptyState, Panel } from '../../components/ui'
import type { BuildState, CustomTalisman, TalismanDraft } from '../../core/types'
import { skillName } from '../../data/format'
import { newId } from '../../lib/id'
import { useAppState, useDb } from '../../state/context'
import { detachTalisman, fitDecorations } from '../../core/buildUpdates'
import { BackupTabLink } from '../saved/BackupPage'
import { PhotoImportDialog } from './PhotoImportDialog'
import { TalismanForm } from './TalismanForm'

/** 내 호석(감정 호석 등) 등록·수정·삭제. 실제로 가진 호석만 둔다 (공유받은 세팅의 호석은 그 세팅에만 담긴다) */
export function TalismanManager() {
  const { db, customTalismans, setCustomTalismans, manualBuild, setManualBuild, savedBuilds, setSavedBuilds } =
    useAppState()
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [photoOpen, setPhotoOpen] = useState(false)

  const add = (draft: TalismanDraft) => {
    setCustomTalismans((list) => [...list, { ...draft, id: newId() }])
    setEditing(null)
  }

  const update = (id: string, draft: TalismanDraft) => {
    setCustomTalismans((list) => list.map((t) => (t.id === id ? { ...draft, id } : t)))
    // 수동 세팅에서 쓰는 중이면 바뀐 슬롯에 맞지 않는 장식주를 뺀다
    setManualBuild((b) =>
      b.talisman?.type === 'custom' && b.talisman.id === id
        ? { ...b, decorations: { ...b.decorations, talisman: fitDecorations(db, b.decorations.talisman ?? [], draft.slots) } }
        : b,
    )
    setEditing(null)
  }

  const remove = (talisman: CustomTalisman, index: number) => {
    // 이 호석을 쓰던 세팅은 깨뜨리지 않고 같은 내용의 세팅 전용 호석으로 바꿔 둔다
    const uses = (build: BuildState) => detachTalisman(build, talisman) !== build
    const usedBuilds = savedBuilds.filter((s) => uses(s.build)).length
    const places = [usedBuilds > 0 && `내 세팅 ${usedBuilds}개`, uses(manualBuild) && '수동 세팅'].filter(Boolean)
    const note = places.length > 0 ? `\n이 호석을 쓰는 ${places.join('와 ')}에는 세팅 전용 호석으로 남아요.` : ''
    if (!window.confirm(`'${talisman.name || `호석 ${index + 1}`}'을(를) 삭제할까요?${note}`)) return
    setCustomTalismans((list) => list.filter((t) => t.id !== talisman.id))
    setSavedBuilds((list) =>
      list.map((s) => {
        const build = detachTalisman(s.build, talisman)
        return build === s.build ? s : { ...s, build }
      }),
    )
    setManualBuild((b) => detachTalisman(b, talisman))
    if (editing === talisman.id) setEditing(null)
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Panel
        title={`내 호석 ${customTalismans.length}개`}
        actions={
          <>
            <Button size="sm" onClick={() => setPhotoOpen(true)}>
              사진으로 추가
            </Button>
            {editing !== 'new' && (
              <Button size="sm" variant="primary" onClick={() => setEditing('new')}>
                + 호석 추가
              </Button>
            )}
          </>
        }
      >
        <p className="mb-4 text-sm leading-relaxed text-muted">
          감정 호석처럼 직접 얻은 호석을 등록하면 <span className="text-fg">수동 세팅</span>과{' '}
          <span className="text-fg">세팅 검색</span>에서 사용할 수 있어요. 게임 스크린샷이 있으면{' '}
          <span className="text-fg">사진으로 추가</span>로 스킬·슬롯을 읽어 한 번에 넣을 수 있어요. 공유받은 세팅의
          호석은 여기에 넣지 않고 그 세팅에만 담아요. 등록한 호석은 이 브라우저에 저장되니, 다른 기기에서도 쓰려면{' '}
          <BackupTabLink /> 탭에서 Google 드라이브 동기화를 켜거나 가끔 내 세팅과 함께 내보내 두세요.
        </p>

        {editing === 'new' && (
          <div className="mb-4">
            <TalismanForm defaultName={`호석 ${customTalismans.length + 1}`} onSave={add} onCancel={() => setEditing(null)} />
          </div>
        )}

        {customTalismans.length === 0 ? (
          editing !== 'new' && (
            <EmptyState>등록한 호석이 없습니다. '사진으로 추가'나 '+ 호석 추가'로 등록해 보세요.</EmptyState>
          )
        ) : (
          <ul className="divide-y divide-line">
            {customTalismans.map((talisman, index) => (
              <li key={talisman.id} className="py-3 first:pt-0 last:pb-0">
                {editing === talisman.id ? (
                  <TalismanForm
                    initial={talisman}
                    defaultName={`호석 ${index + 1}`}
                    onSave={(draft) => update(talisman.id, draft)}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <TalismanItem
                    talisman={talisman}
                    fallbackName={`호석 ${index + 1}`}
                    onEdit={() => setEditing(talisman.id)}
                    onDelete={() => remove(talisman, index)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <PhotoImportDialog open={photoOpen} onClose={() => setPhotoOpen(false)} />
    </div>
  )
}

function TalismanItem({
  talisman,
  fallbackName,
  onEdit,
  onDelete,
}: {
  talisman: CustomTalisman
  fallbackName: string
  onEdit: () => void
  onDelete: () => void
}) {
  const db = useDb()
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{talisman.name || fallbackName}</span>
          {talisman.rarity !== null && <Badge>레어도 {talisman.rarity}</Badge>}
          <SlotList slots={talisman.slots} size="sm" empty="" />
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {talisman.skills.length === 0 && <span className="text-xs text-muted">스킬 없음</span>}
          {talisman.skills.map((p) => (
            <SkillChip
              key={p.skillId}
              name={skillName(db, p.skillId)}
              level={p.level}
              maxLevel={db.skills.get(p.skillId)?.maxLevel}
            />
          ))}
        </div>
      </div>
      <div className="flex gap-1">
        <Button size="sm" onClick={onEdit}>
          수정
        </Button>
        <Button size="sm" variant="danger" onClick={onDelete}>
          삭제
        </Button>
      </div>
    </div>
  )
}
