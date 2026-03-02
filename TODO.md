# TODO — 개선 및 추가 작업 목록

> 코드베이스 분석 기반 (2026-03-02)

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

---

## UX / 접근성

- [x] 복잡한 페이지에 skeleton 로딩 추가 — 네비게이션 로딩 인디케이터 (shimmer bar)
- [x] Admin 페이지 empty state 개선 — 빈 상태 아이콘/안내 추가
- [x] 폼 라벨 접근성 — `<Label for={id}>` 및 `aria-label` 누락 수정
- [x] 모달/다이얼로그 포커스 트랩 — bits-ui가 이미 처리 (추가 작업 불필요)
- [x] 삭제 작업 성공/실패 토스트 피드백 보강 — 하드코딩 에러 메시지 i18n 전환

---

## 성능 / 리팩토링

- [x] 테스트 케이스 페이지 컴포넌트 분리 — 2434줄 → 1604줄 (34% 감소)
  - TestCaseDetailSheet (628줄) — 상세 패널, 편집, 태그/담당자, 버전 히스토리
  - FailureDetailsSheet (137줄) — 실패 상세 시트
  - FailWithDetailDialog (141줄) — FAIL 상세 입력 다이얼로그
- [x] 테스트 케이스 목록 페이지네이션 정보 표시 — "Page X of Y", 전체 건수
- [x] Import 실패 시 per-row 상태 반환 — 어떤 행이 성공/실패했는지 상세 결과

---

## 배포 / 인프라

- [ ] 프로덕션 Dockerfile (multi-stage build)
- [ ] `compose.prod.yaml` — 프로덕션용 Docker Compose
- [ ] CI/CD 파이프라인 설정

---

## 새 기능

- [ ] 테스트 런 비교 뷰 — 두 런 결과를 나란히 비교
- [ ] 테스트 케이스 버전 diff 뷰 — 버전 간 변경 사항 시각화
- [ ] 복수 테스트 런 통합 Export — 리포트 페이지에서 여러 런 데이터 내보내기
- [ ] 사용자 환경설정 페이지 — 언어/테마 등 설정 영속화

---

## 테스트

- [ ] API route 통합 테스트 — 핵심 API 계약 검증 (projects, test-cases, test-runs, import)
- [ ] E2E 테스트 — 핵심 워크플로우 (프로젝트 생성 → 멤버 추가 → TC 생성 → 런 실행 → 결과 확인)

---

## Phase 4: CI 연동 (PLAN.md)

- [ ] TestCase에 `automation_key` 필드 추가
- [ ] 자동화 결과 수집 API (`/api/automation/results`)
- [ ] CI webhook 연동 (GitHub Actions, GitLab CI)
