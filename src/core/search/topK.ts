/** 정렬 키: primary → secondary → tertiary 가 클수록, 같으면 먼저 찾은(seq 작은) 쪽이 앞 */
export interface Ranked {
  primary: number
  secondary: number
  tertiary: number
  seq: number
}

/** a 가 b 보다 앞이면 양수 */
export function compareRanked(a: Ranked, b: Ranked): number {
  return a.primary - b.primary || a.secondary - b.secondary || a.tertiary - b.tertiary || b.seq - a.seq
}

/** 상위 capacity 개만 유지하는 최소 힙 (heap[0] = 현재 가장 뒤쪽 항목) */
export class TopK<T extends Ranked> {
  private readonly heap: T[] = []
  readonly capacity: number

  constructor(capacity: number) {
    this.capacity = Math.max(0, capacity)
  }

  /** 이 키가 들어갈 수 있는지 (항목을 만들기 전에 확인용) */
  accepts(primary: number, secondary: number, tertiary: number, seq: number): boolean {
    if (this.heap.length < this.capacity) return true
    if (this.capacity === 0) return false
    return compareRanked({ primary, secondary, tertiary, seq }, this.heap[0]) > 0
  }

  push(entry: T): void {
    const heap = this.heap
    if (heap.length < this.capacity) {
      heap.push(entry)
      this.siftUp(heap.length - 1)
    } else if (this.capacity > 0 && compareRanked(entry, heap[0]) > 0) {
      heap[0] = entry
      this.siftDown(0)
    }
  }

  /** 앞쪽(좋은 것)부터 정렬된 목록 */
  sorted(): T[] {
    return [...this.heap].sort((a, b) => compareRanked(b, a))
  }

  private siftUp(i: number): void {
    const heap = this.heap
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (compareRanked(heap[i], heap[parent]) >= 0) break
      ;[heap[i], heap[parent]] = [heap[parent], heap[i]]
      i = parent
    }
  }

  private siftDown(i: number): void {
    const heap = this.heap
    for (;;) {
      const left = i * 2 + 1
      const right = left + 1
      let smallest = i
      if (left < heap.length && compareRanked(heap[left], heap[smallest]) < 0) smallest = left
      if (right < heap.length && compareRanked(heap[right], heap[smallest]) < 0) smallest = right
      if (smallest === i) break
      ;[heap[i], heap[smallest]] = [heap[smallest], heap[i]]
      i = smallest
    }
  }
}
