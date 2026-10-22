import { describe, expect, it } from 'vitest'
import { loadTestDb } from '../test/testDb'
import { HR100_ARMOR_SETS, HR100_TALISMANS, hr100ArmorIds, isHr100Talisman } from './hunterRank'

const db = loadTestDb()

function pieceIdsOfSet(koName: string): number[] {
  const set = db.data.armorSets.find((s) => s.name.ko === koName)
  if (!set) throw new Error(`armor set not found: ${koName}`)
  return set.pieceIds
}

describe('HR 100 장비', () => {
  it('목록의 세트·호석 게임 id 는 모두 데이터에 있다 (데이터를 다시 만들어도 맞는지)', () => {
    const gameIds = new Set(db.data.armorSets.map((s) => s.gameId))
    for (const gameId of HR100_ARMOR_SETS) expect(gameIds.has(gameId), `세트 gameId ${gameId}`).toBe(true)
    for (const [charmGameId, level] of HR100_TALISMANS) {
      expect(db.talismanByGameKey(charmGameId, level), `호석 ${charmGameId}:${level}`).toBeDefined()
    }
  })

  it('통격의 호석Ⅲ 은 HR 100 호석이고 Ⅱ 는 아니다', () => {
    const exploiter = (ko: string) => db.data.talismans.find((t) => t.name.ko === ko)!
    expect(isHr100Talisman(exploiter('통격의 호석Ⅲ'))).toBe(true)
    expect(isHr100Talisman(exploiter('통격의 호석Ⅱ'))).toBe(false)
  })

  it('이그졸스γ 는 5부위 모두 HR 100 장비, 레다젤트γ·투나물γ(HR 50)·이그졸스β 는 아니다', () => {
    const ids = new Set(hr100ArmorIds(db))
    expect(pieceIdsOfSet('이그졸스γ').every((id) => ids.has(id))).toBe(true)
    for (const name of ['레다젤트γ', '투나물γ', '이그졸스β']) {
      expect(pieceIdsOfSet(name).some((id) => ids.has(id)), name).toBe(false)
    }
  })
})
