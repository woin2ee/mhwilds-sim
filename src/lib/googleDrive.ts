// Google 로그인(Google Identity Services 토큰 방식)과 드라이브 앱 데이터 폴더 읽기·쓰기 (DESIGN.md §8.5).
// 서버가 없어 1시간짜리 접근 토큰만 받고, 새로 받으려면 버튼을 눌러 팝업을 열어야 한다 (구글 정책).
// 범위는 drive.appdata: 이 앱만 보는 숨김 폴더뿐이라 드라이브의 다른 파일은 보지도 바꾸지도 못한다.

/**
 * OAuth 클라이언트 ID (Google Cloud 콘솔 'mhwilds-sim' 프로젝트, 웹 애플리케이션). 공개돼도 되는 값이다.
 * 승인된 자바스크립트 원본: https://woin2ee.github.io, http://localhost:5173, http://localhost — 다른 주소에 배포하면 거기 맞는 클라이언트가 필요하다
 */
export const GOOGLE_CLIENT_ID = '1081374201658-e9gaofmr783tudior7h1thr18d8apbb1.apps.googleusercontent.com'
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata'

const GIS_SRC = 'https://accounts.google.com/gsi/client'
const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

// ---- Google Identity Services (필요한 것만) ----

interface TokenResponse {
  access_token: string
  expires_in: number
  scope: string
  error?: string
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string; login_hint?: string }): void
}

interface GoogleOAuth2 {
  initTokenClient(config: {
    client_id: string
    scope: string
    callback: (response: TokenResponse) => void
    error_callback: (error: { type: string }) => void
  }): TokenClient
  hasGrantedAllScopes(response: TokenResponse, ...scopes: string[]): boolean
  revoke(token: string, done?: () => void): void
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } }
  }
}

let loading: Promise<void> | null = null
let client: TokenClient | null = null
let pending: { resolve: (token: AccessToken) => void; reject: (error: unknown) => void } | null = null

/** 로그인 스크립트가 준비됐으면 true. 팝업은 클릭 처리 중에 바로 열어야 하므로 미리 불러 둔다 */
export function isGoogleReady(): boolean {
  return client !== null
}

/** 로그인 스크립트를 불러온다 (한 번만). 동기화를 쓰는 사람만 구글에 접속하도록 필요할 때만 부른다 */
export function loadGoogle(): Promise<void> {
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    script.onload = () => {
      const oauth2 = window.google?.accounts?.oauth2
      if (!oauth2) {
        loading = null
        script.remove()
        reject(new DriveError('load'))
        return
      }
      client = oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: DRIVE_SCOPE,
        callback: (response) => {
          const request = pending
          pending = null
          if (!request) return
          if (response.error) request.reject(new DriveError(response.error === 'access_denied' ? 'denied' : 'auth'))
          else if (!oauth2.hasGrantedAllScopes(response, DRIVE_SCOPE)) request.reject(new DriveError('scope'))
          else
            request.resolve({
              accessToken: response.access_token,
              expiresAt: Date.now() + response.expires_in * 1000,
            })
        },
        error_callback: (error) => {
          const request = pending
          pending = null
          request?.reject(new DriveError(error.type === 'popup_failed_to_open' ? 'popup' : 'closed'))
        },
      })
      resolve()
    }
    script.onerror = () => {
      loading = null
      script.remove()
      reject(new DriveError('load'))
    }
    document.head.append(script)
  })
  return loading
}

export interface AccessToken {
  accessToken: string
  /** 만료 시각 (ms) */
  expiresAt: number
}

/**
 * 구글 로그인 팝업으로 접근 토큰을 받는다. 클릭 처리 중에 바로 불러야 팝업이 막히지 않는다.
 * select: 계정 고르기(처음 연결), 아니면 이미 허용한 계정은 팝업이 떴다가 바로 닫힌다 (hint 로 그 계정을 고른다)
 */
export function requestAccessToken({ select, hint }: { select: boolean; hint?: string }): Promise<AccessToken> {
  if (!client) return Promise.reject(new DriveError('load'))
  pending?.reject(new DriveError('closed'))
  const promise = new Promise<AccessToken>((resolve, reject) => {
    pending = { resolve, reject }
  })
  client.requestAccessToken({ prompt: select ? 'select_account' : '', login_hint: hint })
  return promise
}

/** 이 사이트에 준 권한을 거둔다 (연결 끊기) */
export function revokeAccessToken(token: string): void {
  window.google?.accounts?.oauth2?.revoke(token)
}

// ---- 오류 ----

export type DriveErrorKind =
  | 'load' // 로그인 스크립트를 불러오지 못함
  | 'popup' // 팝업이 막힘
  | 'closed' // 로그인 창을 닫음
  | 'denied' // 권한을 거절
  | 'scope' // 드라이브 권한 체크를 끔
  | 'auth' // 토큰 만료·취소
  | 'network'
  | 'rate'
  | 'disabled' // 프로젝트에서 Drive API 가 꺼짐
  | 'other'

const MESSAGES: Record<DriveErrorKind, string> = {
  load: '구글 로그인을 불러오지 못했어요. 인터넷 연결이나 광고 차단 확장 프로그램을 확인해 주세요',
  popup: '로그인 창이 막혔어요. 다시 눌러 주세요 (브라우저의 팝업 차단을 확인해 주세요)',
  closed: '로그인 창을 닫았어요',
  denied: '구글 계정 권한을 허용하지 않았어요',
  scope: '구글 로그인 창에서 드라이브 권한에 체크해야 동기화할 수 있어요',
  auth: '구글 로그인이 끝났어요. 다시 눌러 주세요',
  network: '인터넷에 연결되지 않았어요',
  rate: '요청이 많아요. 잠시 뒤 다시 해 주세요',
  disabled: '드라이브 연결 설정에 문제가 있어요 (Drive API 꺼짐)',
  other: '드라이브와 동기화하지 못했어요',
}

export class DriveError extends Error {
  readonly kind: DriveErrorKind
  readonly status: number
  constructor(kind: DriveErrorKind, status = 0) {
    super(kind === 'other' && status > 0 ? `${MESSAGES.other} (HTTP ${status})` : MESSAGES[kind])
    this.kind = kind
    this.status = status
  }
}

async function errorOf(response: Response): Promise<DriveError> {
  let reasons: string[] = []
  try {
    const body = (await response.json()) as {
      error?: { status?: string; errors?: { reason?: string }[]; details?: { reason?: string }[] }
    }
    const error = body.error
    reasons = [error?.status, ...(error?.errors ?? []).map((e) => e.reason), ...(error?.details ?? []).map((d) => d.reason)]
      .filter((r): r is string => typeof r === 'string')
  } catch {
    // 본문이 JSON 이 아니면 상태 코드로만 가린다
  }
  const has = (...names: string[]) => names.some((name) => reasons.includes(name))
  if (response.status === 401) return new DriveError('auth', 401)
  if (has('accessNotConfigured', 'SERVICE_DISABLED')) return new DriveError('disabled', response.status)
  if (has('insufficientPermissions', 'ACCESS_TOKEN_SCOPE_INSUFFICIENT')) return new DriveError('scope', response.status)
  if (response.status === 429 || has('rateLimitExceeded', 'userRateLimitExceeded')) return new DriveError('rate', response.status)
  return new DriveError('other', response.status)
}

async function call(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, ...init.headers },
    })
  } catch {
    throw new DriveError('network')
  }
  if (!response.ok) throw await errorOf(response)
  return response
}

// ---- 드라이브 ----

export interface DriveAccount {
  /** 계정마다 바뀌지 않는 값 (permissionId) */
  id: string
  email: string
  name: string
}

export async function driveAccount(token: string): Promise<DriveAccount> {
  const response = await call(token, `${API}/about?fields=${encodeURIComponent('user(displayName,emailAddress,permissionId)')}`)
  const { user } = (await response.json()) as { user?: { displayName?: string; emailAddress?: string; permissionId?: string } }
  if (!user?.permissionId) throw new DriveError('other')
  return { id: user.permissionId, email: user.emailAddress ?? '', name: user.displayName ?? '' }
}

/** 앱 데이터 폴더의 파일 하나 (이름으로 찾는다) */
export interface DriveFile {
  id: string
  version: string
}

export function appDataFile(token: string, name: string) {
  const query = encodeURIComponent(`name = '${name}' and trashed = false`)
  return {
    /** 같은 이름이 여럿이면(두 기기가 동시에 처음 만든 경우) 가장 최근에 고친 것 */
    async find(): Promise<DriveFile | null> {
      const response = await call(
        token,
        `${API}/files?spaces=appDataFolder&q=${query}&orderBy=modifiedTime%20desc&pageSize=10&fields=files(id,version)`,
      )
      const { files } = (await response.json()) as { files?: DriveFile[] }
      return files?.[0] ?? null
    },
    async read(id: string): Promise<unknown> {
      const response = await call(token, `${API}/files/${id}?alt=media`)
      try {
        return (await response.json()) as unknown
      } catch {
        return null
      }
    },
    async version(id: string): Promise<string | null> {
      try {
        const response = await call(token, `${API}/files/${id}?fields=version`)
        return ((await response.json()) as { version?: string }).version ?? null
      } catch (err) {
        if (err instanceof DriveError && err.status === 404) return null
        throw err
      }
    },
    async create(content: unknown): Promise<DriveFile> {
      const boundary = `mhwilds-${Date.now().toString(36)}`
      const metadata = { name, parents: ['appDataFolder'], mimeType: 'application/json' }
      const body = [
        `--${boundary}`,
        'Content-Type: application/json; charset=UTF-8',
        '',
        JSON.stringify(metadata),
        `--${boundary}`,
        'Content-Type: application/json; charset=UTF-8',
        '',
        JSON.stringify(content),
        `--${boundary}--`,
      ].join('\r\n')
      const response = await call(token, `${UPLOAD}/files?uploadType=multipart&fields=id,version`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
      })
      return (await response.json()) as DriveFile
    },
    async update(id: string, content: unknown): Promise<DriveFile> {
      const response = await call(token, `${UPLOAD}/files/${id}?uploadType=media&fields=id,version`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify(content),
      })
      return (await response.json()) as DriveFile
    },
    async remove(id: string): Promise<void> {
      try {
        await call(token, `${API}/files/${id}`, { method: 'DELETE' })
      } catch (err) {
        if (!(err instanceof DriveError && err.status === 404)) throw err
      }
    },
  }
}
