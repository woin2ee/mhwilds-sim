import { describe, expect, it } from 'vitest'
import { runSearch } from '../../core/search/engine'
import { resultToBuild } from '../../core/search/toBuild'
import type { SearchRequest, SearchResponse } from '../../core/search/types'
import { ARMOR_KINDS } from '../../data/types'
import { loadTestDb, skillIdByName } from '../../test/testDb'
import { buildKey, isAlternative, relinkEntries, type CompareEntry, type ResultVariant } from './compareList'
import { DEFAULT_CONDITIONS, buildRequest, normalizeConditions } from './conditions'

const db = loadTestDb()
const sid = (name: string) => skillIdByName(db, name)

// 전체 결과가 2천여 건이라 limit 을 넉넉히 주면 두 정렬 모두 같은 결과 전체를 돌려준다
const bySlots: SearchRequest = {
  ...buildRequest(
    db,
    normalizeConditions({
      ...DEFAULT_CONDITIONS,
      required: [
        { skillId: sid('약점 특효'), level: 5 },
        { skillId: sid('힘의 해방'), level: 5 },
        { skillId: sid('도전자'), level: 5 },
        { skillId: sid('회피 성능'), level: 3 },
      ],
    }),
    [],
  ),
  limit: 5000,
}
const byDefense: SearchRequest = { ...bySlots, sort: 'defense' }
const slotsResponse = runSearch(db, bySlots)
const defenseResponse = runSearch(db, byDefense)

function entryOf(request: SearchRequest, response: SearchResponse, i: number, variant: ResultVariant = {}): CompareEntry {
  const item = response.items[i]
  const build = resultToBuild(db, item, request, variant)
  return { key: buildKey(build), build, request, seq: 1, index: i + 1, variant: isAlternative(item, variant) }
}

describe('검색 결과 비교 목록', () => {
  it('검색 조건은 결과가 다 나오고 대체 방어구가 있는 결과도 있다', () => {
    expect(slotsResponse.truncated).toBe(false)
    expect(slotsResponse.items.length).toBe(slotsResponse.total)
    expect(defenseResponse.items.length).toBe(slotsResponse.total)
    expect(slotsResponse.items.some((item) => ARMOR_KINDS.some((kind) => item.armor[kind].length > 1))).toBe(true)
  })

  it('세팅 키는 장식주 칸 끝의 빈 칸을 무시하고, 방어구·초월·장식주가 다르면 달라진다', () => {
    const build = resultToBuild(db, slotsResponse.items[0], bySlots)
    const padded = { ...build, decorations: { ...build.decorations, head: [...build.decorations.head, null, null] } }
    expect(buildKey(padded)).toBe(buildKey(build))

    const kind = ARMOR_KINDS.find((k) => build.armor[k])!
    const choice = build.armor[kind]!
    expect(buildKey({ ...build, armor: { ...build.armor, [kind]: { ...choice, transcend: !choice.transcend } } })).not.toBe(
      buildKey(build),
    )
    const other = resultToBuild(db, slotsResponse.items[1], bySlots)
    expect(buildKey(other)).not.toBe(buildKey(build))
  })

  it('정렬을 바꿔 다시 검색하면 같은 세팅을 새 목록의 번호와 요청으로 옮긴다', () => {
    const entries = [entryOf(bySlots, slotsResponse, 0), entryOf(bySlots, slotsResponse, 3)]
    const relinked = relinkEntries(db, entries, 2, byDefense, defenseResponse)
    for (const [i, entry] of relinked.entries()) {
      expect(entry.key).toBe(entries[i].key)
      expect(entry.seq).toBe(2)
      expect(entry.request).toBe(byDefense)
      expect(entry.variant).toBe(false)
      expect(buildKey(resultToBuild(db, defenseResponse.items[entry.index - 1], byDefense))).toBe(entry.key)
    }
  })

  it('대체 방어구를 고른 세팅도 새 목록에서 찾고, 없으면 그대로 둔다', () => {
    const i = slotsResponse.items.findIndex((item) => ARMOR_KINDS.some((kind) => item.armor[kind].length > 1))
    const item = slotsResponse.items[i]
    const kind = ARMOR_KINDS.find((k) => item.armor[k].length > 1)!
    const entry = entryOf(bySlots, slotsResponse, i, { [kind]: item.armor[kind][1] })
    expect(entry.variant).toBe(true)
    expect(entry.key).not.toBe(buildKey(resultToBuild(db, item, bySlots)))

    const [relinked] = relinkEntries(db, [entry], 2, byDefense, defenseResponse)
    expect(relinked.seq).toBe(2)
    expect(relinked.variant).toBe(true)
    expect(defenseResponse.items[relinked.index - 1].armor[kind]).toContain(item.armor[kind][1])

    const empty: SearchResponse = { items: [], total: 0, truncated: false, elapsedMs: 0, shortfall: 0 }
    expect(relinkEntries(db, [entry], 3, byDefense, empty)).toEqual([entry])
  })

  it('대표 조합을 다시 고르면 대체 방어구로 보지 않는다', () => {
    const item = slotsResponse.items.find((it) => ARMOR_KINDS.some((kind) => it.armor[kind].length > 1))!
    const kind = ARMOR_KINDS.find((k) => item.armor[k].length > 1)!
    expect(isAlternative(item, { [kind]: item.armor[kind][0] })).toBe(false)
    expect(isAlternative(item, { [kind]: -1 })).toBe(false)
    expect(isAlternative(item, { talismanIndex: 0 })).toBe(false)
  })
})
