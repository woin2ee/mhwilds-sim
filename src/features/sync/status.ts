import type { SyncValue } from './syncContext'

/** 동기화한 시각. 오늘이면 시각만: "오늘 오후 3:12", 아니면 "10월 27일 오후 3:12" */
export function syncedAtText(iso: string, now = new Date()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const time = date.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })
  if (date.toDateString() === now.toDateString()) return `오늘 ${time}`
  return `${date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} ${time}`
}

export type SyncTone = 'muted' | 'accent' | 'bad'

/** 헤더 버튼과 동기화 패널이 함께 쓰는 지금 상태 한 줄과 색 */
export function syncStatus(sync: SyncValue): { text: string; tone: SyncTone } {
  if (sync.phase === 'syncing') return { text: '동기화 중…', tone: 'muted' }
  if (sync.phase === 'error') return { text: sync.error ?? '동기화하지 못했어요', tone: 'bad' }
  if (!sync.signedIn) {
    return {
      text: sync.pending ? '바꾼 내용을 아직 올리지 않았어요 · 눌러서 동기화' : '눌러서 동기화 (구글 로그인은 1시간 동안 유지돼요)',
      tone: 'accent',
    }
  }
  return { text: sync.syncedAt ? `동기화됨 · ${syncedAtText(sync.syncedAt)}` : '동기화 준비됨', tone: 'muted' }
}
