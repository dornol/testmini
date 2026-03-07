# TestMini 리팩토링 계획

> 작성일: 2026-03-07
> 대상: 전체 코드베이스
> 최종 업데이트: 2026-03-07

## 진행 현황

| Phase | 항목 | 상태 |
|-------|------|------|
| **Phase 1** | 쿼리 헬퍼 (`queries.ts`) | ✅ 완료 |
| **Phase 1** | CSV 유틸리티 (`csv-utils.ts`) | ✅ 완료 |
| **Phase 1** | 에러 응답 유틸리티 | ⏳ 미진행 (현재 SvelteKit `error()` 사용이 주류, json 형태는 소수 — 우선순위 낮음) |
| **Phase 1** | @ts-ignore 해결 | ✅ 완료 (@ts-expect-error 전환, 4개 불필요 제거) |
| **Phase 2** | test-cases/+page.svelte 분할 | ✅ 완료 |
| **Phase 2** | CommentSection 분할 | ✅ 완료 |
| **Phase 2** | ImportDialog, NotificationBell 등 기타 분할 | ⏳ 미진행 |
| **Phase 3** | 클라이언트 Fetch 래퍼 (`api-client.ts`) | ✅ 완료 |
| **Phase 3** | 라우트 미들웨어 (`api-handler.ts`) | ✅ 완료 |
| **Phase 3** | 입력 검증 강화 | ✅ 완료 |
| **Phase 4** | JWKS 캐싱 | ✅ 이미 구현됨 (1시간 TTL) |
| **Phase 4** | N+1 쿼리 해결 | ✅ 완료 |
| **Phase 4** | DB 스키마 개선 | ✅ 부분 완료 (updatedAt 추가, search_vector 문서화) |
| **Phase 4** | 테스트 개선 | ⏳ 미진행 |
| **Phase 4** | Silent Error 처리 | ✅ 완료 |

### 생성된 유틸리티 파일
| 파일 | 설명 | 적용 현황 |
|------|------|-----------|
| `src/lib/server/queries.ts` | 공통 쿼리 헬퍼 | `loadTestCaseMetadata` → 2개 파일, `loadProjectTags` → 2개 파일 |
| `src/lib/server/csv-utils.ts` | CSV 포맷팅/응답 유틸리티 | `formatCsvRow` → 2개 파일, `csvResponse` → 1개 파일 |
| `src/lib/api-client.ts` | 클라이언트 fetch 래퍼 | 21개 Svelte 컴포넌트 (57→13 raw fetch, 나머지는 FormData/lock 등 의도적 유지) |
| `src/lib/server/api-handler.ts` | API 라우트 미들웨어 | 38개 API 라우트 (admin 2개 제외) |

### 분할된 컴포넌트
| 컴포넌트 | 원본 | 설명 |
|---------|------|------|
| `TestCaseFilterBar.svelte` | `test-cases/+page.svelte` | 필터 UI + 검색 + 그룹 생성 (~350줄) |
| `TestCaseBulkActionBar.svelte` | `test-cases/+page.svelte` | 벌크 작업 바 + 로직 (~220줄) |
| `CommentItem.svelte` | `CommentSection.svelte` | 개별 댓글 렌더링 (~130줄) |
| `CommentForm.svelte` | `CommentSection.svelte` | 댓글/답글 입력 폼 (~45줄) |

### 수치 요약
| 항목 | Before | After |
|------|--------|-------|
| `test-cases/+page.svelte` | 1,997줄 | 1,499줄 (-25%) |
| raw `fetch()` 호출 (Svelte) | 57개 | 13개 (-77%) |
| API 라우트 보일러플레이트 | 3~5줄/핸들러 × 40 | `withProjectRole`/`withProjectAccess` 1줄 |
| 전체 코드 변경 | — | 77 files, +1,828 -1,782 (net -1,145줄) |

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
| 최대 파일 크기 | ~~1,997줄~~ 1,499줄 (`test-cases/+page.svelte`) |
| 코드 중복 이슈 | ~~20+~~ ~10개 (쿼리/CSV/fetch/미들웨어 해결) |
| 누락된 추상화 | ~~5개~~ 1개 (에러 응답 유틸만 잔여) |

### 잘 되어 있는 부분
- shadcn-svelte 기반 UI 컴포넌트 구조
- `requireAuth()` / `requireProjectRole()` 인증 가드 일관 적용
- 트랜잭션 사용 (멀티스텝 작업)
- Fire-and-forget 감사 로깅
- 테스트 헬퍼 분리 (`fixtures.ts`, `mock-db.ts`, `mock-event.ts`)

### 주요 문제점
- ~~`test-cases/+page.svelte` 2,000줄 초과 — 분할 필수~~ → ✅ 1,499줄로 축소 (FilterBar, BulkActionBar 추출)
- ~~태그/담당자/멤버 조회 쿼리 5곳 이상 중복~~ → ✅ `queries.ts` 헬퍼로 통합
- ~~CSV 파싱/포맷 로직 3곳 산재~~ → ✅ `csv-utils.ts`로 통합
- 에러 응답 형태 불일치 (`{ error }` vs `{ message }` vs `error()` throw) — 우선순위 낮음
- ~~클라이언트 fetch 호출에 공통 래퍼 없음~~ → ✅ `api-client.ts` 적용 (57→13 raw fetch)
- ~~JWKS 캐싱 미구현~~ → ✅ 이미 구현되어 있었음 (1시간 TTL)

---

## Phase 1: 공통 유틸리티 추출

**목표**: 중복 코드 제거, 재사용 가능한 헬퍼 생성

### 1.1 쿼리 헬퍼 추출 ✅ 완료

**파일**: `src/lib/server/queries.ts`

**구현된 함수:**
| 함수 | 설명 | 적용 파일 |
|------|------|-----------|
| `loadTestCaseMetadata(testCaseId, projectId)` | 태그+담당자+멤버 일괄 조회 (Promise.all) | `test-cases/[testCaseId]/+page.server.ts`, `api/.../test-cases/[testCaseId]/+server.ts` |
| `loadProjectTags(projectId)` | 프로젝트 태그 목록 | `test-cases/+page.server.ts`, `test-runs/new/+page.server.ts` |
| `loadTestCaseTags(testCaseId)` | 개별 테스트케이스 태그 | `loadTestCaseMetadata` 내부 사용 |
| `loadTestCaseAssignees(testCaseId)` | 개별 테스트케이스 담당자 | `loadTestCaseMetadata` 내부 사용 |
| `loadProjectMembers(projectId)` | 프로젝트 멤버 목록 | `loadTestCaseMetadata` 내부 사용 |

> 참고: `batchLoadTagsByTestCase`, `batchLoadAssigneesByTestCase`는 배치 조회 패턴이 단일 엔티티 조회와 형태가 달라 미추출. 기존 인라인 배치 로드 코드 유지.

### 1.2 CSV 유틸리티 추출 ✅ 완료

**파일**: `src/lib/server/csv-utils.ts`

**구현된 함수:**
| 함수 | 설명 | 적용 파일 |
|------|------|-----------|
| `formatCsvRow(cells)` | 셀 이스케이프 + 행 포맷 | `reports/export/+server.ts`, `test-runs/[runId]/export/+server.ts` |
| `csvResponse(headers, rows, filename)` | BOM + Content-Disposition + Response 생성 | `test-cases/export/+server.ts` |

> 참고: `parseCSV`는 import 전용이고 사용처가 1곳이라 미추출.

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

### 1.4 @ts-ignore 해결 ✅ 완료

15개 `@ts-ignore` → 11개 `@ts-expect-error` 전환, 4개 완전 제거 (타입 에러 해소됨).

- `@ts-expect-error`는 실제 에러가 있을 때만 무시하며, 에러 해소 시 "Unused directive" 경고 발생
- zod 3.25 + superforms 2.30: `superValidate(zod(schema))` 호출에서 `safeParse` 리턴 타입 불일치 잔존
- `$form.steps` 할당은 이미 타입 호환 해결됨 → directive 제거

---

## Phase 2: 대형 컴포넌트 분할

### 2.1 test-cases/+page.svelte (1,997줄 → 1,499줄) ✅ 완료

**추출된 컴포넌트:**

| 신규 컴포넌트 | 역할 | 라인 수 |
|--------------|------|---------|
| `TestCaseFilterBar.svelte` | 필터 UI + 검색 + 그룹 생성 다이얼로그 | ~350 |
| `TestCaseBulkActionBar.svelte` | 벌크 작업 바 + 작업 로직 | ~220 |

> 참고: 당초 6개 분할 계획이었으나, 그룹 관리/인라인 편집/리스트 아이템은 +page.svelte와 상태 결합도가 높아 2개 컴포넌트만 추출. 추가 분할 시 props drilling이 과도해지므로 현재 구조가 적정.

### 2.2 CommentSection.svelte (443줄 → 242줄) ✅ 완료

**추출된 컴포넌트:**
| 컴포넌트 | 역할 | 라인 수 |
|---------|------|---------|
| `CommentItem.svelte` | 개별 댓글 렌더링 (아바타+내용+편집+액션) | ~130 |
| `CommentForm.svelte` | 댓글/답글 입력 폼 (Textarea+버튼) | ~45 |

### 2.3 ImportDialog.svelte (429줄 → 275줄) ✅ 완료

**추출된 컴포넌트:**
| 컴포넌트 | 역할 | 라인 수 |
|---------|------|---------|
| `ImportResults.svelte` | 임포트 결과 화면 (요약+실패행+버튼) | ~130 |

### 2.4 NotificationBell.svelte (335줄) — 스킵

> 알림 아이템이 `{#each}` 루프 안에서 1회만 사용 (중복 없음), 스크립트와 템플릿 결합도가 높아 분할 효과 미미. 현재 크기 유지.

### 2.5 test-cases/+page.server.ts (429줄 → 335줄) ✅ 완료

**추출된 헬퍼:**
| 파일 | 함수 | 설명 |
|------|------|------|
| `src/lib/server/test-case-filters.ts` | `buildTestCaseConditions()` | 8개 필터 파라미터 → Drizzle SQL 조건 빌딩 (~120줄) |

> 참고: 실행 상태 필터(execStatus)는 executionMap 의존으로 후처리 유지.

---

## Phase 3: API 계층 정리

### 3.1 라우트 미들웨어 패턴 도입 ✅ 완료

**파일**: `src/lib/server/api-handler.ts`

**구현된 래퍼 함수:**
| 함수 | 설명 | 적용 수 |
|------|------|---------|
| `withProjectRole(roles, handler)` | 인증 + projectId 파싱 + 역할 검사 | ~30개 라우트 |
| `withProjectAccess(handler)` | 인증 + projectId 파싱 + 프로젝트 접근 검사 | ~4개 라우트 |
| `withAuth(handler)` | 인증만 (비프로젝트 라우트) | ~6개 라우트 |

**적용 현황**: 40개 API 라우트 중 38개 적용 (admin 2개는 별도 인증 패턴)

```typescript
// Before (3~5줄 보일러플레이트)
export async function GET({ locals, params }) {
  const authUser = requireAuth(locals);
  const projectId = Number(params.projectId);
  await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);
  // ... 비즈니스 로직
}

// After (1줄)
export const GET = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ user, projectId, url }) => {
  // 바로 비즈니스 로직
});
```

### 3.2 입력 검증 강화 ✅ 완료

| 라우트 | 추가된 검증 |
|--------|------------|
| `/automation/results/+server.ts` | results 배열 최대 10,000건 |
| `/test-cases/import/+server.ts` | 파일 크기 10MB 제한 + 행 수 5,000건 제한 |
| `/automation/webhook/+server.ts` | Content-Length 1MB 제한 (413 응답) |

### 3.3 클라이언트 Fetch 래퍼 ✅ 완료

**파일**: `src/lib/api-client.ts`

**구현된 함수:**
| 함수 | 설명 |
|------|------|
| `apiFetch<T>(url, options?)` | GET 요청 + 자동 에러 토스트 |
| `apiPost<T>(url, body)` | POST 요청 |
| `apiPut<T>(url, body)` | PUT 요청 |
| `apiPatch<T>(url, body)` | PATCH 요청 |
| `apiDelete<T>(url)` | DELETE 요청 |

- `silent: true` 옵션으로 에러 토스트 억제 가능
- 21개 Svelte 컴포넌트에 적용 (raw fetch 57→13, -77%)
- 미변환 13개는 FormData 전송, lock 관련 fire-and-forget, 특수 에러 바디 처리 등 의도적 유지

---

## Phase 4: 성능 및 품질 개선

### 4.1 N+1 쿼리 해결 ✅ 완료

**`bulk/+server.ts` 최적화:**
| 액션 | Before | After |
|------|--------|-------|
| `setPriority` | N개 × `findTestCaseWithLatestVersion` (2N 쿼리) | `findTestCasesWithLatestVersions` 배치 (2 쿼리) |
| `clone` | N개 × `findTestCaseWithLatestVersion` (2N 쿼리) | `findTestCasesWithLatestVersions` 배치 (2 쿼리) |
| `addTag` | N개 × existence check + insert | 단일 `INSERT ... ON CONFLICT DO NOTHING` |
| `removeTag` | N개 × 개별 DELETE | 단일 `DELETE ... WHERE IN` |
| `addAssignee` | N개 × existence check + insert | 단일 `INSERT ... ON CONFLICT DO NOTHING` |
| `removeAssignee` | N개 × 개별 DELETE | 단일 `DELETE ... WHERE IN` |

> 참고: `test-cases/+page.server.ts` 실행상태 필터 및 `CommentSection` 트리 구조는 현재 성능 이슈 없어 유지.

### 4.2 JWKS 캐싱 ✅ 이미 구현됨

**파일**: `src/lib/server/oidc-jwt.ts`

1시간 TTL 기반 캐시가 이미 구현되어 있음. 추가 작업 불필요.

### 4.3 DB 스키마 개선 ✅ 부분 완료

**완료 항목:**
| 항목 | 설명 |
|------|------|
| `updatedAt` 추가 | `project`, `testRun` 테이블에 `$onUpdate()` 자동 타임스탬프 추가 |
| `search_vector` 문서화 | `testCaseVersion` 섹션에 생성 컬럼 존재 설명 주석 추가 |
| 마이그레이션 | `0015_add_updated_at.sql` 생성 |

**미진행 항목:**
| 항목 | 사유 |
|------|------|
| Attachment FK | `referenceId` + `referenceType` 다형성 패턴, 변경 시 대규모 마이그레이션 필요 |
| 스키마 파일 분할 | 이미 섹션별 주석으로 정리됨. Drizzle relations의 cross-file 참조 시 circular dependency 리스크 |

### 4.4 테스트 개선

| 항목 | 설명 |
|------|------|
| E2E 테스트 보강 | 핵심 워크플로우 (테스트케이스 CRUD, 실행 관리) E2E 추가 |
| Mock 정교화 | `mock-db.ts`가 실제 Drizzle API 커버리지 부족 |
| 통합 테스트 | 현재 대부분 단위 테스트 → DB 연동 통합 테스트 추가 고려 |

### 4.5 Silent Error 처리 ✅ 완료

6개 silent catch에 `console.warn` 추가:
- `NotificationBell.svelte` — 4개 (loadNotifications, refreshUnreadCount, markAsRead, markAllAsRead)
- `FailureDetailsSheet.svelte` — 1개 (fetchFailures)
- `settings/members/+page.svelte` — 1개 (user search)

> 나머지 silent catch는 의도적 동작: api-client 에러 토스트 위임, JSON 파싱 에러 반환, 스토리지 정리 등.

---

## 부록: 파일별 현황

### 300줄 초과 파일 (리팩토링 대상)

| 파일 | 라인 | 우선순위 | 조치 |
|------|------|----------|------|
| `test-cases/+page.svelte` | ~~1,997~~ 1,499 | **P0** | ✅ 2개 컴포넌트 추출 완료 |
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
Phase 1 (공통 유틸리티)
  ├─ 1.1 쿼리 헬퍼              ✅ 완료
  ├─ 1.2 CSV 유틸리티            ✅ 완료
  ├─ 1.3 에러 응답 유틸리티       ⏳ 미진행 (우선순위 낮음)
  └─ 1.4 @ts-ignore 해결        ⏳ 미진행 (의존성 업데이트 필요)

Phase 2 (컴포넌트 분할)
  ├─ 2.1 test-cases/+page.svelte ✅ 완료 (1,997→1,499줄)
  ├─ 2.2 CommentSection          ✅ 완료 (443→242줄)
  ├─ 2.3 ImportDialog            ✅ 완료 (429→275줄)
  ├─ 2.4 NotificationBell        — 스킵 (효과 미미)
  └─ 2.5 +page.server.ts        ✅ 완료 (429→335줄)

Phase 3 (API 계층)
  ├─ 3.1 라우트 미들웨어          ✅ 완료 (38개 라우트)
  ├─ 3.2 입력 검증 강화           ✅ 완료
  └─ 3.3 Fetch 래퍼              ✅ 완료 (21개 컴포넌트)

Phase 4 (성능/품질)
  ├─ 4.1 N+1 쿼리               ✅ 완료 (bulk 6개 액션 배치화)
  ├─ 4.2 JWKS 캐싱              ✅ 이미 구현됨
  ├─ 4.3 DB 스키마              ⏳ 미진행
  ├─ 4.4 테스트                 ⏳ 미진행
  └─ 4.5 에러 처리              ✅ 완료
```
