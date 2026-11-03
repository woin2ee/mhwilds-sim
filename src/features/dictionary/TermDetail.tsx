import { useMemo } from 'react'
import { Panel } from '../../components/ui'
import type { GameTerm } from '../../core/gameTerms'
import { nameOf, otherNamesOf } from '../../data/db'
import { SKILL_KIND_LABEL } from '../../data/labels'
import { useDb } from '../../state/context'
import type { DictionaryEntry } from './dictionarySearch'
import { skillsWithTerm } from './termLookup'
import { TermFactList, ValueNotes } from './ValueParts'

/** 사전의 용어(상태 이상·게임 규칙): 설명·수치와 이 용어가 글에 나오는 스킬 (누르면 그 스킬을 연다) */
export function TermDetail({ term, onOpen }: { term: GameTerm; onOpen: (entry: DictionaryEntry) => void }) {
  const db = useDb()
  const skills = useMemo(() => skillsWithTerm(db, term), [db, term])
  const others = otherNamesOf(term.name)
  return (
    <>
      <Panel>
        <h2 className="text-lg leading-snug font-bold">{nameOf(term.name)}</h2>
        <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted">
          <span>용어</span>
          {others.length > 0 && (
            <span>
              {others.map(({ locale, name }, i) => (
                <span key={locale} lang={locale}>
                  {i > 0 && ' · '}
                  {name}
                </span>
              ))}
            </span>
          )}
        </p>
        <p className="mt-3 text-sm leading-relaxed">{term.summary}</p>
        {term.facts.length > 0 && <TermFactList facts={term.facts} className="mt-3 rounded-md border border-line p-3" />}
        <ValueNotes caveats={term.caveats} className="mt-3" />
        <p className="mt-3 text-xs text-muted">설명은 공식 웹 매뉴얼, 수치는 공략 자료(game8 등)로 확인했어요.</p>
      </Panel>
      {skills.length > 0 && (
        <Panel
          title={
            <span>
              이 용어가 나오는 스킬 <span className="font-normal text-muted">{skills.length}개</span>
            </span>
          }
        >
          <ul className="-my-1.5 divide-y divide-line">
            {skills.map((skill) => (
              <li key={skill.id}>
                <button
                  type="button"
                  onClick={() => onOpen({ kind: 'skill', id: skill.id })}
                  className="-mx-1 flex w-[calc(100%+0.5rem)] items-center justify-between gap-2 rounded px-1 py-1.5 text-left text-sm hover:bg-surface-2 pointer-coarse:py-2.5"
                >
                  <span className="min-w-0 truncate">{nameOf(skill.name)}</span>
                  <span className="shrink-0 text-xs text-muted">{SKILL_KIND_LABEL[skill.kind]} →</span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  )
}

/** 스킬 상세에서 펼친 용어: 설명·수치와 용어 상세로 가는 링크 (그 용어가 나오는 다른 스킬은 용어 상세에서) */
export function TermBody({ term, onOpen }: { term: GameTerm; onOpen: (entry: DictionaryEntry) => void }) {
  return (
    <>
      <p className="text-xs leading-relaxed text-muted">{term.summary}</p>
      {term.facts.length > 0 && <TermFactList facts={term.facts} className="mt-2" />}
      <ValueNotes caveats={term.caveats} className="mt-2" />
      <button
        type="button"
        onClick={() => onOpen({ kind: 'term', id: term.id })}
        className="mt-2 -ml-1 block rounded px-1 text-xs text-accent hover:bg-surface-2 pointer-coarse:py-1.5 pointer-coarse:text-sm"
      >
        용어 보기 →
      </button>
    </>
  )
}
