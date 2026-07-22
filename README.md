# AI Usage

[English](#english) | [한국어](#한국어)

---

## English

AI Usage is a Windows tray app for checking AI coding subscription usage at a glance.

![AI Usage English Screenshot](English%20Screenshot.png)

### Download

[Download the latest Windows release](https://github.com/datell1357/AI-Usage-for-Windows/releases/latest)

The app runs from the Windows system tray, stays out of the taskbar, and opens a compact panel above the tray icon.

### Features

- Windows tray-only app
- Left-click tray panel toggle and right-click tray menu
- Global shortcut support
- Automatic refresh, defaulting to 1 minute
- Start on Login enabled by default
- Optional local HTTP API at `127.0.0.1:6736` when `AI_USAGE_ENABLE_LOCAL_HTTP_API=1` is set
- Proxy support for provider HTTP requests
- Plugin-based provider architecture

### Supported Providers

The Windows release currently bundles these providers:

| Provider | Status | Notes |
|---|---:|---|
| [Claude](docs/providers/claude.md) | Available | Claude Code OAuth usage, weekly/session limits, extra usage, ccusage local token data |
| [Codex](docs/providers/codex.md) | Available | Codex/ChatGPT OAuth usage, weekly/session limits, reviews, credits |
| [Gemini](docs/providers/gemini.md) | Available | Gemini CLI / Code Assist OAuth credentials and Cloud Code quota APIs |
| [GitHub Copilot](docs/providers/copilot.md) | Available | GitHub CLI authenticated Copilot usage limits |
| [Grok](docs/providers/grok.md) | Available | xAI plan, shared usage pool, and Grok Build product usage |
| [Sakana AI](docs/providers/sakana.md) | Available | Sakana AI Fugu 5-hour, weekly, and subscription details |
| [Kimi](docs/providers/kimi.md) | Available | Kimi Code session and weekly usage, plan from membership level |
| [Qwen](docs/providers/qwen.md) | Available | Qwen Token Plan and Coding Plan quotas, international and China consoles |
| [Antigravity](docs/providers/antigravity.md) | Available | Windows SQLite and Cloud Code fallback path |
| [Cursor](docs/providers/cursor.md) | Available | Cursor Desktop SQLite and CLI credential fallback |

Provider usage appears when the corresponding third-party tool is installed on the local Windows device, the user has completed sign-in so credentials are available, and the provider is enabled in the app settings.

Gemini usage reflects Gemini CLI / Code Assist quota buckets. Gemini app compute-based limits and Gemini API token accounting are separate Google surfaces.

### Provider Comparison

Providers expose different things, so the app shows different lines for each. `●` means the provider reports it, `○` means it does not.

#### Metrics

| Provider | Session (5h) | Weekly | Monthly / billing cycle | Credits or spend | Per-model breakdown | Local token history | Plan renewal date |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Claude | ● | ● | ○ | ● extra usage | ● Sonnet, Fable, Claude Design | ● | ○ |
| Codex | ● | ● | ○ | ● | ● | ● | ○ |
| Gemini | ○ | ○ | ○ | ○ | ● | ○ | ○ |
| GitHub Copilot | ○ | ○ | ● | ○ | ○ | ○ | ● |
| Grok | ○ | ○ | ● | ● | ○ | ○ | ● |
| Sakana AI | ● | ● | ○ | ○ | ○ | ○ | ● |
| Kimi | ● | ● | ○ | ○ | ○ | ○ | ○ |
| Qwen | ● | ● | ●¹ | ○ | ○ | ○ | ● |
| Antigravity | ○ | ○ | ○ | ○ | ● | ○ | ○ |
| Cursor | ○ | ○ | ● | ● | ○ | ○ | ● |

Qwen covers two subscriptions: a Token Plan reporting five-hour and weekly windows as percentages, and a Coding Plan reporting five-hour, weekly, and monthly request counts (¹ monthly is Coding Plan only). Codex adds a code-review quota line. Grok's shared pool resets weekly or monthly depending on the plan, and it adds a Grok Build product line. Copilot splits its monthly quota into Premium and Chat on paid plans, Chat and Completions on the free plan. Cursor splits its cycle into auto and API usage.

#### Credentials and refresh

| Provider | Credential source | Token refresh | Enabled by default |
|---|---|:-:|:-:|
| Claude | `~/.claude/.credentials.json` or Windows Credential Manager | ● | ● |
| Codex | `~/.codex/auth.json` or Windows Credential Manager | ● | ● |
| Gemini | `~/.gemini/oauth_creds.json` | ● | ● |
| GitHub Copilot | Copilot CLI or GitHub CLI credentials, or a `GH_TOKEN` style variable | ○ rotates between sources | ● |
| Grok | browser session cookie in `~/.ai-usage/config.json` | ○ | ○ |
| Sakana AI | browser session cookie in `~/.ai-usage/config.json`, then self-renewing | ● | ○ |
| Kimi | `~/.kimi-code/credentials/kimi-code.json` | ● | ○ |
| Qwen | console session cookies in `~/.ai-usage/config.json` | ○ | ○ |
| Antigravity | Antigravity desktop SQLite state, Cloud Code fallback | ● | ● |
| Cursor | Cursor desktop SQLite state or Windows Credential Manager | ● | ○ |

Providers without token refresh stop reporting once the stored cookie expires, and the app asks for a fresh one.

#### What each provider cannot show

| Provider | Not available |
|---|---|
| Claude | no per-model session view; usage stays hidden for tokens without profile scope, and for API keys |
| Codex | usage is unavailable when only an API key is configured |
| Gemini | quota buckets only, with no reset countdown across the plan as a whole; API key and Vertex AI sign-in are unsupported |
| GitHub Copilot | monthly counters only, with no session or weekly window and no token counts |
| Grok | no session window, and sign-in has to be done by pasting a cookie |
| Sakana AI | read from the billing page rather than an API, so console redesigns can break it |
| Kimi | session and weekly windows only, with no credit or spend view |
| Qwen | the `sk-sp-` API key cannot read usage, so it needs console cookies; no per-model or token-level detail |
| Antigravity | per-model quota fractions only, with no spend, no history, and no window totals |
| Cursor | billing cycle only; team and enterprise accounts fall back to a request count |

### Documentation

- [Claude provider](docs/providers/claude.md)
- [Codex provider](docs/providers/codex.md)
- [Gemini provider](docs/providers/gemini.md)
- [GitHub Copilot provider](docs/providers/copilot.md)
- [Grok provider](docs/providers/grok.md)
- [Sakana AI provider](docs/providers/sakana.md)
- [Kimi provider](docs/providers/kimi.md)
- [Qwen provider](docs/providers/qwen.md)
- [Antigravity provider](docs/providers/antigravity.md)
- [Cursor provider](docs/providers/cursor.md)
- [Plugin API](docs/plugins/api.md)
- [Local HTTP API](docs/local-http-api.md)
- [Proxy support](docs/proxy.md)
- [Capture logs](docs/capture-logs.md)
- [Privacy Policy](PRIVACY.md)
- [Microsoft Store MSIX submission](docs/microsoft-store-msix.md)

### Build From Source

#### Requirements

- Windows 10 or later
- Node.js 20+
- Rust stable MSVC toolchain
- LLVM installed at `C:\Program Files\LLVM` for the bundled QuickJS build
- WiX Toolset / NSIS dependencies required by Tauri bundling

#### Install

```powershell
npm.cmd install
```

#### Test

```powershell
npm.cmd test
```

Focused provider tests:

```powershell
npm.cmd test -- plugins/gemini/plugin.test.js plugins/antigravity/plugin.test.js
```

#### Build Frontend

```powershell
npm.cmd run build
```

#### Build Windows Installers

```powershell
$env:Path="$env:USERPROFILE\.cargo\bin;C:\Program Files\LLVM\bin;$env:Path"
$env:LIBCLANG_PATH="C:\Program Files\LLVM\bin"
npm.cmd run tauri -- build
```

Installers are written to:

- `src-tauri\target\release\bundle\nsis\AI Usage_0.3.0_x64-setup.exe`
- `src-tauri\target\release\bundle\msi\AI Usage_0.3.0_x64_en-US.msi`

### Credits

Built by [Yeoreum](https://www.threads.com/@mini.yeoreum).

AI Usage is a separate Windows-focused project based on MIT-licensed source code from [robinebers/openusage](https://github.com/robinebers/openusage). It is not an official distribution of the original project.

Required copyright and permission notices are preserved in [LICENSE](LICENSE).

### License

[MIT](LICENSE)

---

## 한국어

AI Usage는 AI 코딩 구독 사용량을 Windows 시스템 트레이에서 빠르게 확인하는 데스크톱 앱입니다.

![AI Usage 한국어 스크린샷](Korean%20Screenshot.png)

### 다운로드

[최신 Windows 릴리스 다운로드](https://github.com/datell1357/AI-Usage-for-Windows/releases/latest)

AI Usage는 Windows 시스템 트레이에서만 동작하며 작업표시줄에는 표시되지 않습니다. 트레이 아이콘을 클릭하면 작업표시줄 우측 하단 기준으로 작은 패널이 위로 열립니다.

### 주요 기능

- Windows 트레이 전용 앱
- 트레이 아이콘 좌클릭 패널 열기/닫기, 우클릭 메뉴
- 전역 단축키 지원
- 기본 1분 자동 새로고침
- Start on Login 기본 활성화
- `AI_USAGE_ENABLE_LOCAL_HTTP_API=1` 설정 시 `127.0.0.1:6736` 로컬 HTTP API 제공
- Provider HTTP 요청 프록시 지원
- 플러그인 기반 provider 구조

### 지원 Provider

현재 Windows 릴리스에는 다음 provider가 포함되어 있습니다.

| Provider | 상태 | 설명 |
|---|---:|---|
| [Claude](docs/providers/claude.md) | 사용 가능 | Claude Code OAuth 사용량, 주간/세션 제한, extra usage, ccusage 로컬 토큰 데이터 |
| [Codex](docs/providers/codex.md) | 사용 가능 | Codex/ChatGPT OAuth 사용량, 주간/세션 제한, reviews, credits |
| [Gemini](docs/providers/gemini.md) | 사용 가능 | Gemini CLI / Code Assist OAuth credentials 및 Cloud Code quota API |
| [GitHub Copilot](docs/providers/copilot.md) | 사용 가능 | GitHub CLI 인증 기반 Copilot 사용량 제한 |
| [Grok](docs/providers/grok.md) | 사용 가능 | xAI 플랜, 공유 usage pool 및 Grok Build product 사용량 |
| [Sakana AI](docs/providers/sakana.md) | 사용 가능 | Sakana AI Fugu의 5시간, 주간 및 구독 정보 |
| [Kimi](docs/providers/kimi.md) | 사용 가능 | Kimi Code의 세션, 주간 사용량 및 membership level 기반 플랜 |
| [Qwen](docs/providers/qwen.md) | 사용 가능 | Qwen Token Plan 및 Coding Plan quota, 국제·중국 콘솔 지원 |
| [Antigravity](docs/providers/antigravity.md) | 사용 가능 | Windows SQLite 및 Cloud Code fallback 경로 |
| [Cursor](docs/providers/cursor.md) | 사용 가능 | Cursor Desktop SQLite 및 CLI credential fallback |

각 provider 사용량은 해당 도구가 로컬 Windows 기기에 설치되어 있고, 사용자가 로그인해 credential을 사용할 수 있으며, 앱 설정에서 provider가 활성화된 경우 표시됩니다.

Gemini 사용량은 Gemini CLI / Code Assist quota bucket 기준입니다. Gemini 앱의 compute 기반 제한과 Gemini API token accounting은 별도 Google 화면입니다.

### Provider 비교

Provider마다 제공하는 항목이 달라 앱에 표시되는 줄도 달라집니다. `●`는 해당 provider가 제공하는 항목, `○`는 제공하지 않는 항목입니다.

#### 지표

| Provider | 세션(5시간) | 주간 | 월간/청구 주기 | 크레딧·지출 | 모델별 구분 | 로컬 토큰 기록 | 플랜 갱신일 |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Claude | ● | ● | ○ | ● extra usage | ● Sonnet, Fable, Claude Design | ● | ○ |
| Codex | ● | ● | ○ | ● | ● | ● | ○ |
| Gemini | ○ | ○ | ○ | ○ | ● | ○ | ○ |
| GitHub Copilot | ○ | ○ | ● | ○ | ○ | ○ | ● |
| Grok | ○ | ○ | ● | ● | ○ | ○ | ● |
| Sakana AI | ● | ● | ○ | ○ | ○ | ○ | ● |
| Kimi | ● | ● | ○ | ○ | ○ | ○ | ○ |
| Qwen | ● | ● | ●¹ | ○ | ○ | ○ | ● |
| Antigravity | ○ | ○ | ○ | ○ | ● | ○ | ○ |
| Cursor | ○ | ○ | ● | ● | ○ | ○ | ● |

Qwen은 두 가지 구독을 지원합니다. Token Plan은 5시간·주간 창을 백분율로, Coding Plan은 5시간·주간·월간을 요청 수로 보고합니다(¹ 월간은 Coding Plan 전용). Codex에는 코드 리뷰 quota 줄이 추가됩니다. Grok의 공유 pool은 플랜에 따라 주간 또는 월간으로 초기화되며 Grok Build product 줄이 추가됩니다. Copilot은 월간 quota를 유료 플랜에서 Premium과 Chat으로, 무료 플랜에서 Chat과 Completions로 나눕니다. Cursor는 청구 주기를 auto 사용량과 API 사용량으로 나눕니다.

#### Credential과 갱신

| Provider | Credential 위치 | 토큰 자동 갱신 | 기본 활성화 |
|---|---|:-:|:-:|
| Claude | `~/.claude/.credentials.json` 또는 Windows 자격 증명 관리자 | ● | ● |
| Codex | `~/.codex/auth.json` 또는 Windows 자격 증명 관리자 | ● | ● |
| Gemini | `~/.gemini/oauth_creds.json` | ● | ● |
| GitHub Copilot | Copilot CLI 또는 GitHub CLI credential, `GH_TOKEN` 계열 변수 | ○ 소스 간 전환 | ● |
| Grok | `~/.ai-usage/config.json`에 넣은 브라우저 세션 쿠키 | ○ | ○ |
| Sakana AI | `~/.ai-usage/config.json`에 넣은 브라우저 세션 쿠키, 이후 자동 연장 | ● | ○ |
| Kimi | `~/.kimi-code/credentials/kimi-code.json` | ● | ○ |
| Qwen | `~/.ai-usage/config.json`에 넣은 콘솔 세션 쿠키 | ○ | ○ |
| Antigravity | Antigravity 데스크톱 SQLite state, Cloud Code fallback | ● | ● |
| Cursor | Cursor 데스크톱 SQLite state 또는 Windows 자격 증명 관리자 | ● | ○ |

토큰 자동 갱신이 없는 provider는 저장된 쿠키가 만료되면 사용량 표시가 멈추고, 앱이 새 쿠키를 요청합니다.

#### Provider별 표시할 수 없는 항목

| Provider | 표시 불가 |
|---|---|
| Claude | 모델별 세션 화면 없음. profile scope가 없는 토큰과 API 키는 사용량이 표시되지 않음 |
| Codex | API 키만 설정된 경우 사용량을 볼 수 없음 |
| Gemini | quota bucket만 제공하며 플랜 전체 기준 초기화 카운트다운이 없음. API 키와 Vertex AI 로그인은 지원되지 않음 |
| GitHub Copilot | 월간 집계만 있고 세션·주간 창과 토큰 수가 없음 |
| Grok | 세션 창이 없고 로그인은 쿠키를 붙여넣어야 함 |
| Sakana AI | API가 아니라 billing 페이지에서 읽으므로 콘솔 개편에 영향을 받음 |
| Kimi | 세션과 주간 창만 있고 크레딧·지출 화면이 없음 |
| Qwen | `sk-sp-` API 키로는 사용량을 읽을 수 없어 콘솔 쿠키가 필요하며, 모델별·토큰 단위 정보가 없음 |
| Antigravity | 모델별 quota 비율만 있고 지출, 기록, 창 합계가 없음 |
| Cursor | 청구 주기 기준만 제공. 팀·엔터프라이즈 계정은 요청 수로 대체됨 |

### 문서

- [Claude provider](docs/providers/claude.md)
- [Codex provider](docs/providers/codex.md)
- [Gemini provider](docs/providers/gemini.md)
- [GitHub Copilot provider](docs/providers/copilot.md)
- [Grok provider](docs/providers/grok.md)
- [Sakana AI provider](docs/providers/sakana.md)
- [Kimi provider](docs/providers/kimi.md)
- [Qwen provider](docs/providers/qwen.md)
- [Antigravity provider](docs/providers/antigravity.md)
- [Cursor provider](docs/providers/cursor.md)
- [Plugin API](docs/plugins/api.md)
- [Local HTTP API](docs/local-http-api.md)
- [Proxy support](docs/proxy.md)
- [Capture logs](docs/capture-logs.md)
- [개인정보 처리방침](PRIVACY.md)
- [Microsoft Store MSIX 제출](docs/microsoft-store-msix.md)

### 소스에서 빌드

#### 요구사항

- Windows 10 이상
- Node.js 20 이상
- Rust stable MSVC toolchain
- bundled QuickJS 빌드를 위한 LLVM (`C:\Program Files\LLVM`)
- Tauri 번들링에 필요한 WiX Toolset / NSIS 의존성

#### 설치

```powershell
npm.cmd install
```

#### 테스트

```powershell
npm.cmd test
```

Provider 중심 테스트:

```powershell
npm.cmd test -- plugins/gemini/plugin.test.js plugins/antigravity/plugin.test.js
```

#### 프론트엔드 빌드

```powershell
npm.cmd run build
```

#### Windows 설치 파일 빌드

```powershell
$env:Path="$env:USERPROFILE\.cargo\bin;C:\Program Files\LLVM\bin;$env:Path"
$env:LIBCLANG_PATH="C:\Program Files\LLVM\bin"
npm.cmd run tauri -- build
```

설치 파일은 다음 경로에 생성됩니다.

- `src-tauri\target\release\bundle\nsis\AI Usage_0.3.0_x64-setup.exe`
- `src-tauri\target\release\bundle\msi\AI Usage_0.3.0_x64_en-US.msi`

### 크레딧

Built by [Yeoreum](https://www.threads.com/@mini.yeoreum).

AI Usage는 [robinebers/openusage](https://github.com/robinebers/openusage)의 MIT 라이선스 소스 코드를 기반으로 Windows용으로 정리한 별도 프로젝트입니다. 원본 프로젝트의 공식 배포본이 아닙니다.

필요한 저작권 및 허가 고지는 [LICENSE](LICENSE)에 보존되어 있습니다.

### 라이선스

[MIT](LICENSE)
