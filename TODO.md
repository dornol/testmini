# TODO — 개선 및 추가 작업 목록

> 코드베이스 분석 기반 (2026-03-02)

---

## Quick Wins (빠르게 처리 가능)

- [ ] `/api/health` 헬스체크 엔드포인트 추가 — 로드밸런서/오케스트레이터용
- [ ] 환경변수 검증 — 서버 시작 시 `BETTER_AUTH_SECRET`, `DATABASE_URL`, `ORIGIN` 누락 시 명확한 에러 메시지
- [ ] API 라우트 `request.json()` try-catch 누락 수정 — 잘못된 JSON 요청 시 400 응답 반환
- [ ] Redis 연결 실패 시 경고 로깅 — 현재 silent failure, 기능 저하 안내 필요
- [ ] 프로덕션 SvelteKit adapter 명시 설정 — `adapter-auto` → `adapter-node` 등 고정

---

## 보안

- [ ] 파일 스토리지 path traversal 방어 — `storage.ts`에서 `objectKey`에 `..` 포함 시 차단
- [ ] `.env.example` 프로덕션 가이드 추가 — 강력한 시크릿 생성 안내

---

## UX / 접근성

- [ ] 복잡한 페이지에 skeleton 로딩 추가 — 대시보드, TC 목록, 리포트
- [ ] Admin 페이지 empty state 개선 — 빈 상태 아이콘/안내 추가
- [ ] 폼 라벨 접근성 — `<Label for={id}>` 및 `aria-label` 누락 수정
- [ ] 모달/다이얼로그 포커스 트랩 — 키보드 네비게이션 개선
- [ ] 삭제 작업 성공/실패 토스트 피드백 보강

---

## 성능 / 리팩토링

- [ ] 테스트 케이스 페이지 컴포넌트 분리 — 86KB 단일 컴포넌트를 서브컴포넌트로 분할
  - Failure details sheet
  - Status dropdown logic
  - Edit dialogs
- [ ] 테스트 케이스 목록 페이지네이션 정보 표시 — "Page X of Y", 전체 건수
- [ ] Import 실패 시 per-row 상태 반환 — 어떤 행이 성공/실패했는지 상세 결과

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
