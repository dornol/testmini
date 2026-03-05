# TODO — 개선 및 추가 작업 목록

> 코드베이스 분석 기반 (2026-03-02)
> 전체 재분석 및 1~3단계 구현 (2026-03-05)
> 4단계 구현 (2026-03-05)
> 새 기능 8개 구현 (2026-03-05)
> 테스트 4개 항목 구현 (2026-03-05)

---

## Quick Wins ✅

- [x] `/api/health` 헬스체크 엔드포인트 추가 — DB 연결 확인 포함
- [x] 환경변수 검증 — `BETTER_AUTH_SECRET`, `ORIGIN` 서버 시작 시 체크 (`DATABASE_URL`은 기존 체크 있음)
- [x] API 라우트 `request.json()` → `parseJsonBody()` 유틸로 통일 (16개 파일, 18개소)
- [x] Redis 연결 실패 시 경고 로깅 — connect/error 이벤트 + 초기 실패 메시지
- [x] 프로덕션 SvelteKit adapter — `adapter-auto` → `adapter-node` 변경

---

## 보안

- [x] 파일 스토리지 path traversal 방어 — `storage.ts`에서 `objectKey`에 `..` 포함 시 차단
- [x] `.env.example` 프로덕션 가이드 추가 — 강력한 시크릿 생성 안내
- [x] 보안 응답 헤더 추가 — `hooks.server.ts`에서 X-Frame-Options, X-Content-Type-Options, Referrer-Policy, X-XSS-Protection 설정
- [x] 첨부파일 접근제어 — `/api/attachments/[id]` GET에서 참조 엔티티 프로젝트 접근 권한 검증
- [x] 첨부파일 MIME 타입 화이트리스트 — 허용 파일 형식 제한 (이미지, PDF, 문서, 동영상 등 20종)
- [x] Redis 인증 설정 — 프로덕션 compose에 `requirepass` 추가
- [x] 암호화 키 파생 강화 — `crypto.ts` SHA-256 → PBKDF2 전환 (반복 횟수 100,000)
- [x] 인증 엔드포인트 Rate Limiting — Redis 슬라이딩 윈도우 기반 IP별 제한 (로그인/회원가입 10req/min)
- [x] API Rate Limiting — 파일 업로드 30req/min, 벌크 20req/min, 일반 API 100req/min (hooks.server.ts)
- [x] OIDC 토큰 검증 강화 — JWKS 기반 RS256/384/512 서명 검증 + discovery SSRF 방어 (사설IP 차단)

---

## UX / 접근성

- [x] 복잡한 페이지에 skeleton 로딩 추가 — 네비게이션 로딩 인디케이터 (shimmer bar)
- [x] Admin 페이지 empty state 개선 — 빈 상태 아이콘/안내 추가
- [x] 폼 라벨 접근성 — `<Label for={id}>` 및 `aria-label` 누락 수정
- [x] 모달/다이얼로그 포커스 트랩 — bits-ui가 이미 처리 (추가 작업 불필요)
- [x] 삭제 작업 성공/실패 토스트 피드백 보강 — 하드코딩 에러 메시지 i18n 전환
- [x] 비동기 작업 로딩 상태 — 프로젝트 검색 스켈레톤 + 다이얼로그 액션 스피너 추가
- [x] 대시보드 차트 접근성 — Canvas 차트에 `aria-label` + `role="img"` 추가
- [x] 프로젝트 레이아웃 탭 ARIA — `role="tablist"`, `aria-current="page"` 적용
- [x] VirtualList 접근성 — `role="list"` / `role="listitem"` 시맨틱 속성 추가
- [x] 색상 의존 상태 표시 개선 — PASS/FAIL 진행률에 텍스트 라벨 병행 (색맹 대응)
- [x] 회원가입 비밀번호 강도 표시기 — PasswordStrengthMeter 컴포넌트 (5단계 색상 바 + 텍스트 라벨)

---

## 성능 / 리팩토링

- [x] 테스트 케이스 페이지 컴포넌트 분리 — 2434줄 → 1604줄 (34% 감소)
- [x] 테스트 케이스 목록 페이지네이션 정보 표시 — "Page X of Y", 전체 건수
- [x] Import 실패 시 per-row 상태 반환 — 어떤 행이 성공/실패했는지 상세 결과
- [x] 사이드바 N+1 쿼리 최적화 — `+layout.server.ts`에서 3회 쿼리 → 1회 JOIN으로 통합
- [x] 벌크 작업 배치 크기 제한 — bulk API에 최대 200건 제한 추가
- [x] StepsEditor 고유 ID 사용 — 배열 인덱스 → `crypto.randomUUID()` 키로 변경
- [x] 테스트 런 상세 페이지 컴포넌트 분리 — 1,157줄 → 188줄 + 6개 서브 컴포넌트 (RunHeader, ExecutionFilters, BulkActionBar, ExecutionTable, ExecutionRow, FailureDetailDialog)
- [x] Export 엔드포인트 스트리밍 — ReadableStream + 커서 기반 페이지네이션 (배치 100건), BOM 포함
- [x] 대시보드 차트 지연 로딩 — LazyChart 컴포넌트 (IntersectionObserver + 스켈레톤 플레이스홀더)
- [x] 리포트 페이지 날짜 범위 필터 — 프리셋 버튼 (7/30/90일, 전체) + 커스텀 날짜 입력, URL 파라미터 기반

---

## 배포 / 인프라

- [x] 프로덕션 Dockerfile (multi-stage build)
- [x] `compose.prod.yaml` — 프로덕션용 Docker Compose
- [x] CI/CD 파이프라인 설정 — Gitea Actions (check, test, build)
- [x] Docker 네트워크 격리 — 프로덕션 compose에서 frontend/backend 네트워크 분리
- [x] lint/format 스크립트 — `package.json`에 eslint, prettier, format:check 스크립트 추가
- [x] 모니터링/로깅 — pino 구조화 로깅, 요청 ID 추적, 에러 핸들링 훅, console.* → 구조화 로그 전환
- [x] DB 백업 전략 — pg_dump 자동 백업/복원 스크립트 + Docker Compose cron 서비스 (매일 02시, 30일 보관)
- [x] 배포 문서화 — DEPLOY.md 작성 (Docker Compose, 수동 배포, SSL/리버스 프록시, DB 백업, 트러블슈팅)

---

## 새 기능

- [x] 테스트 런 비교 뷰 — 두 런 결과를 나란히 비교 (필터: 전체/차이/회귀)
- [x] 테스트 케이스 버전 diff 뷰 — 단어 수준 LCS diff, 필드별 변경 시각화
- [x] 복수 테스트 런 통합 Export — 리포트 페이지에서 체크박스 선택 후 CSV 내보내기
- [x] 사용자 환경설정 페이지 — 언어/테마 DB 영속화, 기기 간 동기화
- [x] 감사 로그 (Audit Log) — auditLog 테이블 + Admin 조회 페이지 (필터, 페이지네이션) + 주요 액션 로깅
- [x] 알림 시스템 — notification 테이블 + NotificationBell 컴포넌트 (30초 폴링, 읽음 처리, 커서 페이지네이션)
- [x] 대시보드 위젯 커스터마이징 — dashboardLayout 테이블 + 위젯 표시/숨김, 순서 드래그, 크기 조절 (sm/md/lg)
- [x] 테스트 케이스 템플릿 — testCaseTemplate 테이블 + "Save as Template" / "Create from Template" UI
- [x] 벌크 Import 진행률 표시 — ImportDialog 상태 머신 (idle→uploading→processing→complete/error) + 결과 요약 카드
- [x] 첨부파일 드래그 앤 드롭 업로드 — AttachmentManager에 D&D 지원 (드래그 시각 피드백, MIME 검증, 멀티 파일)
- [x] 키보드 단축키 — ShortcutManager + KeyboardShortcuts 컴포넌트 (Mod+S 저장, Mod+K 검색, ? 힌트 패널)
- [x] 테스트 케이스 코멘트/토론 — testCaseComment 테이블 + CommentSection 컴포넌트 (스레드 1레벨, 수정/삭제)

---

## DB / 스키마

- [x] 복합 인덱스 추가 — `testExecution(testRunId, status, executedBy)` 커버링 인덱스 (마이그레이션 0006)
- [x] test_execution CHECK 제약 — `PENDING`일 때 `executedBy`/`executedAt` NULL 강제 (마이그레이션 0006)
- [x] 그룹 색상 값 검증 — API에서 HEX 형식 regex 검증 추가
- [x] sortOrder 값 검증 — reorder API에서 음수/비정수 방지
- [x] 첨부파일 참조 무결성 — INSERT/UPDATE 검증 트리거 + 부모 삭제 시 CASCADE 정리 트리거 (마이그레이션 0007)

---

## 테스트

- [x] API route 통합 테스트 — 핵심 API 계약 검증 (projects, test-cases, test-runs, import)
- [x] E2E 테스트 — 핵심 워크플로우 (프로젝트 생성 → TC 생성 → 런 실행 → 결과 확인)
- [x] 신규 API 가드 테스트 — bulk 배치 제한, export 건수 제한, reorder 검증, 그룹 색상 검증, 첨부파일 MIME 등
- [x] Svelte 컴포넌트 테스트 — PasswordStrengthMeter (8), ShortcutHintPanel (9), shortcuts.ts (23) 테스트 추가
- [x] API PATCH/DELETE 테스트 — 프로젝트 (10), TC (15), 런 (11), 그룹 (13) PATCH/DELETE 테스트 추가
- [x] 동시성 테스트 — soft lock 유닛 (14), lock API (17), revision 낙관적 동시성 (9) 테스트 추가
- [x] E2E 커버리지 확대 — admin (11), project-settings (9), reports (11) E2E 테스트 추가

---

## Phase 4: CI 연동 (PLAN.md)

- [ ] TestCase에 `automation_key` 필드 추가
- [ ] 자동화 결과 수집 API (`/api/automation/results`)
- [ ] CI webhook 연동 (GitHub Actions, GitLab CI)

---

## API 개선

- [x] 테스트 스위트 아이템 프로젝트 소속 검증 — POST 시 TC 프로젝트 소속 확인
- [x] reorder API 소속 검증 — TC/그룹 reorder 시 해당 프로젝트 소속 확인
- [x] Export 건수 제한 — `/reports/export`에서 최대 20개 run 제한
- [x] 사용자 검색 페이지네이션 — `/api/users/search`에 offset 파라미터 추가
- [x] API 응답 일관성 — PATCH 엔드포인트 `{success: true}` → 업데이트된 엔티티 반환으로 통일
- [x] OIDC discovery 캐싱 — 5분 TTL 메모리 캐시 + 10초 fetch 타임아웃 추가
