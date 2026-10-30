import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  appDataFile,
  driveAccount,
  DriveError,
  isGoogleReady,
  loadGoogle,
  requestAccessToken,
  revokeAccessToken,
  type AccessToken,
  type DriveAccount,
} from '../../lib/googleDrive'
import { onStoredChange, readStored, readStoredRaw, shareAcrossTabs, usePersistentState, writeStored } from '../../lib/storage'
import { isObject } from '../../state/storedValues'
import { useToast } from '../../state/toast'
import { SyncError, syncOnce, type SyncBase } from './engine'
import { SyncContext, type SyncPhase, type SyncValue } from './syncContext'
import { summaryText, SYNC_KEYS, type SyncKey } from './syncData'

/** 연결한 계정 (화면 상태라 훅으로, 다른 탭과 함께) */
const ACCOUNT_KEY = 'sync:v1'
/** 마지막 동기화 기록 (SyncBase) */
const BASE_KEY = 'sync-base:v1'
/** 키마다 이 기기에서 마지막으로 바꾼 시각 */
const CHANGED_KEY = 'sync-changed:v1'
/** 구글 접근 토큰 (1시간). 이 앱 전용 숨김 폴더만 다루는 권한이라 새로 고쳐도 다시 누르지 않게 저장해 둔다 */
const TOKEN_KEY = 'sync-token:v1'
const FILE_NAME = 'mhwilds-sim-sync.json'
const LOCK_NAME = 'mhwilds-sim:sync'

/** 바꾼 뒤 이만큼 더 바꾸지 않으면 올린다 */
const UPLOAD_DELAY = 3000
/** 이 화면으로 돌아왔을 때 마지막 동기화가 이보다 오래됐으면 받아 온다 */
const REFRESH_AFTER = 15_000
/** 토큰이 이만큼 남으면 끝난 것으로 본다 (동기화 도중에 끝나지 않게) */
const TOKEN_MARGIN = 60_000

type StoredToken = AccessToken & { accountId: string }
type Reason = 'auto' | 'manual' | 'connect'

const isAccount = (v: unknown): v is DriveAccount | null =>
  v === null || (isObject(v) && typeof v.id === 'string' && typeof v.email === 'string' && typeof v.name === 'string')

function liveToken(value: unknown): StoredToken | null {
  if (!isObject(value) || typeof value.accessToken !== 'string' || typeof value.expiresAt !== 'number') return null
  if (typeof value.accountId !== 'string' || value.expiresAt - TOKEN_MARGIN <= Date.now()) return null
  return value as unknown as StoredToken
}

function readBase(): SyncBase | null {
  const base = readStored(BASE_KEY)
  return isObject(base) && typeof base.fileId === 'string' && typeof base.syncedAt === 'string' && isObject(base.values)
    ? (base as unknown as SyncBase)
    : null
}

function readChanged(): Partial<Record<SyncKey, string>> {
  const value = readStored(CHANGED_KEY)
  return isObject(value) ? (value as Partial<Record<SyncKey, string>>) : {}
}

/** 탭 여러 개가 동시에 동기화하지 않게 (Web Locks 가 없는 브라우저는 그냥 실행) */
function withLock<T>(run: () => Promise<T>): Promise<T> {
  return navigator.locks ? navigator.locks.request(LOCK_NAME, run) : run()
}

const messageOf = (err: unknown) =>
  err instanceof DriveError || err instanceof SyncError ? err.message : '동기화하지 못했어요'

/**
 * Google 드라이브 동기화 (DESIGN.md §8.5). 연결하면 바꾼 내용을 잠시 뒤 올리고, 사이트를 열거나 이 화면으로 돌아오면 받아 온다.
 * 구글 로그인은 1시간이라 그 뒤에는 헤더의 동기화 버튼을 눌러야 한다. 연결 안 한 사람에게는 구글 스크립트도 불러오지 않는다.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const toast = useToast()
  const [account, setAccount] = usePersistentState<DriveAccount | null>(ACCOUNT_KEY, null, isAccount)
  const [token, setToken] = useState(() => liveToken(readStored(TOKEN_KEY)))
  const [phase, setPhase] = useState<SyncPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [syncedAt, setSyncedAt] = useState(() => readBase()?.syncedAt ?? null)
  const [pending, setPending] = useState(false)
  const [ready, setReady] = useState(isGoogleReady)
  const [loadFailed, setLoadFailed] = useState(false)

  // 비동기 처리(타이머·이벤트)에서 최신 값을 쓴다
  const accountRef = useRef(account)
  const tokenRef = useRef(token)
  const pendingRef = useRef(pending)
  useEffect(() => {
    accountRef.current = account
  }, [account])
  useEffect(() => {
    tokenRef.current = token
  }, [token])
  useEffect(() => {
    pendingRef.current = pending
  }, [pending])

  const running = useRef(false)
  const again = useRef(false)
  const lastRun = useRef(0)
  const uploadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const dropToken = useCallback(() => {
    writeStored(TOKEN_KEY, undefined)
    tokenRef.current = null
    setToken(null)
  }, [])

  const fail = useCallback(
    (err: unknown, reason: Reason) => {
      // 로그인이 끝났거나 권한이 없으면 다음에 누를 때 다시 로그인한다
      if (err instanceof DriveError && (err.kind === 'auth' || err.kind === 'scope')) dropToken()
      const quiet = err instanceof DriveError && (err.kind === 'closed' || (err.kind === 'auth' && reason === 'auto'))
      if (quiet) {
        setPhase('idle')
        return
      }
      setPhase('error')
      setError(messageOf(err))
      if (reason !== 'auto') toast(messageOf(err))
    },
    [dropToken, toast],
  )

  const run = useCallback(
    async (reason: Reason) => {
      if (!accountRef.current || !liveToken(tokenRef.current)) return
      if (running.current) {
        again.current = true
        return
      }
      running.current = true
      clearTimeout(uploadTimer.current)
      setPhase('syncing')
      try {
        let first = true
        do {
          again.current = false
          const current = accountRef.current
          const live = liveToken(tokenRef.current)
          if (!current || !live) break
          const drive = appDataFile(live.accessToken, FILE_NAME)
          const outcome = await withLock(async () => {
            const result = await syncOnce({
              drive,
              local: {
                readRaw: (key) => readStoredRaw(key),
                apply: (key, value) => writeStored(key, value),
                changedAt: readChanged,
              },
              accountId: current.id,
              base: readBase(),
              now: () => new Date().toISOString(),
            })
            writeStored(BASE_KEY, result.base)
            return result
          })
          lastRun.current = Date.now()
          setSyncedAt(outcome.base.syncedAt)
          setPending(false)
          setError(null)
          const text = summaryText(outcome.summary)
          // 알림은 처음 한 번만 (이어서 다시 맞춘 것은 조용히)
          if (first) {
            if (reason === 'connect') toast(text ? `드라이브와 합쳤어요 · ${text}` : 'Google 드라이브에 연결했어요')
            else if (text) toast(`드라이브에서 받았어요 · ${text}`)
            else if (reason === 'manual') toast('동기화했어요')
          } else if (text) toast(`드라이브에서 받았어요 · ${text}`)
          first = false
        } while (again.current)
        setPhase('idle')
      } catch (err) {
        fail(err, reason)
      } finally {
        running.current = false
      }
    },
    [fail, toast],
  )
  const runRef = useRef(run)
  useEffect(() => {
    runRef.current = run
  }, [run])

  /** 받은 토큰을 쓰고 계정을 확인한다 (팝업에서 다른 계정을 골랐을 수도 있다) */
  const adopt = useCallback(
    async (received: AccessToken) => {
      setPhase('syncing')
      const actual = await driveAccount(received.accessToken)
      const stored: StoredToken = { ...received, accountId: actual.id }
      writeStored(TOKEN_KEY, stored)
      tokenRef.current = stored
      setToken(stored)
      if (accountRef.current?.id !== actual.id) setSyncedAt(null)
      accountRef.current = actual
      setAccount(actual)
    },
    [setAccount],
  )

  const prepare = useCallback(() => {
    loadGoogle().then(
      () => {
        setReady(true)
        setLoadFailed(false)
      },
      () => setLoadFailed(true),
    )
  }, [])

  const connect = useCallback(() => {
    setError(null)
    requestAccessToken({ select: true })
      .then(adopt)
      .then(() => run('connect'))
      .catch((err: unknown) => fail(err, 'connect'))
  }, [adopt, fail, run])

  const syncNow = useCallback(() => {
    const current = accountRef.current
    if (!current) return
    if (liveToken(tokenRef.current)) {
      void run('manual')
      return
    }
    if (!isGoogleReady()) {
      prepare()
      toast('구글 로그인을 준비하고 있어요. 잠시 뒤 다시 눌러 주세요')
      return
    }
    requestAccessToken({ select: false, hint: current.email })
      .then(adopt)
      .then(() => run('manual'))
      .catch((err: unknown) => fail(err, 'manual'))
  }, [adopt, fail, prepare, run, toast])

  const disconnect = useCallback<SyncValue['disconnect']>(
    async ({ deleteRemote }) => {
      const current = accountRef.current
      try {
        let live = liveToken(tokenRef.current)
        if (deleteRemote) {
          // 클릭 처리 중에 바로 팝업을 연다 (await 전)
          live ??= { ...(await requestAccessToken({ select: false, hint: current?.email })), accountId: current?.id ?? '' }
          const file = appDataFile(live.accessToken, FILE_NAME)
          const found = await file.find()
          if (found) await file.remove(found.id)
        }
        if (live) revokeAccessToken(live.accessToken)
      } catch (err) {
        if (!(err instanceof DriveError && err.kind === 'closed')) toast(messageOf(err))
        return false
      }
      clearTimeout(uploadTimer.current)
      writeStored(BASE_KEY, undefined)
      dropToken()
      accountRef.current = null
      setAccount(null)
      setSyncedAt(null)
      setPending(false)
      setPhase('idle')
      setError(null)
      toast(deleteRemote ? '연결을 끊고 드라이브의 동기화 데이터를 지웠어요' : '동기화 연결을 끊었어요')
      return true
    },
    [dropToken, setAccount, toast],
  )

  // 동기화하는 값은 다른 탭과 바로 맞춘다 (한 탭이 받은 값을 다른 탭이 옛 값으로 덮어 드라이브까지 되돌리지 않게)
  useEffect(() => shareAcrossTabs([...SYNC_KEYS, ACCOUNT_KEY]), [])

  // 이 기기에서 바꾸면 바꾼 시각을 남기고 (연결 전에도: 처음 동기화에서 지금 조건 등을 고를 때 쓴다) 잠시 뒤 올린다
  useEffect(() => {
    const keys = new Set<string>(SYNC_KEYS)
    const stop = onStoredChange((key) => {
      if (!keys.has(key)) return
      writeStored(CHANGED_KEY, { ...readChanged(), [key]: new Date().toISOString() })
      if (!accountRef.current) return
      setPending(true)
      clearTimeout(uploadTimer.current)
      uploadTimer.current = setTimeout(() => void runRef.current('auto'), UPLOAD_DELAY)
    })
    return () => {
      stop()
      clearTimeout(uploadTimer.current)
    }
  }, [])

  // 연결돼 있으면: 로그인 스크립트를 미리 불러 두고, 열 때 한 번 받아 오고, 돌아오면 받아 오고, 떠날 때 남은 것을 올린다
  const connected = account !== null
  useEffect(() => {
    if (!connected) return
    prepare()
    // 방금 연결했으면 연결 쪽이 이미 동기화하고 있다
    if (!running.current) void runRef.current('auto')
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (Date.now() - lastRun.current > REFRESH_AFTER) void runRef.current('auto')
      } else if (pendingRef.current) void runRef.current('auto')
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [connected, prepare])

  // 토큰이 끝나면 '눌러서 동기화' 상태로
  useEffect(() => {
    if (!token) return
    const timer = setTimeout(() => setToken(null), Math.max(0, token.expiresAt - TOKEN_MARGIN - Date.now()))
    return () => clearTimeout(timer)
  }, [token])

  const value = useMemo<SyncValue>(
    () => ({
      account,
      phase,
      error,
      syncedAt,
      signedIn: token !== null,
      pending,
      ready,
      loadFailed,
      prepare,
      connect,
      syncNow,
      disconnect,
    }),
    [account, phase, error, syncedAt, token, pending, ready, loadFailed, prepare, connect, syncNow, disconnect],
  )
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}
