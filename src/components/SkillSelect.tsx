import { useMemo } from 'react'
import { nameOf } from '../data/db'
import { SKILL_KIND_LABEL } from '../data/labels'
import type { Skill, SkillKind } from '../data/types'
import { useDb } from '../state/context'
import { Combobox } from './Combobox'

const KIND_ORDER: SkillKind[] = ['armor', 'weapon', 'set', 'group']
const getKey = (s: Skill) => s.id
const getLabel = (s: Skill) => nameOf(s.name)
const getSearchText = (s: Skill) => [s.name.ko, s.name.en, s.name.ja]
const groupBy = (s: Skill) => SKILL_KIND_LABEL[s.kind]

/** 스킬 하나를 고르는 검색 상자. kinds 로 종류를, hiddenIds 로 이미 고른 스킬을 걸러낸다. */
export function SkillSelect({
  value,
  onChange,
  kinds = KIND_ORDER,
  hiddenIds,
  placeholder = '스킬 검색 (초성 가능)',
  ariaLabel = '스킬 선택',
  className,
}: {
  value: number | null
  onChange: (skill: Skill | null) => void
  kinds?: readonly SkillKind[]
  hiddenIds?: readonly number[]
  placeholder?: string
  ariaLabel?: string
  className?: string
}) {
  const db = useDb()
  const items = useMemo(() => {
    const hidden = new Set(hiddenIds)
    return db.data.skills
      .filter((s) => kinds.includes(s.kind) && !hidden.has(s.id))
      .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.name.ko.localeCompare(b.name.ko, 'ko'))
  }, [db, kinds, hiddenIds])
  const selected = value === null ? null : (db.skills.get(value) ?? null)
  return (
    <Combobox
      items={items}
      value={selected}
      onChange={onChange}
      getKey={getKey}
      getLabel={getLabel}
      getSearchText={getSearchText}
      groupBy={kinds.length > 1 ? groupBy : undefined}
      placeholder={placeholder}
      ariaLabel={ariaLabel}
      className={className}
      renderOption={(s) => (
        <span className="flex items-center justify-between gap-2">
          <span>{nameOf(s.name)}</span>
          <span className="text-xs text-muted">
            {s.kind === 'set' || s.kind === 'group'
              ? s.ranks.map((r) => `${r.pieces}부위`).join('/')
              : `최대 Lv${s.maxLevel}`}
          </span>
        </span>
      )}
    />
  )
}
