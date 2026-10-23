import { useCallback, useState } from 'react'
import type { SearchRequest, SearchResponse } from '../../core/search/types'
import type { GameDb } from '../../data/db'
import { COMPARE_MAX } from '../compare/compareRows'
import { relinkEntries, type CompareEntry } from './compareList'

/**
 * 검색 결과 비교 목록 (넣은 순서). 검색 화면에 두어 다시 검색해도 남고, 새 결과에 같은 세팅이 있으면 그 번호로 옮긴다.
 * 검색 결과처럼 브라우저에 저장하지 않는다.
 */
export function useCompareList(db: GameDb) {
  const [entries, setEntries] = useState<CompareEntry[]>([])
  const add = useCallback(
    (entry: CompareEntry) =>
      setEntries((list) =>
        list.length >= COMPARE_MAX || list.some((e) => e.key === entry.key) ? list : [...list, entry],
      ),
    [],
  )
  const remove = useCallback((key: string) => setEntries((list) => list.filter((e) => e.key !== key)), [])
  const clear = useCallback(() => setEntries([]), [])
  /** 새 검색 결과가 나오면 부른다 */
  const relink = useCallback(
    (seq: number, request: SearchRequest, response: SearchResponse) =>
      setEntries((list) => (list.length === 0 ? list : relinkEntries(db, list, seq, request, response))),
    [db],
  )
  return { entries, add, remove, clear, relink }
}
