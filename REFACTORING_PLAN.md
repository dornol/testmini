# TestMini 리팩토링 계획

> 작성일: 2026-03-07
> 대상: 전체 코드베이스
> 최종 업데이트: 2026-03-07

## 진행 현황

| Phase | 항목 | 상태 |
|-------|------|------|
| **Phase 1** | 쿼리 헬퍼 (`queries.ts`) | ✅ 완료 — 4개 파일 적용 |
| **Phase 1** | CSV 유틸리티 (`csv-utils.ts`) | ✅ 완료 — 3개 파일 적용 |
| **Phase 1** | 에러 응답 유틸리티 | ⏳ 미진행 (현재 SvelteKit `error()` 사용이 주류, json 형태는 소수) |
| **Phase 1** | @ts-ignore 해결 | ⏳ 미진행 (zod 3.24 + superforms 호환 이슈, 의존성 업데이트 필요) |
| **Phase 2** | test-cases/+page.svelte 분할 | ✅ 완료 — 1,997줄 → 1,499줄 |
| **Phase 3** | 클라이언트 Fetch 래퍼 (`api-client.ts`) | ✅ 완료 — 21개 Svelte 컴포넌트 적용 (57→13 raw fetch, 나머지는 FormData/lock 등 의도적 유지) |
| **Phase 3** | 라우트 미들웨어 (`api-handler.ts`) | ✅ 완료 — 38개 API 라우트 적용 (admin 2개 + projects list 1개 제외) |
| **Phase 4** | JWKS 캐싱 | ✅ 이미 구현됨 (1시간 TTL) |
| **Phase 4** | DB 스키마 개선 | ⏳ 미진행 (마이그레이션 필요) |
| **Phase 4** | 테스트 개선 | ⏳ 미진행 |

### 생성된 유틸리티 파일
- `src/lib/server/queries.ts` — 공통 쿼리 헬퍼 (loadTestCaseMetadata 등)
- `src/lib/server/csv-utils.ts` — CSV 포맷팅/응답 유틸리티
- `src/lib/api-client.ts` — 클라이언트 fetch 래퍼 (apiFetch, apiPost, apiPatch 등)
- `src/lib/server/api-handler.ts` — API 라우트 미들웨어 (withProjectRole, withProjectAccess, withAuth)

### 분할된 컴포넌트
- `TestCaseFilterBar.svelte` — 필터 UI + 검색 + 그룹 생성
- `TestCaseBulkActionBar.svelte` — 벌크 작업 바 + 로직

---

## 목차

1. [현황 요약](#현황-요약)
2. [Phase 1: 공통 유틸리티 추출 (고효과/저비용)](#phase-1-공통-유틸리티-추출)
3. [Phase 2: 대형 컴포넌트 분할](#phase-2-대형-컴포넌트-분할)
4. [Phase 3: API 계층 정리](#phase-3-api-계층-정리)
5. [Phase 4: 성능 및 품질 개선](#phase-4-성능-및-품질-개선)
6. [부록: 파일별 현황](#부록-파일별-현황)

---

## 현황 요약

| 항목 | 수치 |
|------|------|
| 총 TS/Svelte 파일 | 450+ |
| API 라우트 | 49개 |
| 페이지 라우트 | 75+ |
| 테스트 파일 | 58개 |
| 300줄 초과 파일 | 9개 |
| 최대 파일 크기 | 1,997줄 (`test-cases/+page.svelte`) |
| 코드 중복 이슈 | 20+ |
| 누락된 추상화 | 5개 |

### 잘 되어 있는 부분
- shadcn-svelte 기반 UI 컴포넌트 구조
- `requireAuth()` / `requireProjectRole()` 인증 가드 일관 적용
- 트랜잭션 사용 (멀티스텝 작업)
- Fire-and-forget 감사 로깅
- 테스트 헬퍼 분리 (`fixtures.ts`, `mock-db.ts`, `mock-event.ts`)

### 주요 문제점
- `test-cases/+page.svelte` 2,000줄 초과 — 분할 필수
- 태그/담당자/멤버 조회 쿼리 5곳 이상 중복
- CSV 파싱/포맷 로직 3곳 산재
- 에러 응답 형태 불일치 (`{ error }` vs `{ message }` vs `error()` throw)
- 클라이언트 fetch 호출에 공통 래퍼 없음
- JWKS 캐싱 미구현

---

## Phase 1: 공통 유틸리티 추출

**목표**: 중복 코드 제거, 재사용 가능한 헬퍼 생성

### 1.1 쿼리 헬퍼 추출

**신규 파일**: `src/lib/server/queries.ts`

현재 5개 이상 API 라우트에서 반복되는 패턴:
```typescript
// 이 패턴이 5곳 이상에서 중복
const [assignedTags, projectTags, assignees, members] = await Promise.all([
  db.select(...).from(testCaseTag).innerJoin(tag, ...),
  db.select(...).from(tag).where(...),
  db.select(...).from(testCaseAssignee).innerJoin(user, ...),
  db.select(...).from(projectMember).innerJoin(user, ...)
]);
```

**추출 대상 함수:**
| 함수 | 설명 | 영향 파일 |
|------|------|-----------|
| `loadTestCaseMetadata(testCaseId, projectId)` | 태그+담당자+멤버 일괄 조회 | 5+ |
| `loadProjectTags(projectId)` | 프로젝트 태그 목록 | 3+ |
| `loadProjectMembers(projectId)` | 프로젝트 멤버 목록 | 4+ |
| `batchLoadTagsByTestCase(testCaseIds)` | 테스트케이스별 태그 Map | 2+ |
| `batchLoadAssigneesByTestCase(testCaseIds)` | 테스트케이스별 담당자 Map | 2+ |

**예상 효과**: ~50줄 중복 제거

### 1.2 CSV 유틸리티 추출

**신규 파일**: `src/lib/server/csv-utils.ts`

현재 3개 파일에 산재:
- `src/routes/api/.../test-cases/export/+server.ts`
- `src/routes/api/.../test-runs/[runId]/export/+server.ts`
- `src/routes/api/.../reports/export/+server.ts`
- `src/routes/api/.../test-cases/import/+server.ts` (파서)

**추출 대상 함수:**
| 함수 | 설명 |
|------|------|
| `parseCSV(text): string[][]` | CSV 텍스트 파싱 (import에서 추출) |
| `formatCsvRow(cells: string[]): string` | 셀 이스케이프 + 행 포맷 |
| `buildCsvResponse(headers, rows, filename)` | BOM + Content-Disposition 포함 Response 생성 |

**예상 효과**: ~200줄 중복 제거

### 1.3 에러 응답 유틸리티

**신규 파일**: `src/lib/server/errors.ts`

현재 에러 응답이 3가지 형태로 혼재:
```typescript
// 형태 1: 대부분의 라우트
return json({ error: '...' }, { status: 400 });
// 형태 2: 일부 폼
return json({ message: '...' }, { status: 400 });
// 형태 3: SvelteKit throw
error(400, '...');
```

**추출 대상:**
```typescript
export function badRequest(msg: string) { return json({ error: msg }, { status: 400 }); }
export function notFound(msg: string) { return json({ error: msg }, { status: 404 }); }
export function conflict(msg: string) { return json({ error: msg }, { status: 409 }); }
export function forbidden(msg: string) { return json({ error: msg }, { status: 403 }); }
```

### 1.4 @ts-ignore 해결

현재 3곳에 `@ts-ignore` 존재:
```typescript
// @ts-ignore zod 3.24 type mismatch with superforms adapter
```
- zod/superforms 버전 호환성 문제 → 의존성 업데이트 또는 타입 shim 생성

---

## Phase 2: 대형 컴포넌트 분할

### 2.1 test-cases/+page.svelte (1,997줄) — 최우선

현재 이 파일이 담당하는 역할:
- 테스트 케이스 목록 표시 (가상 스크롤)
- 필터링 (검색, 우선순위, 태그, 그룹, 담당자, 실행상태)
- 그룹 관리 (CRUD, 드래그앤드롭)
- 벌크 작업 (태그 추가/제거, 우선순위 변경, 그룹 이동, 삭제, 복제)
- 인라인 편집
- 여러 모달/시트 관리
- 50+ 상태 변수

**분할 계획:**

| 신규 컴포넌트 | 역할 | 예상 라인 |
|--------------|------|----------|
| `TestCaseFilter.svelte` | 필터 UI + 필터 상태 관리 | ~150 |
| `TestCaseBulkActions.svelte` | 체크박스 선택 + 벌크 작업 메뉴 | ~200 |
| `TestCaseGroupManager.svelte` | 그룹 CRUD + DnD 정렬 | ~200 |
| `TestCaseInlineEditor.svelte` | 인라인 제목 편집 | ~100 |
| `TestCaseListItem.svelte` | 개별 행 렌더링 | ~100 |
| `+page.svelte` (축소) | 전체 레이아웃 + 상태 조율 | ~500 |

**상태 관리 개선:**
```typescript
// Before: 50+ 개별 $state 변수
let search = $state('');
let priorityFilter = $state('all');
let selectedTcIds = $state<Set<number>>(new Set());
// ... 47개 더

// After: 관련 상태 그룹화
let filters = $state({ search: '', priority: 'all', tagIds: [], ... });
let selection = $state({ ids: new Set<number>(), allSelected: false });
let bulkOp = $state({ open: false, type: null, processing: false });
```

### 2.2 CommentSection.svelte (473줄)

**분할 계획:**
| 컴포넌트 | 역할 |
|---------|------|
| `CommentList.svelte` | 댓글 트리 렌더링 |
| `CommentForm.svelte` | 새 댓글 / 답글 입력 폼 |
| `CommentItem.svelte` | 개별 댓글 (수정/삭제 포함) |

### 2.3 ImportDialog.svelte (428줄)

**분할 계획:**
| 컴포넌트 | 역할 |
|---------|------|
| `ImportUpload.svelte` | 파일 업로드 + 포맷 선택 |
| `ImportPreview.svelte` | 파싱 결과 미리보기 테이블 |
| `ImportFieldMapping.svelte` | 필드 매핑 설정 |

### 2.4 NotificationBell.svelte (339줄)

**분할 계획:**
| 컴포넌트 | 역할 |
|---------|------|
| `NotificationList.svelte` | 알림 목록 + 무한 스크롤 |
| `NotificationItem.svelte` | 개별 알림 렌더링 |

### 2.5 test-cases/+page.server.ts (431줄)

현재 하나의 `load()` 함수에 복잡한 필터링 로직 집중:
- 8개 쿼리 파라미터 처리
- 실행 상태 필터를 위한 메모리 내 후처리

**개선 방향:**
- 쿼리 빌더 헬퍼 추출 → `src/lib/server/test-case-queries.ts`
- 실행 상태 필터를 DB 쿼리로 이동 (`WHERE EXISTS` + `inArray`)

---

## Phase 3: API 계층 정리

### 3.1 라우트 미들웨어 패턴 도입

현재 모든 API 라우트에서 반복:
```typescript
export async function GET({ locals, params }) {
  const authUser = requireAuth(locals);
  const projectId = Number(params.projectId);
  await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);
  // ... 실제 로직
}
```

**개선안** — `src/lib/server/api-handler.ts`:
```typescript
export function withProjectAuth(roles, handler) {
  return async (event) => {
    const user = requireAuth(event.locals);
    const projectId = Number(event.params.projectId);
    await requireProjectRole(user, projectId, roles);
    return handler({ ...event, user, projectId });
  };
}

// 사용 예:
export const GET = withProjectAuth(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ user, projectId, url }) => {
  // 바로 비즈니스 로직 시작
});
```

**영향**: 49개 API 라우트 중 ~35개에서 보일러플레이트 3~5줄 감소

### 3.2 입력 검증 강화

검증이 누락된 라우트:
| 라우트 | 누락 항목 |
|--------|----------|
| `/automation/results/+server.ts` | 요청 body 크기 제한 없음 |
| `/test-cases/import/+server.ts` | 임포트 행 수 제한 없음 |
| `/automation/webhook/+server.ts` | webhook body 크기 검증 없음 |

### 3.3 클라이언트 Fetch 래퍼

**신규 파일**: `src/lib/api-client.ts`

현재 30+ 컴포넌트에서 raw `fetch()` 사용:
```typescript
// 반복되는 패턴
try {
  const res = await fetch(`/api/projects/${projectId}/...`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) { /* 에러 처리 */ }
  const result = await res.json();
} catch { /* 네트워크 에러 */ }
```

**추출안:**
```typescript
export async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? 'Unknown error');
  }
  return res.json();
}
```

---

## Phase 4: 성능 및 품질 개선

### 4.1 N+1 쿼리 해결

| 위치 | 문제 | 해결 |
|------|------|------|
| `bulk/+server.ts` setPriority | 루프 내 `findTestCaseWithLatestVersion()` 개별 호출 | 배치 조회로 변경 |
| `test-cases/+page.server.ts` | 선택된 런의 ALL 실행 기록 로드 후 메모리 필터 | DB에서 `WHERE EXISTS` 필터 |
| `CommentSection.svelte` | 댓글 트리를 위한 클라이언트 필터링 | 서버에서 트리 구조로 반환 |

### 4.2 JWKS 캐싱 구현

**파일**: `src/lib/server/oidc-jwt.ts` (347줄)

현재 OIDC 토큰 검증 시 매번 JWKS 엔드포인트 호출 가능성.
TTL 기반 캐시 추가 필요:
```typescript
const jwksCache = new Map<string, { keys: JsonWebKey[], expiresAt: number }>();
const JWKS_TTL_MS = 60 * 60 * 1000; // 1시간
```

### 4.3 DB 스키마 개선

**파일**: `src/lib/server/db/schema.ts` (819줄)

| 항목 | 설명 |
|------|------|
| `updatedAt` 누락 | `testCase`, `testRun` 등 자주 수정되는 테이블에 자동 타임스탬프 추가 |
| `search_vector` 미반영 | 마이그레이션에만 존재, 스키마 파일에 문서화 필요 |
| Attachment FK | `referenceId` string → 엔티티별 명시적 FK 고려 |
| 스키마 파일 분할 | 819줄 → 도메인별 분할 (`auth.schema.ts`, `test-case.schema.ts`, ...) |

### 4.4 테스트 개선

| 항목 | 설명 |
|------|------|
| E2E 테스트 보강 | 핵심 워크플로우 (테스트케이스 CRUD, 실행 관리) E2E 추가 |
| Mock 정교화 | `mock-db.ts`가 실제 Drizzle API 커버리지 부족 |
| 통합 테스트 | 현재 대부분 단위 테스트 → DB 연동 통합 테스트 추가 고려 |

### 4.5 Silent Error 처리

```typescript
// NotificationBell.svelte — 현재
} catch {
  // network error — silently ignore
}

// 개선: 최소한 콘솔 로그 또는 토스트
} catch (e) {
  console.warn('Failed to fetch notifications:', e);
}
```

---

## 부록: 파일별 현황

### 300줄 초과 파일 (리팩토링 대상)

| 파일 | 라인 | 우선순위 | 조치 |
|------|------|----------|------|
| `test-cases/+page.svelte` | 1,997 | **P0** | 6개 컴포넌트로 분할 |
| `db/schema.ts` | 819 | P2 | 도메인별 분할 + 문서화 |
| `[projectId]/+page.svelte` (대시보드) | 771 | P2 | 위젯 컴포넌트 분할 |
| `reports/+page.svelte` | 649 | P2 | 차트/필터 분할 |
| `[testCaseId]/+page.svelte` | 595 | P1 | 락 관리 + 폼 분리 |
| `CommentSection.svelte` | 473 | P1 | 3개 컴포넌트 분할 |
| `test-cases/+page.server.ts` | 431 | P1 | 쿼리 빌더 추출 |
| `ImportDialog.svelte` | 428 | P2 | 3개 컴포넌트 분할 |
| `oidc-jwt.ts` | 347 | P2 | JWKS 캐싱 추가 |
| `NotificationBell.svelte` | 339 | P2 | 2개 컴포넌트 분할 |
| `AttachmentManager.svelte` | 332 | P2 | 업로드/목록 분리 |

### 우선순위 정의
- **P0**: 유지보수 불가 수준, 즉시 착수
- **P1**: 개발 속도에 영향, 가급적 빨리
- **P2**: 개선 가능하나 현재 동작에 지장 없음

---

## 실행 순서 요약

```
Phase 1 (공통 유틸리티)     ← 먼저 추출해야 Phase 2에서 활용 가능
  ├─ 1.1 쿼리 헬퍼
  ├─ 1.2 CSV 유틸리티
  ├─ 1.3 에러 응답 유틸리티
  └─ 1.4 @ts-ignore 해결

Phase 2 (컴포넌트 분할)     ← 가장 큰 효과
  ├─ 2.1 test-cases/+page.svelte (P0)
  ├─ 2.2 CommentSection (P1)
  ├─ 2.3 ImportDialog (P2)
  └─ 2.4~2.5 기타

Phase 3 (API 계층)
  ├─ 3.1 라우트 미들웨어
  ├─ 3.2 입력 검증 강화
  └─ 3.3 Fetch 래퍼

Phase 4 (성능/품질)
  ├─ 4.1 N+1 쿼리
  ├─ 4.2 JWKS 캐싱
  ├─ 4.3 DB 스키마
  ├─ 4.4 테스트
  └─ 4.5 에러 처리
```
