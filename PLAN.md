# QA Management System — Detailed Implementation Plan

> Based on [INITIAL_PLAN.md](./INITIAL_PLAN.md)
> Phase 1 (MVP) 중심의 세부 구현 계획

---

## Phase 1: MVP

Phase 1은 7개의 Milestone으로 구성된다.
각 Milestone은 독립적으로 동작 가능한 단위를 목표로 한다.

---

### Milestone 1: Foundation (인증 · DB · 레이아웃)

Auth 스키마 확정, 전체 도메인 테이블 생성, 공통 레이아웃 구축.

#### 1.1 Auth 스키마 생성

- [ ] `pnpm auth:schema` 실행 → `src/lib/server/db/auth.schema.ts` 생성
- [ ] `pnpm db:push`로 better-auth 테이블 반영 확인
- [ ] 기존 demo용 `task` 테이블 제거 (`schema.ts`에서 삭제)

#### 1.2 도메인 스키마 정의 (Drizzle)

모든 테이블을 `src/lib/server/db/schema.ts`에 정의한다.

- [ ] Enum 타입 정의
  - `project_role`: PROJECT_ADMIN, QA, DEV, VIEWER
  - `global_role`: ADMIN, USER
  - `priority`: LOW, MEDIUM, HIGH, CRITICAL
  - `environment`: DEV, QA, STAGE, PROD
  - `run_status`: CREATED, IN_PROGRESS, COMPLETED
  - `execution_status`: PENDING, PASS, FAIL, BLOCKED, SKIPPED
  - `reference_type`: TESTCASE, EXECUTION, FAILURE
- [ ] `project` 테이블
- [ ] `project_member` 테이블
- [ ] `test_case` 테이블
- [ ] `test_case_version` 테이블 (steps JSONB)
- [ ] `test_run` 테이블
- [ ] `test_execution` 테이블
- [ ] `test_failure_detail` 테이블
- [ ] `attachment` 테이블
- [ ] 인덱스 생성
  - `test_case(project_id)`
  - `test_case_version(test_case_id, version_no DESC)`
  - `test_execution(test_run_id, status)`
  - `attachment(reference_type, reference_id)`
- [ ] `pnpm db:generate` → migration 파일 생성
- [ ] `pnpm db:push` → DB 반영 확인

#### 1.3 Global Role 확장

- [ ] better-auth의 `user` 테이블에 `role` 컬럼 추가 방안 결정
  - Option A: better-auth plugin (`admin` plugin 등) 활용
  - Option B: 별도 `user_profile` 테이블로 확장
- [ ] 선택한 방안 구현

#### 1.4 공통 레이아웃 · 네비게이션

- [ ] 앱 셸 레이아웃 구성 (`src/routes/+layout.svelte`)
  - 사이드바 (프로젝트 목록, 네비게이션)
  - 헤더 (사용자 정보, 로그아웃, 언어 전환)
  - 메인 콘텐츠 영역
- [ ] `src/routes/+layout.server.ts` — 세션/유저 정보 로드
- [ ] 인증되지 않은 사용자 리다이렉트 처리
- [ ] 공통 UI 컴포넌트 생성 (`src/lib/components/`)
  - Button, Input, Select, Modal, Table, Pagination
  - Toast / Alert 알림
  - Form 관련 (Label, FormField, ErrorMessage)

#### 1.5 인증 페이지

- [ ] `src/routes/auth/login/+page.svelte` — 로그인 폼
- [ ] `src/routes/auth/register/+page.svelte` — 회원가입 폼
- [ ] better-auth 클라이언트 설정 (`src/lib/auth-client.ts`)
- [ ] 로그인/로그아웃 동작 확인
- [ ] OIDC provider 추가 (better-auth plugin 설정)

---

### Milestone 2: Project Management (프로젝트 CRUD · 멤버 관리)

#### 2.1 프로젝트 API

- [ ] `src/routes/api/projects/+server.ts`
  - GET — 프로젝트 목록 (페이지네이션, 필터)
  - POST — 프로젝트 생성 (ADMIN 또는 authenticated user)
- [ ] `src/routes/api/projects/[projectId]/+server.ts`
  - GET — 프로젝트 상세
  - PATCH — 프로젝트 수정 (PROJECT_ADMIN)
  - DELETE — 프로젝트 비활성화 (PROJECT_ADMIN)
- [ ] 입력값 검증 (zod 또는 valibot 도입 검토)
- [ ] 권한 검사 미들웨어 / 유틸리티 함수

#### 2.2 프로젝트 UI

- [ ] `src/routes/projects/+page.svelte` — 프로젝트 목록
  - 카드 또는 테이블 형태
  - 검색, 필터 (active/inactive)
  - 생성 버튼
- [ ] `src/routes/projects/new/+page.svelte` — 프로젝트 생성 폼
- [ ] `src/routes/projects/[projectId]/+layout.svelte` — 프로젝트 상세 레이아웃
  - 프로젝트 네비게이션 (TestCase, TestRun, Settings)
- [ ] `src/routes/projects/[projectId]/+page.svelte` — 프로젝트 대시보드 (간단한 요약)
- [ ] `src/routes/projects/[projectId]/settings/+page.svelte` — 프로젝트 설정

#### 2.3 멤버 관리

- [ ] `src/routes/api/projects/[projectId]/members/+server.ts`
  - GET — 멤버 목록
  - POST — 멤버 추가 (PROJECT_ADMIN)
- [ ] `src/routes/api/projects/[projectId]/members/[memberId]/+server.ts`
  - PATCH — 역할 변경
  - DELETE — 멤버 제거
- [ ] `src/routes/projects/[projectId]/settings/members/+page.svelte` — 멤버 관리 UI
  - 멤버 목록 테이블
  - 역할 변경 드롭다운
  - 멤버 초대/제거

---

### Milestone 3: Test Case Management (테스트 케이스 · 버전 관리)

#### 3.1 Test Case API

- [ ] `src/routes/api/projects/[projectId]/test-cases/+server.ts`
  - GET — 테스트 케이스 목록 (페이지네이션, 검색, 필터)
  - POST — 테스트 케이스 생성 (key 자동 생성: TC-0001)
- [ ] `src/routes/api/projects/[projectId]/test-cases/[testCaseId]/+server.ts`
  - GET — 테스트 케이스 상세 (latest version 포함)
  - DELETE — 테스트 케이스 삭제 (soft delete 검토)
- [ ] `src/routes/api/projects/[projectId]/test-cases/[testCaseId]/versions/+server.ts`
  - GET — 버전 히스토리
  - POST — 새 버전 생성 (optimistic lock: revision 체크)
- [ ] key 자동 채번 로직 (프로젝트별 시퀀스)

#### 3.2 Test Case UI

- [ ] `src/routes/projects/[projectId]/test-cases/+page.svelte` — 목록
  - 테이블 (key, title, priority, latest status, updated_by, updated_at)
  - 검색 (title, key)
  - 필터 (priority)
  - 페이지네이션
- [ ] `src/routes/projects/[projectId]/test-cases/new/+page.svelte` — 생성 폼
  - title, precondition, steps (동적 추가/삭제/정렬), expected_result, priority
- [ ] `src/routes/projects/[projectId]/test-cases/[testCaseId]/+page.svelte` — 상세
  - 현재 버전 내용 표시
  - 편집 모드 전환
  - 버전 히스토리 사이드 패널 또는 탭
- [ ] Steps 편집 컴포넌트
  - 순서 드래그 또는 위/아래 이동
  - 행 추가/삭제
  - 각 행: action, expected 입력

#### 3.3 Optimistic Lock 처리

- [ ] 저장 시 revision 체크 → 충돌 감지 UI
- [ ] 충돌 시 사용자에게 알림 (현재 값 vs 서버 값)

---

### Milestone 4: Test Run & Execution (테스트 실행)

#### 4.1 Test Run API

- [ ] `src/routes/api/projects/[projectId]/test-runs/+server.ts`
  - GET — 테스트 런 목록
  - POST — 테스트 런 생성 (테스트 케이스 선택 → execution 일괄 생성)
- [ ] `src/routes/api/projects/[projectId]/test-runs/[runId]/+server.ts`
  - GET — 테스트 런 상세 (execution 목록 포함)
  - PATCH — 상태 변경 (IN_PROGRESS, COMPLETED)
- [ ] `src/routes/api/projects/[projectId]/test-runs/[runId]/executions/[executionId]/+server.ts`
  - PATCH — 실행 결과 기록 (status, comment, executed_by)

#### 4.2 Test Run UI

- [ ] `src/routes/projects/[projectId]/test-runs/+page.svelte` — 런 목록
  - 테이블 (name, environment, status, progress, created_by, dates)
- [ ] `src/routes/projects/[projectId]/test-runs/new/+page.svelte` — 런 생성
  - 이름, 환경 설정
  - 테스트 케이스 선택 (체크박스 + 필터)
- [ ] `src/routes/projects/[projectId]/test-runs/[runId]/+page.svelte` — 실행 화면
  - Execution 목록 테이블
  - 상태별 색상 구분
  - 인라인 상태 변경 (PASS/FAIL/BLOCKED/SKIPPED)
  - Bulk Pass 기능
  - 진행률 표시 (progress bar)
  - FAIL 클릭 시 failure detail 모달

---

### Milestone 5: Failure Detail (실패 상세)

#### 5.1 Failure Detail API

- [ ] `src/routes/api/projects/[projectId]/test-runs/[runId]/executions/[executionId]/failures/+server.ts`
  - GET — 실패 상세 목록
  - POST — 실패 상세 기록
- [ ] `src/routes/api/projects/[projectId]/test-runs/[runId]/executions/[executionId]/failures/[failureId]/+server.ts`
  - PATCH — 수정
  - DELETE — 삭제

#### 5.2 Failure Detail UI

- [ ] FAIL 상태 전환 시 failure detail 입력 모달
  - failure_environment, test_method, error_message, stack_trace, comment
- [ ] 실패 상세 보기 (execution 상세 내 표시)

---

### Milestone 6: File Attachment (파일 첨부)

#### 6.1 MinIO 설정

- [ ] `compose.yaml`에 MinIO 서비스 추가
- [ ] `.env.example`에 MinIO 관련 환경변수 추가
  - `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`
- [ ] S3 클라이언트 유틸리티 (`src/lib/server/s3.ts`)
  - `@aws-sdk/client-s3` 또는 `minio` 패키지 설치
  - presigned URL 생성 함수
  - 파일 삭제 함수

#### 6.2 Attachment API

- [ ] `src/routes/api/attachments/presign/+server.ts`
  - POST — presigned upload URL 생성
- [ ] `src/routes/api/attachments/+server.ts`
  - POST — 업로드 완료 후 메타데이터 저장
- [ ] `src/routes/api/attachments/[attachmentId]/+server.ts`
  - GET — presigned download URL 생성
  - DELETE — 파일 삭제 (S3 + DB)

#### 6.3 Attachment UI

- [ ] 파일 업로드 공통 컴포넌트 (`src/lib/components/FileUpload.svelte`)
  - 드래그 앤 드롭
  - 업로드 진행률
  - 파일 목록 표시
- [ ] TestCase, Execution, FailureDetail 화면에 첨부 기능 통합

---

### Milestone 7: i18n · 마무리

#### 7.1 메시지 정의

- [ ] 모든 UI 텍스트를 `messages/ko.json`, `messages/en.json`에 정의
  - auth (로그인, 회원가입, 로그아웃)
  - project (프로젝트, 멤버, 설정)
  - test-case (테스트 케이스, 버전, 편집)
  - test-run (테스트 런, 실행, 상태)
  - failure (실패 상세)
  - common (버튼, 확인, 취소, 삭제, 페이지네이션)
  - validation (필수 입력, 형식 오류)

#### 7.2 정리 · 품질

- [ ] 모든 화면 i18n 적용 확인
- [ ] 에러 핸들링 일관성 점검
- [ ] 반응형 레이아웃 확인 (모바일/데스크톱)
- [ ] 주요 기능 테스트 작성

---

## Phase 2: Real-time & Dashboard

### Milestone 8: Redis 통합

- [ ] `compose.yaml`에 Redis 서비스 추가
- [ ] Redis 클라이언트 설정 (`src/lib/server/redis.ts`)
- [ ] Soft Lock 구현 (TestCase 편집 잠금)
- [ ] Lock 상태 UI 표시 (편집 중인 사용자 표시)

### Milestone 9: WebSocket

- [ ] WebSocket 서버 구현 (`/ws/run/{runId}`)
- [ ] Redis Pub/Sub 연동
- [ ] 클라이언트 WebSocket 연결 관리
- [ ] TestRun 실행 화면 실시간 동기화

### Milestone 10: Dashboard

- [ ] 프로젝트 대시보드
  - 전체 통과율 / 실패율
  - 런별 실행 현황 차트
  - 최근 활동 로그

---

## Phase 3: Advanced Features

### Milestone 11: 검색 · 성능

- [ ] 테스트 케이스 전문 검색
- [ ] 실행 화면 가상 스크롤링
- [ ] 쿼리 최적화 · 인덱스 튜닝
- [ ] 테스트 케이스 일괄 가져오기/내보내기 (CSV/JSON)

---

## Phase 4: Automation

### Milestone 12: CI 연동

- [ ] TestCase에 `automation_key` 필드 추가
- [ ] 자동화 결과 수집 API (`/api/automation/results`)
- [ ] CI webhook 연동 (GitHub Actions, GitLab CI)

---

## Directory Structure (Target)

```
src/
├── routes/
│   ├── +layout.svelte              # 앱 셸
│   ├── +layout.server.ts           # 세션 로드
│   ├── +page.svelte                # 홈 (→ 프로젝트 목록 리다이렉트)
│   ├── auth/
│   │   ├── login/+page.svelte
│   │   └── register/+page.svelte
│   ├── projects/
│   │   ├── +page.svelte            # 프로젝트 목록
│   │   ├── new/+page.svelte        # 프로젝트 생성
│   │   └── [projectId]/
│   │       ├── +layout.svelte      # 프로젝트 레이아웃
│   │       ├── +page.svelte        # 프로젝트 대시보드
│   │       ├── settings/
│   │       │   ├── +page.svelte    # 프로젝트 설정
│   │       │   └── members/+page.svelte
│   │       ├── test-cases/
│   │       │   ├── +page.svelte    # 목록
│   │       │   ├── new/+page.svelte
│   │       │   └── [testCaseId]/+page.svelte
│   │       └── test-runs/
│   │           ├── +page.svelte    # 목록
│   │           ├── new/+page.svelte
│   │           └── [runId]/+page.svelte
│   └── api/
│       ├── projects/...
│       ├── attachments/...
│       └── automation/...          # Phase 4
├── lib/
│   ├── components/                 # 공통 UI 컴포넌트
│   ├── server/
│   │   ├── auth.ts                 # better-auth 설정
│   │   ├── s3.ts                   # MinIO 클라이언트
│   │   ├── redis.ts                # Redis 클라이언트 (Phase 2)
│   │   └── db/
│   │       ├── index.ts            # Drizzle 인스턴스
│   │       ├── schema.ts           # 도메인 스키마
│   │       └── auth.schema.ts      # better-auth 스키마 (generated)
│   ├── auth-client.ts              # better-auth 클라이언트
│   ├── paraglide/                  # Paraglide 생성 파일
│   └── index.ts
└── app.d.ts
```

---

## Conventions

### API 패턴

- SvelteKit의 `+server.ts` (API route) 사용
- RESTful URL 구조
- 응답: `{ data, error?, meta? }` 형태 통일
- 에러: SvelteKit `error()` 함수 사용
- 입력 검증: 서버 사이드에서 반드시 수행

### DB 패턴

- Drizzle ORM query builder 사용
- 마이그레이션: `drizzle-kit generate` → `drizzle-kit migrate`
- Soft delete: `active` 플래그 (물리 삭제 없음)

### 컴포넌트 패턴

- Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`)
- TailwindCSS 유틸리티 클래스 사용
- 공통 컴포넌트는 `src/lib/components/`에 배치

### 테스트 패턴

- 서버 로직: `*.spec.ts` (Vitest, node)
- 컴포넌트: `*.svelte.spec.ts` (Vitest + Playwright)
- 각 테스트에 최소 1개 assertion 필수
