/// <reference lib="webworker" />
import { GameDb } from '../../data/db'
import { runSearch } from './engine'
import type { WorkerInbound, WorkerOutbound } from './types'

let db: GameDb | null = null

const post = (msg: WorkerOutbound) => self.postMessage(msg)

self.onmessage = (event: MessageEvent<WorkerInbound>) => {
  const msg = event.data
  if (msg.type === 'init') {
    db = new GameDb(msg.data)
    post({ type: 'ready' })
    return
  }
  if (!db) {
    post({ type: 'error', id: msg.id, message: '게임 데이터가 아직 준비되지 않았습니다' })
    return
  }
  try {
    const response = runSearch(db, msg.request, {
      onProgress: (progress) => post({ type: 'progress', id: msg.id, progress }),
    })
    post({ type: 'result', id: msg.id, response })
  } catch (err) {
    post({ type: 'error', id: msg.id, message: err instanceof Error ? err.message : String(err) })
  }
}
