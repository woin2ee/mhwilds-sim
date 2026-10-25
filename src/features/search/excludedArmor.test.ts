import { describe, expect, it } from 'vitest'
import type { Locale } from '../../data/types'
import { armorByName, loadTestDb } from '../../test/testDb'
import {
  addExcludedArmor,
  excludeOptions,
  excludedArmorIds,
  excludedArmorLabel,
  excludedPieceIds,
  type ExcludedArmor,
} from './excludedArmor'

const db = loadTestDb()
const setId = (name: string) => {
  const set = db.data.armorSets.find((s) => s.name.ko === name)
  if (!set) throw new Error(`armor set not found: ${name}`)
  return set.id
}
const piece = (name: string): ExcludedArmor => ({ type: 'piece', id: armorByName(db, name).id })
const set = (name: string): ExcludedArmor => ({ type: 'set', id: setId(name) })
const series = (setName: string): ExcludedArmor => ({ type: 'series', id: setId(setName) })
const names = (ids: readonly number[]) => ids.map((id) => db.armor.get(id)!.name.ko)
const setNamesOf = (ids: readonly number[]) =>
  [...new Set(ids.map((id) => db.armorSets.get(db.armor.get(id)!.setId)!.name.ko))].sort()

describe('제외할 방어구', () => {
  it('계열은 세트 이름 끝의 α·β·γ 를 뗀 이름이 같은 세트 모두 (하위 랭크 세트 포함, 계열 안 어느 세트로 가리켜도 같다)', () => {
    const arkveld = excludedArmorIds(db, [series('슈바르카γ')])
    expect(arkveld).toHaveLength(15)
    expect(setNamesOf(arkveld)).toEqual(['슈바르카α', '슈바르카β', '슈바르카γ'])
    expect(excludedArmorIds(db, [series('슈바르카α')])).toEqual(arkveld)
    expect(setNamesOf(excludedPieceIds(db, series('레다젤트β')))).toEqual(['레다젤트', '레다젤트α', '레다젤트β', '레다젤트γ'])
    // 같은 몬스터의 다른 종(호쇄인룡 = 수호룡 알슈베르도)은 따로
    expect(excludedArmorIds(db, [series('호쇄인룡α')]).some((id) => arkveld.includes(id))).toBe(false)
  })

  it('한·영·일 이름 어느 것으로 묶어도 같은 계열이고, α·β·γ 가 없는 세트는 모두 하위 랭크다', () => {
    const sets = db.data.armorSets.filter((s) => s.pieceIds.length > 0)
    const groupsBy = (locale: Locale) => {
      const byStem = new Map<string, number[]>()
      for (const s of sets) {
        const stem = s.name[locale].replace(/[αβγ]$/u, '').trimEnd()
        byStem.set(stem, [...(byStem.get(stem) ?? []), s.id])
      }
      return [...byStem.values()].map((ids) => ids.sort((a, b) => a - b).join()).sort()
    }
    const ours = [...new Set(sets.map((s) => excludedArmorIds(db, [{ type: 'series', id: s.id }]).join()))].sort()
    const toSetIds = (pieceIds: string) =>
      [...new Set(pieceIds.split(',').map((id) => db.armor.get(Number(id))!.setId))].sort((a, b) => a - b).join()
    expect(ours.map(toSetIds).sort()).toEqual(groupsBy('ko'))
    expect(groupsBy('en')).toEqual(groupsBy('ko'))
    expect(groupsBy('ja')).toEqual(groupsBy('ko'))
    for (const s of sets) {
      const low = s.pieceIds.every((id) => db.armor.get(id)!.rank === 'low')
      expect(low, s.name.ko).toBe(!/[αβγ]$/u.test(s.name.ko))
    }
  })

  it('칩 이름: 방어구 이름, ‘세트’, ‘계열’ + 세트 등급 (하위 랭크는 ‘하위’)', () => {
    expect(excludedArmorLabel(db, piece('슈바르카암γ'))).toEqual({ label: '슈바르카암γ', detail: undefined })
    expect(excludedArmorLabel(db, piece('레다젤트헬름'))).toEqual({ label: '레다젤트헬름', detail: '하위' })
    expect(excludedArmorLabel(db, set('슈바르카γ'))).toEqual({ label: '슈바르카γ 세트', detail: undefined })
    expect(excludedArmorLabel(db, set('레다젤트'))).toEqual({ label: '레다젤트 세트', detail: '하위' })
    expect(excludedArmorLabel(db, series('슈바르카β'))).toEqual({ label: '슈바르카 계열', detail: 'α·β·γ' })
    expect(excludedArmorLabel(db, series('레다젤트γ'))).toEqual({ label: '레다젤트 계열', detail: '하위·α·β·γ' })
    expect(excludedArmorLabel(db, { type: 'set', id: 999999 })).toBeNull()
  })

  it('조건을 방어구 id 로 펼친다 (id 순, 중복 없음, 데이터에 없는 id 는 무시)', () => {
    const missing: ExcludedArmor[] = ['piece', 'set', 'series'].map((type) => ({ type, id: 999999 }) as ExcludedArmor)
    const ids = excludedArmorIds(db, [piece('슈바르카암γ'), set('슈바르카γ'), ...missing])
    expect(names(ids)).toEqual(['슈바르카헬름γ', '슈바르카메일γ', '슈바르카암γ', '슈바르카코일γ', '슈바르카그리브γ'])
    expect(ids).toEqual([...ids].sort((a, b) => a - b))
    expect(excludedArmorIds(db, missing)).toEqual([])
  })

  it('넣을 때 이미 다 빠져 있으면 그대로 두고, 새 조건 안에 다 드는 조건은 지워 칩 하나로 둔다', () => {
    const start = [piece('슈바르카암γ'), piece('레다젤트헬름α')]
    const withSet = addExcludedArmor(db, start, set('슈바르카γ'))
    expect(withSet).toEqual([piece('레다젤트헬름α'), set('슈바르카γ')])
    expect(addExcludedArmor(db, withSet, piece('슈바르카메일γ'))).toEqual(withSet)
    expect(addExcludedArmor(db, withSet, series('슈바르카α'))).toEqual([piece('레다젤트헬름α'), series('슈바르카α')])
    // 세트를 넣어도 계열 조건은 남는다 (세트보다 넓다)
    const withSeries = addExcludedArmor(db, [], series('슈바르카α'))
    expect(addExcludedArmor(db, withSeries, set('슈바르카β'))).toEqual(withSeries)
    // 데이터에 없는 조건은 건드리지 않는다
    const missing: ExcludedArmor = { type: 'set', id: 999999 }
    expect(addExcludedArmor(db, [missing], set('슈바르카γ'))).toEqual([missing, set('슈바르카γ')])
  })

  it('목록은 계열 → 세트 → 방어구, 세트가 하나뿐인 계열과 방어구가 하나뿐인 세트는 넣지 않는다', () => {
    const options = excludeOptions(db)
    const groups = options.map((o) => o.group)
    expect([...new Set(groups)]).toEqual(['계열 전체', '세트 전체', '방어구 하나'])
    // 묶음끼리 섞이지 않는다
    expect(groups).toEqual([...groups].sort((a, b) => groups.indexOf(a) - groups.indexOf(b)))
    expect(options.filter((o) => o.entry.type === 'piece')).toHaveLength(db.data.armor.length)
    for (const o of options) {
      expect(o.pieceIds.length, o.label).toBeGreaterThan(o.entry.type === 'piece' ? 0 : 1)
      expect(o.pieceIds).toEqual(excludedPieceIds(db, o.entry))
    }
    const seriesOptions = options.filter((o) => o.entry.type === 'series')
    expect(seriesOptions.map((o) => o.label)).toContain('슈바르카 계열')
    // 한 세트뿐인 계열(길드에이스α)은 세트로만
    expect(seriesOptions.map((o) => o.label)).not.toContain('길드에이스 계열')
    expect(options.map((o) => o.label)).toContain('길드에이스α 세트')
    // 방어구는 세트 이름으로도 찾는다
    const gamma = options.find((o) => o.label === '슈바르카암γ')!
    expect(gamma.search).toContain('슈바르카γ')
  })
})
