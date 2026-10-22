import type { GameDb } from '../data/db'
import type { ArmorPiece, FixedTalisman } from '../data/types'

// HR 100 이상에서만 얻는 장비: ★9·★10 퀘스트(HR 100 이상)나 HR 100 미션에서만 나오는 소재·해금이 필요하다.
// MHDB 데이터에 퀘스트·HR 정보가 없어서 직접 적는다. 키는 게임 내부 id 라 데이터를 다시 만들어도 그대로다 (DESIGN.md §8.1).
// 출처: Fextralife 이벤트 퀘스트 목록·장비/호석/미션 페이지, game8 공략 (2026-10 확인). 인게임과 다르면 이 파일만 고치면 된다.
// 역전왕 레 다우·우드 투나 장비(레다젤트γ·투나물γ, 그 소재로 만드는 호석)는 ★8 HR 50 이상이라 넣지 않는다.

/** 방어구 세트 gameId */
export const HR100_ARMOR_SETS: ReadonlySet<number> = new Set([
  18386, // 이그졸스γ — 역전왕 누 이그드라 (★9·★10)
  15894, // 다하딜라γ — 역전왕 진 다하드 (★9·★10)
  23957, // 슈바르카γ — 역전왕 알슈베르도 (★10)
  2561, // 고그α — 고그마지오스는 HR 100 미션부터 나온다 (★9·★10)
  4066, // 고그β
  723, // 오메가 의상α — 오메가 플라네테스(극) ★9 소재
  4456, // 푸푸로페이크α — ★10 푸포루 퀘스트 소재
  14725, // 퀸α — 고그마지오스 다음 HR 100 사이드 미션을 깨야 제작 가능
])

/** 제작 호석 (charmGameId, 등급). 같은 계열의 아래 등급은 HR 100 전에 만들 수 있다 */
export const HR100_TALISMANS: readonly (readonly [charmGameId: number, level: number])[] = [
  [1772035584, 3], // 역상의 호석Ⅲ — 역전왕 누 이그드라 소재
  [1327804928, 3], // 급습의 호석Ⅲ — 역전왕 누 이그드라 소재
  [-1528900352, 3], // 도전의 호석Ⅲ — 역전왕 진 다하드·고그마지오스 소재
  [1116710528, 3], // 전화위복의 호석Ⅲ — 역전왕 진 다하드 소재
  [907750144, 3], // 쇄인의 호석Ⅲ — 역전왕 알슈베르도 소재
  [2009419008, 3], // 통격의 호석Ⅲ — 역전왕 알슈베르도 소재
  [-364548128, 3], // 내속의 호석Ⅲ — 고그마지오스 소재
  [4075369, 3], // 중격의 호석Ⅲ — 고그마지오스 소재
]
const HR100_TALISMAN_KEYS = new Set(HR100_TALISMANS.map(([charmGameId, level]) => `${charmGameId}:${level}`))

export function isHr100Armor(db: GameDb, piece: ArmorPiece): boolean {
  const set = db.armorSets.get(piece.setId)
  return set !== undefined && HR100_ARMOR_SETS.has(set.gameId)
}

export function isHr100Talisman(talisman: FixedTalisman): boolean {
  return HR100_TALISMAN_KEYS.has(`${talisman.charmGameId}:${talisman.level}`)
}

/** HR 100 이상에서만 얻는 방어구 id (검색 후보에서 뺄 때) */
export function hr100ArmorIds(db: GameDb): number[] {
  return db.data.armor.filter((piece) => isHr100Armor(db, piece)).map((piece) => piece.id)
}
