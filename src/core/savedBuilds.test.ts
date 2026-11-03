import { describe, expect, it } from 'vitest'
import { loadTestDb } from '../test/testDb'
import { customWeaponChoice, dbWeaponChoice } from './gogmaArtian'
import {
  buildWeaponKind,
  isFavorite,
  newSavedBuild,
  overwriteSavedBuild,
  weaponKindOf,
  withFavorite,
} from './savedBuilds'
import { emptyBuild, type WeaponChoice } from './types'

const db = loadTestDb()
const greatSword = db.data.weapons.find((w) => w.kind === 'great-sword')!
const withWeapon = (weapon: WeaponChoice | null) => ({ ...emptyBuild(), weapon })

describe('내 세팅 무기 종류', () => {
  it('DB 무기가 있으면 저장할 때 고른 종류보다 그 무기의 종류가 먼저다', () => {
    const build = withWeapon(dbWeaponChoice(greatSword.id))
    expect(buildWeaponKind(db, build)).toBe('great-sword')
    expect(weaponKindOf(db, { build })).toBe('great-sword')
    expect(weaponKindOf(db, { build, weaponKind: 'bow' })).toBe('great-sword')
  })

  it('직접 입력 무기·무기 없음·데이터에 없는 무기는 고른 종류를 쓰고, 고르지 않았으면 미지정', () => {
    for (const weapon of [customWeaponChoice([3, 3, 3], []), null, dbWeaponChoice(999_999)]) {
      const build = withWeapon(weapon)
      expect(buildWeaponKind(db, build)).toBeNull()
      expect(weaponKindOf(db, { build, weaponKind: 'long-sword' })).toBe('long-sword')
      expect(weaponKindOf(db, { build })).toBeNull()
    }
  })

  it('저장값의 모르는 종류는 미지정으로 본다', () => {
    expect(weaponKindOf(db, { build: emptyBuild(), weaponKind: 'chainsaw' as never })).toBeNull()
  })

  it('새 세팅은 고른 종류만 키로 담는다', () => {
    expect(newSavedBuild(emptyBuild(), '활 세팅', '', 'bow').weaponKind).toBe('bow')
    expect(newSavedBuild(emptyBuild(), '세팅')).not.toHaveProperty('weaponKind')
    expect(newSavedBuild(emptyBuild(), '세팅', '', null)).not.toHaveProperty('weaponKind')
  })

  it('새 세팅은 붙인 태그만 키로 담는다', () => {
    expect(newSavedBuild(emptyBuild(), '세팅', '', null, ['극딜용', ' #안정성 ']).tags).toEqual(['극딜용', '안정성'])
    expect(newSavedBuild(emptyBuild(), '세팅')).not.toHaveProperty('tags')
    expect(newSavedBuild(emptyBuild(), '세팅', '', null, [])).not.toHaveProperty('tags')
  })
})

describe('내 세팅 덮어쓰기', () => {
  const target = { ...newSavedBuild(emptyBuild(), '옛 세팅', '옛 메모', 'bow'), createdAt: '2026-01-01T00:00:00.000Z' }
  const build = withWeapon(dbWeaponChoice(greatSword.id))

  it('id·만든 날은 그대로, 세팅·이름·메모·무기 종류는 새것으로', () => {
    const saved = overwriteSavedBuild(target, build, ' 새 이름 ', ' 새 메모 ', 'great-sword')
    expect(saved).toMatchObject({
      id: target.id,
      createdAt: target.createdAt,
      name: '새 이름',
      memo: '새 메모',
      build,
      weaponKind: 'great-sword',
    })
    expect(saved.updatedAt >= target.updatedAt).toBe(true)
  })

  it('이름을 비우면 원래 이름, 종류를 고르지 않으면 원래 종류도 지운다', () => {
    const saved = overwriteSavedBuild(target, build, '  ', '', null)
    expect(saved.name).toBe('옛 세팅')
    expect(saved.memo).toBe('')
    expect(saved).not.toHaveProperty('weaponKind')
  })

  it('태그는 새것으로 바꾸고, 비우면 키도 지운다', () => {
    const tagged = { ...target, tags: ['솔플'] }
    expect(overwriteSavedBuild(tagged, build, '새 이름', '', null, ['극딜용']).tags).toEqual(['극딜용'])
    expect(overwriteSavedBuild(tagged, build, '새 이름', '', null, [])).not.toHaveProperty('tags')
  })

  it('즐겨찾기는 그대로 둔다', () => {
    expect(overwriteSavedBuild(withFavorite(target, true), build, '새 이름').favorite).toBe(true)
    expect(overwriteSavedBuild(target, build, '새 이름')).not.toHaveProperty('favorite')
  })
})

describe('내 세팅 즐겨찾기', () => {
  const saved = { ...newSavedBuild(emptyBuild(), '세팅', '메모', 'bow'), updatedAt: '2026-01-01T00:00:00.000Z' }

  it('켜면 키를 담고 끄면 키를 지운다. 고친 날과 다른 값은 그대로', () => {
    const on = withFavorite(saved, true)
    expect(on).toEqual({ ...saved, favorite: true })
    expect(isFavorite(on)).toBe(true)
    const off = withFavorite(on, false)
    expect(off).toEqual(saved)
    expect(off).not.toHaveProperty('favorite')
    expect(saved).not.toHaveProperty('favorite')
  })

  it('새 세팅은 즐겨찾기가 아니고, 저장값의 true 가 아닌 값은 꺼진 것으로 본다', () => {
    expect(isFavorite(saved)).toBe(false)
    for (const value of [false, 'true', 1, null]) expect(isFavorite({ favorite: value as never })).toBe(false)
  })
})
