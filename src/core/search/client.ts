import type { GameData } from '../../data/types'
import type { SearchProgress, SearchRequest, SearchResponse, WorkerInbound, WorkerOutbound } from './types'

export interface RunningSearch {
  promise: Promise<SearchResponse>
  /** 진행 중인 검색을 중단한다 (워커를 종료하고 다음 검색 때 새로 만든다) */
  cancel(): void
}

export class SearchCancelledError extends Error {
  constructor() {
    super('검색이 취소되었습니다')
  }
}

/** 메인 스레드에서 검색 워커를 다루는 래퍼. 검색은 한 번에 하나만 실행한다. */
export class SearchClient {
  private worker: Worker | null = null
  private seq = 0
  private current: { id: number; reject: (err: Error) => void } | null = null
  private readonly data: GameData

  constructor(data: GameData) {
    this.data = data
  }

  search(request: SearchRequest, onProgress?: (progress: SearchProgress) => void): RunningSearch {
    this.cancelCurrent()
    const worker = this.ensureWorker()
    const id = ++this.seq
    const promise = new Promise<SearchResponse>((resolve, reject) => {
      this.current = { id, reject }
      worker.onmessage = (event: MessageEvent<WorkerOutbound>) => {
        const msg = event.data
        if (msg.type === 'ready' || msg.id !== id) return
        if (msg.type === 'progress') {
          onProgress?.(msg.progress)
          return
        }
        this.current = null
        if (msg.type === 'result') resolve(msg.response)
        else reject(new Error(msg.message))
      }
      worker.onerror = (event) => {
        this.current = null
        this.terminate()
        reject(new Error(event.message || '검색 워커 오류'))
      }
      worker.postMessage({ type: 'search', id, request } satisfies WorkerInbound)
    })
    return {
      promise,
      cancel: () => {
        if (this.current?.id === id) this.cancelCurrent()
      },
    }
  }

  dispose(): void {
    this.cancelCurrent()
    this.terminate()
  }

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' })
      this.worker.postMessage({ type: 'init', data: this.data } satisfies WorkerInbound)
    }
    return this.worker
  }

  private cancelCurrent(): void {
    if (!this.current) return
    const { reject } = this.current
    this.current = null
    // 동기 연산 중인 워커는 메시지를 받을 수 없으므로 종료 후 다음 검색 때 재생성
    this.terminate()
    reject(new SearchCancelledError())
  }

  private terminate(): void {
    this.worker?.terminate()
    this.worker = null
  }
}
