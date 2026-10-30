// 기기끼리 맞추는 값의 3-way 병합 (DESIGN.md §8.5).
// base 는 마지막으로 동기화했을 때 값이다. 한쪽만 바뀌었으면 바뀐 쪽을, 둘 다 바뀌었으면 pick 이 고른 쪽을 쓴다.
// base 가 없으면(처음 동기화, 새 항목) 양쪽을 합치기만 하고 지우지 않는다. undefined 는 '없음(지움·아직 없음)'이다.

export type Side = 'local' | 'remote'

/** 객체 키 순서와 상관없는 JSON (같은 값인지 비교용). undefined 는 undefined */
export function canonicalJson(value: unknown): string | undefined {
  return JSON.stringify(value, (_key, v: unknown) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  )
}

export function sameJson(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b)
}

/** 값 하나의 3-way 병합. 한쪽이 지우고 다른 쪽이 고쳤으면 고친 것을 살린다 */
export function merge3<T>(
  base: T | undefined,
  local: T | undefined,
  remote: T | undefined,
  pick: (local: T, remote: T) => Side,
): T | undefined {
  if (sameJson(local, base)) return remote
  if (sameJson(remote, base) || sameJson(local, remote)) return local
  if (local === undefined) return remote
  if (remote === undefined) return local
  return pick(local, remote) === 'local' ? local : remote
}

/**
 * id 가 있는 항목 목록의 병합. 항목마다 merge3 로 고르고, 순서는 드라이브 목록을 따르되 이 기기에만 있는 항목은
 * 이 기기 목록에서 바로 앞에 있던 항목 뒤(없으면 맨 앞)에 넣는다 (새 항목을 맨 위·맨 아래에 넣는 목록 모두 제자리에 온다).
 */
export function mergeList<T extends { id: string }>(
  base: readonly T[] | undefined,
  local: readonly T[],
  remote: readonly T[],
  pick: (local: T, remote: T) => Side,
): T[] {
  const baseById = byId(base ?? [])
  const localById = byId(local)
  const remoteById = byId(remote)
  const merged = new Map<string, T>()
  for (const id of new Set([...localById.keys(), ...remoteById.keys()])) {
    const item = merge3(baseById.get(id), localById.get(id), remoteById.get(id), pick)
    if (item !== undefined) merged.set(id, item)
  }

  const ids = [...new Set(remote.map((item) => item.id))].filter((id) => merged.has(id))
  const placed = new Set(ids)
  let previous: string | null = null
  for (const { id } of local) {
    if (!merged.has(id)) continue
    if (!placed.has(id)) {
      ids.splice(previous === null ? 0 : ids.indexOf(previous) + 1, 0, id)
      placed.add(id)
    }
    previous = id
  }
  return ids.map((id) => merged.get(id)!)
}

function byId<T extends { id: string }>(list: readonly T[]): Map<string, T> {
  return new Map(list.map((item) => [item.id, item]))
}
