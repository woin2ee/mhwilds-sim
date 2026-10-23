import { useState } from 'react'
import { SkillChip } from '../../components/SkillChip'
import { SlotList } from '../../components/SlotBadge'
import { Badge, Button, EmptyState, Panel } from '../../components/ui'
import type { CustomTalisman } from '../../core/types'
import { skillName } from '../../data/format'
import { useAppState, useDb } from '../../state/context'
import { fitDecorations, setTalisman } from '../../core/buildUpdates'
import { BackupTabLink } from '../saved/BackupPage'
import { TalismanForm, type TalismanDraft } from './TalismanForm'

function newId(): string {
  // crypto.randomUUID 는 보안 컨텍스트(https, localhost)에서만 있다
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** 내 호석(감정 호석 등) 등록·수정·삭제 */
export function TalismanManager() {
  const { db, customTalismans, setCustomTalismans, setManualBuild } = useAppState()
  const [editing, setEditing] = useState<string | 'new' | null>(null)

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
    if (!window.confirm(`'${talisman.name || `호석 ${index + 1}`}'을(를) 삭제할까요?`)) return
    setCustomTalismans((list) => list.filter((t) => t.id !== talisman.id))
    setManualBuild((b) =>
      b.talisman?.type === 'custom' && b.talisman.id === talisman.id ? setTalisman(b, null) : b,
    )
    if (editing === talisman.id) setEditing(null)
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Panel
        title={`내 호석 ${customTalismans.length}개`}
        actions={
          editing !== 'new' && (
            <Button size="sm" variant="primary" onClick={() => setEditing('new')}>
              + 호석 추가
            </Button>
          )
        }
      >
        <p className="mb-4 text-sm leading-relaxed text-muted">
          감정 호석처럼 직접 얻은 호석을 등록하면 <span className="text-fg">수동 세팅</span>과{' '}
          <span className="text-fg">스킬 검색</span>에서 사용할 수 있어요. 등록한 호석은 이 브라우저에만 저장되니, 가끔{' '}
          <BackupTabLink /> 탭에서 내 세팅과 함께 내보내 두세요.
        </p>

        {editing === 'new' && (
          <div className="mb-4">
            <TalismanForm defaultName={`호석 ${customTalismans.length + 1}`} onSave={add} onCancel={() => setEditing(null)} />
          </div>
        )}

        {customTalismans.length === 0 ? (
          editing !== 'new' && <EmptyState>등록한 호석이 없습니다. '+ 호석 추가'로 등록해 보세요.</EmptyState>
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
