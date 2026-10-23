import { describe, expect, it } from 'vitest'
import { activeSkillLevels, computeBuild } from '../../core/calc'
import { runSearch } from '../../core/search/engine'
import { resultToBuild } from '../../core/search/toBuild'
import { armorSlots } from '../../core/transcend'
import { emptyBuild } from '../../core/types'
import type { ArmorPiece } from '../../data/types'
import { loadTestDb, skillIdByName } from '../../test/testDb'
import { DEFAULT_CONDITIONS, buildRequest, normalizeConditions } from '../search/conditions'
import {
  allSame,
  decorationRows,
  equipmentKey,
  skillRows,
  type CompareColumn,
  type SkillRowGroup,
} from './compareRows'

const db = loadTestDb()
const sid = (name: string) => skillIdByName(db, name)

// 비교할 세팅은 실제 검색 결과에서 가져온다 (장식주·시리즈 스킬이 골고루 들어 있다)
const request = buildRequest(
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
)
const response = runSearch(db, request)
const summaryOf = (i: number) => computeBuild(db, resultToBuild(db, response.items[i], request))
const searchColumn = (i: number): CompareColumn => ({
  summary: summaryOf(i),
  required: request.required,
  excludedSkills: request.excludedSkills,
})
const ORDER: SkillRowGroup[] = ['required', 'unwanted', 'bonus', 'extra']

describe('세팅 비교 행', () => {
  it('스킬: 원하는 스킬이 검색 순서대로 맨 앞, 칸마다 그 세팅의 발동 레벨', () => {
    const columns = [searchColumn(0), searchColumn(3)]
    const rows = skillRows(db, columns)
    expect(rows.slice(0, request.required.length).map((r) => [r.skillId, r.group])).toEqual(
      request.required.map((r) => [r.skillId, 'required']),
    )
    const groups = rows.map((r) => ORDER.indexOf(r.group))
    expect(groups).toEqual([...groups].sort((a, b) => a - b))

    // 어느 칸에서든 발동한 스킬은 한 번씩 다 나오고, 칸의 값은 그 세팅의 발동 레벨이다
    const active = columns.map((c) => activeSkillLevels(c.summary))
    const ids = new Set(active.flatMap((levels) => [...levels.keys()]))
    expect(new Set(rows.map((r) => r.skillId))).toEqual(new Set([...ids, ...request.required.map((r) => r.skillId)]))
    expect(rows.length).toBe(new Set(rows.map((r) => r.skillId)).size)
    for (const row of rows) {
      row.cells.forEach((cell, c) => expect(cell.level).toBe(active[c].get(row.skillId) ?? 0))
    }
    for (const row of rows.filter((r) => r.group === 'required')) {
      for (const cell of row.cells) expect(cell.level).toBeGreaterThanOrEqual(cell.required!)
    }
  })

  it('스킬: 한 칸에서라도 비선호면 비선호 묶음이고, 비선호 표시는 그 칸의 검색 기준', () => {
    const [a, b] = [searchColumn(0), searchColumn(3)]
    const requiredIds = new Set(request.required.map((r) => r.skillId))
    const extra = a.summary.skills.find((s) => !requiredIds.has(s.skillId) && s.contributions.some((c) => c.from !== 'weapon'))!
    const rows = skillRows(db, [{ ...a, excludedSkills: [extra.skillId] }, b])
    const row = rows.find((r) => r.skillId === extra.skillId)!
    expect(row.group).toBe('unwanted')
    expect(row.cells.map((c) => c.unwanted)).toEqual([true, false])
  })

  it('스킬: 원하는 스킬이 없는 비교(내 세팅)는 시리즈·그룹과 나머지 발동 스킬로만 나눈다', () => {
    const columns: CompareColumn[] = [0, 3].map((i) => ({ summary: summaryOf(i), required: [], excludedSkills: [] }))
    const rows = skillRows(db, columns)
    expect(new Set(rows.map((r) => r.group))).toEqual(new Set(['bonus', 'extra']))
    const extra = rows.filter((r) => r.group === 'extra')
    // 가장 높은 레벨 순
    const top = extra.map((r) => Math.max(...r.cells.map((c) => c.level)))
    expect(top).toEqual([...top].sort((x, y) => y - x))
    expect(rows.every((r) => r.cells.every((c) => c.required === null && !c.unwanted))).toBe(true)
  })

  it('장식주: 칸마다 개수를 세고 큰 장식주부터', () => {
    const columns = [searchColumn(0), searchColumn(3)]
    const rows = decorationRows(db, columns)
    columns.forEach((column, c) => {
      const filled = column.summary.slots.filter((s) => s.decorationId !== null).length
      expect(rows.reduce((sum, row) => sum + row.counts[c], 0)).toBe(filled)
    })
    const sizes = rows.map((r) => db.decorations.get(r.decorationId)!.size)
    expect(sizes).toEqual([...sizes].sort((x, y) => y - x))
  })

  it('장비: 초월 여부만 다른 같은 방어구는 슬롯이 그대로면 같은 장비, 장식주 배치는 보지 않는다', () => {
    const keyOf = (piece: ArmorPiece, transcend: boolean, decorations: (number | null)[] = []) => {
      const build = emptyBuild()
      build.armor[piece.kind] = { id: piece.id, transcend }
      build.decorations[piece.kind] = decorations
      return equipmentKey(build, computeBuild(db, build), piece.kind)
    }
    // 레어도 7·8 은 초월해도 슬롯이 그대로라 칸이 똑같다 (늘어난 방어력은 방어력 행에서 비교)
    const r8 = db.data.armor.find((a) => a.rarity === 8 && a.slots.length > 0)!
    expect(keyOf(r8, true)).toBe(keyOf(r8, false))
    const deco = db.data.decorations.find((d) => d.kind === 'armor' && d.size <= r8.slots[0])!
    expect(keyOf(r8, false, [deco.id])).toBe(keyOf(r8, false))
    // 레어도 5·6 은 초월하면 슬롯이 늘어 칸이 달라 보인다
    const r5 = db.data.armor.find((a) => a.rarity === 5 && armorSlots(a, true).join() !== a.slots.join())!
    expect(keyOf(r5, true)).not.toBe(keyOf(r5, false))
  })

  it('모든 칸이 같은지: 칸이 하나면 같다고 보지 않는다', () => {
    expect(allSame([5, 5])).toBe(true)
    expect(allSame(['a', 'a', 'a'])).toBe(true)
    expect(allSame([5, 4])).toBe(false)
    expect(allSame([5])).toBe(false)
  })
})
