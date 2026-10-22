import { describe, expect, it } from 'vitest'
import { emptyBuild } from './types'
import { loadTestDb } from '../test/testDb'
import {
  clearDecorations,
  fitDecorations,
  hasAnyDecoration,
  isEmptyBuild,
  refitDecorations,
  setArmor,
  setDecoration,
  setTalisman,
} from './buildUpdates'

const db = loadTestDb()
const armorDeco = (size: number) => db.data.decorations.find((d) => d.kind === 'armor' && d.size === size)!.id

describe('buildUpdates', () => {
  it('장비를 바꾸면 그 장비의 장식주를 비운다', () => {
    const piece = db.data.armor.find((a) => a.slots.length >= 2)!
    let b = setArmor(emptyBuild(), piece.kind, { id: piece.id, transcend: false })
    b = setDecoration(b, piece.kind, 1, armorDeco(1))
    expect(b.decorations[piece.kind]).toEqual([null, armorDeco(1)])
    expect(hasAnyDecoration(b)).toBe(true)
    expect(setArmor(b, piece.kind, null).decorations[piece.kind]).toEqual([])
    expect(setTalisman(b, { type: 'fixed', id: 1 }).decorations[piece.kind]).toEqual([null, armorDeco(1)])
  })

  it('초월 해제 시 새 슬롯에 맞지 않는 장식주만 빠진다', () => {
    const piece = db.data.armor.find((a) => a.rarity === 5 && a.slots.join() === '1')!
    let b = setArmor(emptyBuild(), piece.kind, { id: piece.id, transcend: true }) // 슬롯 [2,1,1]
    b = setDecoration(setDecoration(b, piece.kind, 0, armorDeco(2)), piece.kind, 2, armorDeco(1))
    const off = refitDecorations(db, { ...b, armor: { ...b.armor, [piece.kind]: { id: piece.id, transcend: false } } }, piece.kind)
    expect(off.decorations[piece.kind]).toEqual([null]) // 슬롯 [1]: Lv2 장식주는 못 들어가고 3번째 슬롯은 사라짐
  })

  it('fitDecorations: 종류·크기가 맞는 것만 유지', () => {
    const slots = [{ kind: 'armor', level: 3 }, { kind: 'armor', level: 1 }] as const
    expect(fitDecorations(db, [armorDeco(1), armorDeco(2)], slots)).toEqual([armorDeco(1), null])
    const weaponDeco = db.data.decorations.find((d) => d.kind === 'weapon' && d.size === 1)!.id
    expect(fitDecorations(db, [weaponDeco], slots)).toEqual([null, null])
  })

  it('장식주 비우기 / 빈 빌드 판정', () => {
    const b = setDecoration(emptyBuild(), 'talisman', 0, armorDeco(1))
    expect(Object.values(clearDecorations(b).decorations).every((d) => d.length === 0)).toBe(true)
    expect(isEmptyBuild(emptyBuild())).toBe(true)
    expect(isEmptyBuild(setTalisman(emptyBuild(), { type: 'fixed', id: 1 }))).toBe(false)
  })
})
