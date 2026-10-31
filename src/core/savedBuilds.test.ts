import { describe, expect, it } from 'vitest'
import { loadTestDb } from '../test/testDb'
import { customWeaponChoice, dbWeaponChoice } from './gogmaArtian'
import { buildWeaponKind, newSavedBuild, overwriteSavedBuild, weaponKindOf } from './savedBuilds'
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
})
