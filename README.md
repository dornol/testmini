# TestMini — QA Management System

내부 QA 관리 시스템. 프로젝트별 테스트 케이스 관리, 테스트 실행, 실패 추적, 실시간 동기화를 지원합니다.

## 주요 기능

- **프로젝트 관리** — 프로젝트 생성/수정/비활성화, 멤버 초대 및 역할 관리
- **테스트 케이스** — 버전 관리, 그룹/태그 분류, DnD 정렬, 벌크 액션, Import/Export (CSV/JSON)
- **테스트 런** — 환경별 실행, 인라인 상태 변경, Bulk Pass, 진행률 표시
- **실패 상세** — 실패 환경, 에러 메시지, 스택 트레이스 기록
- **파일 첨부** — 테스트 케이스/실행/실패에 파일 업로드 (MIME 화이트리스트, 접근 제어)
- **실시간 동기화** — SSE + Redis Pub/Sub 기반 테스트 런 실시간 업데이트
- **대시보드/리포트** — 통과율, 환경별/우선순위별 통계, Chart.js 차트 (지연 로딩), 날짜 범위 필터, CSV 스트리밍 내보내기
- **OIDC 연동** — 관리자가 런타임에 외부 IdP(Keycloak, Google 등) 추가 가능, JWKS 서명 검증
- **보안** — Rate Limiting (Redis), 보안 헤더, PBKDF2 키 파생, SSRF 방어, path traversal 차단
- **다국어** — 한국어/영어 (Paraglide)
- **다크 모드** — 시스템 설정 감지 + 수동 전환

---

## Tech Stack

| 영역 | 기술 |
|------|------|
| Frontend + Backend | **SvelteKit** (SSR + API), **Svelte 5** (runes), **TypeScript** |
| UI | **shadcn-svelte** (Radix UI), **TailwindCSS v4** |
| 폼 처리 | **sveltekit-superforms** + **zod** |
| DB / ORM | **PostgreSQL**, **Drizzle ORM** (postgres.js) |
| 인증 | **better-auth** (email/password + admin plugin) |
| OIDC | 커스텀 OAuth/PKCE 핸들러 (런타임 IdP 관리) |
| 캐시 / 실시간 | **Redis** (ioredis) — Soft Lock, SSE Pub/Sub |
| 파일 스토리지 | 로컬 파일 시스템 (S3 전환 가능) |
| 차트 | **Chart.js** |
| i18n | **Paraglide** (ko, en) |
| 테스트 | **Vitest** (unit/component), **Playwright** |
| 패키지 매니저 | **pnpm** |

---

## 시작하기

### 사전 요구사항

- Node.js 24+
- pnpm
- Docker & Docker Compose

> 상세 배포 가이드는 [DEPLOY.md](./DEPLOY.md) 참조.

### 설치

```bash
# 의존성 설치
pnpm install

# Docker 서비스 시작 (PostgreSQL, Redis)
docker compose up -d

# 환경 변수 설정
cp .env.example .env
# .env 파일에서 ORIGIN, BETTER_AUTH_SECRET 설정

# DB 마이그레이션
pnpm db:push

# 개발 서버 실행
pnpm dev
```

### 환경 변수

| 변수 | 설명 | 예시 |
|------|------|------|
| `DATABASE_URL` | PostgreSQL 연결 문자열 | `postgres://root:mysecretpassword@localhost:5432/local` |
| `ORIGIN` | 앱 기본 URL | `http://localhost:5173` |
| `BETTER_AUTH_SECRET` | 인증 시크릿 (32자 이상 권장) | 랜덤 문자열 |

### 스크립트

```bash
pnpm dev              # 개발 서버
pnpm build            # 프로덕션 빌드
pnpm preview          # 빌드 미리보기
pnpm check            # 타입 체크
pnpm test             # 테스트 실행
pnpm lint             # ESLint 실행
pnpm format           # Prettier 포맷팅
pnpm format:check     # 포맷팅 검사
pnpm db:push          # DB 스키마 반영
pnpm db:generate      # 마이그레이션 생성
pnpm db:migrate       # 마이그레이션 실행
pnpm db:studio        # Drizzle Studio (DB GUI)
pnpm auth:schema      # better-auth 스키마 생성
```

---

## 인증 / 인가

### 인증 방식

- **이메일/비밀번호** — better-auth 기본 인증
- **OIDC/OAuth2** — 관리자가 Admin 패널에서 외부 IdP를 런타임에 등록/관리
  - PKCE (S256) 지원
  - OIDC Discovery 자동 설정 (SSRF 방어: 사설 IP 차단, HTTPS 강제)
  - JWKS 기반 ID 토큰 서명 검증 (RS256/384/512)
  - 클라이언트 시크릿 AES-256-GCM 암호화 저장 (PBKDF2 키 파생)
  - 이메일 기반 자동 계정 매칭
  - 계정 연동/해제 관리

### Global Role

| 역할 | 설명 |
|------|------|
| **ADMIN** | 시스템 전체 관리 (Admin 패널 접근, 모든 프로젝트 접근) |
| **USER** | 기본 역할, 소속된 프로젝트만 접근 가능 |

### Project Role

| 기능 | PROJECT_ADMIN | QA | DEV | VIEWER |
|------|:---:|:---:|:---:|:---:|
| 프로젝트 조회 / 대시보드 / 리포트 | O | O | O | O |
| 데이터 Export (CSV) | O | O | O | O |
| SSE 실시간 이벤트 구독 | O | O | O | O |
| 테스트 케이스 생성/편집 | O | O | O | |
| 테스트 케이스 복제 / 정렬 / 잠금 | O | O | O | |
| 테스트 런 생성 / 복제 | O | O | O | |
| 테스트 실행 상태 변경 (PASS/FAIL 등) | O | O | O | |
| 실패 상세 기록 | O | O | O | |
| 그룹 생성/수정 | O | O | O | |
| 태그 관리 | O | O | O | |
| 테스트 케이스 Import | O | O | | |
| Test Suite 생성/수정 | O | O | | |
| 테스트 케이스 삭제 | O | | | |
| 테스트 런 삭제 | O | | | |
| 그룹 삭제 | O | | | |
| 벌크 삭제 | O | | | |
| 프로젝트 설정 수정 | O | | | |
| 멤버 관리 (추가/역할변경/제거) | O | | | |

> Global ADMIN은 모든 프로젝트에 PROJECT_ADMIN 권한으로 접근합니다.

---

## Admin 패널

URL: `/admin` (Global ADMIN 전용)

| 탭 | 경로 | 기능 |
|----|------|------|
| Users | `/admin/users` | 사용자 목록, 역할 변경, 밴/언밴 |
| Projects | `/admin/projects` | 전체 프로젝트 관리 |
| OIDC Providers | `/admin/oidc-providers` | IdP 등록/수정/삭제/토글 |

---

## 아키텍처

```
Browser
  │
  ├── SvelteKit (SSR + API)
  │     ├── better-auth (인증/세션)
  │     ├── Drizzle ORM (쿼리)
  │     ├── SSE (실시간)
  │     └── Paraglide (i18n)
  │
  ├── PostgreSQL (데이터)
  ├── Redis (Lock, Pub/Sub)
  └── Local Storage (파일 첨부)
```

### Docker Compose 서비스

| 서비스 | 이미지 | 포트 | 용도 |
|--------|--------|------|------|
| db | postgres | 5432 | 메인 데이터베이스 |
| redis | redis:7-alpine | 6379 | Soft Lock, SSE Pub/Sub |

---

## 동시성 관리

### Soft Lock (Redis)

- 테스트 케이스 편집 시 Redis 기반 잠금
- TTL: 10분, 자동 만료
- UI에서 편집 중인 사용자 표시

### Optimistic Lock

- 저장 시 `revision` 필드 체크
- 충돌 감지 시 사용자에게 알림

---

## 디렉토리 구조

```
src/
├── routes/
│   ├── auth/              # 인증 (로그인, 회원가입, OIDC, 계정 연동)
│   ├── admin/             # Global Admin (사용자, 프로젝트, OIDC 관리)
│   ├── projects/          # 프로젝트 (대시보드, TC, 런, 설정, 리포트)
│   ├── account/           # 사용자 프로필/계정 설정
│   └── api/               # REST API 엔드포인트
├── lib/
│   ├── components/        # Svelte 컴포넌트
│   │   └── ui/            # shadcn-svelte 컴포넌트
│   ├── schemas/           # zod 검증 스키마
│   ├── server/            # 서버 전용 (auth, db, redis, lock, crypto, storage)
│   ├── paraglide/         # i18n 생성 파일
│   └── auth-client.ts     # better-auth 클라이언트
├── app.d.ts
└── hooks.server.ts        # SvelteKit hooks (auth, i18n, security headers, rate limiting)
```

---

## 구현 현황

- [x] **Phase 1** — 인증, 프로젝트 CRUD, 멤버 관리, 테스트 케이스/런/실행, 실패 상세, 파일 첨부, i18n
- [x] **Phase 2** — Redis 통합, SSE 실시간 동기화, 대시보드/리포트, Admin 패널
- [x] **Phase 3** — 동적 OIDC/OAuth 관리, 전문 검색, 가상 스크롤링, Import/Export
- [ ] **Phase 4** — CI 연동 (`automation_key`, 자동화 결과 수집 API, CI webhook)

자세한 구현 계획은 [PLAN.md](./PLAN.md), 개선 작업 목록은 [TODO.md](./TODO.md) 참조.
