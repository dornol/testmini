# 전체 UI·UX 적용 점검표

기준 커밋: `2cd6438`. 범위는 51개 페이지와 연결된 모달·시트·로딩·빈 결과·오류·권한 제한 상태다.
공통 스타일 적용만으로 페이지 검증 완료로 표시하지 않는다.

## 진행 단계

- [x] 코드 기준 페이지 및 공통 컴포넌트 목록 확인 (페이지 51개, UI 컴포넌트 106개)
- [ ] 각 페이지의 실제 화면·관련 상태 점검
- [x] 공통 컨트롤·표·폼·모달 기준 문서화 및 공통 컴포넌트 개선
- [ ] 전체 화면에서 공통 기준 적용 상태 확인
- [ ] 테스트 케이스 목록·생성·상세 기준 화면 완성
- [ ] 핵심 업무: 실행·스위트·계획·사이클·릴리스·탐색 테스트
- [ ] 분석: 대시보드·보고서·품질·추적성·공유 보고서
- [ ] 관리: 프로젝트 설정·팀·관리자·계정·인증
- [ ] 통합 검증 및 최종 요구사항 대조

## 검증 기준

한국어/영어, 라이트/다크, 375/768/1440px에서 레이아웃과 조작을 확인한다.
대표 화면은 200% 확대, 키보드 전용, reduced-motion도 확인한다.
각 페이지에서 적용되는 상태와 상태를 재현할 fixture를 기록한다. 적용되지 않는 상태는 이유를 남긴다.
변경 범위의 단위·E2E·접근성 검사와 타입·린트·빌드를 통과한다.
스크린샷은 실제 이미지를 검토한 후 갱신한다. 알려진 테스트 실패나 미검증 항목을 숨기지 않는다.

## 페이지별 상태

`대기` → `코드 적용` → `화면 검증` → `완료` 순서로 갱신한다.

| 페이지                                          | 코드·UX 점검 | 화면·상태 검증 | 비고                                                                                                                                              |
| ----------------------------------------------- | ------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                             | 대기         | 대기           |                                                                                                                                                   |
| `/account/profile`                              | 대기         | 대기           |                                                                                                                                                   |
| `/admin/audit-logs`                             | 대기         | 대기           |                                                                                                                                                   |
| `/admin/branding`                               | 대기         | 대기           |                                                                                                                                                   |
| `/admin/oidc-providers`                         | 대기         | 대기           |                                                                                                                                                   |
| `/admin/oidc-providers/[providerId]`            | 대기         | 대기           |                                                                                                                                                   |
| `/admin/oidc-providers/new`                     | 대기         | 대기           |                                                                                                                                                   |
| `/admin/projects`                               | 대기         | 대기           |                                                                                                                                                   |
| `/admin/users`                                  | 대기         | 대기           |                                                                                                                                                   |
| `/auth/account`                                 | 대기         | 대기           |                                                                                                                                                   |
| `/auth/login`                                   | 대기         | 대기           |                                                                                                                                                   |
| `/auth/pending`                                 | 대기         | 대기           |                                                                                                                                                   |
| `/my-work`                                      | 대기         | 대기           |                                                                                                                                                   |
| `/projects`                                     | 대기         | 대기           |                                                                                                                                                   |
| `/projects/[projectId]`                         | 대기         | 대기           |                                                                                                                                                   |
| `/projects/[projectId]/exploratory`             | 대기         | 대기           |                                                                                                                                                   |
| `/projects/[projectId]/exploratory/[sessionId]` | 대기         | 대기           |                                                                                                                                                   |
| `/projects/[projectId]/quality`                 | 대기         | 대기           |                                                                                                                                                   |
| `/projects/[projectId]/releases`                | 대기         | 대기           |                                                                                                                                                   |
| `/projects/[projectId]/releases/[releaseId]`    | 대기         | 대기           |                                                                                                                                                   |
| `/projects/[projectId]/reports`                 | 대기         | 대기           |                                                                                                                                                   |
| `/projects/[projectId]/settings`                | 대기         | 대기           |                                                                                                                                                   |
| `/projects/[projectId]/settings/api-keys`       | 대기         | 대기           |                                                                                                                                                   |
| `/projects/[projectId]/settings/custom-fields`  | 대기         | 대기           |                                                                                                                                                   |
| `/projects/[projectId]/settings/environments`   | 대기         | 대기           |                                                                                                                                                   |
| `/projects/[projectId]/settings/issue-tracker`  | 대기         | 대기           |                                                                                                                                                   |
| `/projects/[projectId]/settings/members`        | 대기         | 대기           |                                                                                                                                                   |
| `/projects/[projectId]/settings/priorities`     | 대기         | 대기           |                                                                                                                                                   |
| `/projects/[projectId]/settings/tags`           | 대기         | 대기           |                                                                                                                                                   |
| `/projects/[projectId]/settings/webhooks`       | 대기         | 대기           |                                                                                                                                                   |
| `/projects/[projectId]/test-cases`              | 코드 적용    | 부분 검증      | 빈 목록·데이터 있는 목록, 375/768/1440px 양 테마 axe, 선택·그룹 조작 이름. 권한별/오류/가상 스크롤 별도 확인 필요                                 |
| `/projects/[projectId]/test-cases/[testCaseId]` | 코드 적용    | 부분 검증      | CRUD, 연결 상세 시트의 검증·포커스 복귀. 상세 전체의 양 테마·언어·권한·로딩/오류 추가 확인 필요                                                   |
| `/projects/[projectId]/test-cases/new`          | 코드 적용    | 부분 검증      | 양 테마·3너비, 영어/가로/reduced-motion, 제출 실패·중첩 단계 오류·입력 보존·오류 링크·단계 키보드 이동. 200%·권한·사용자 정의 필드 추가 확인 필요 |
| `/projects/[projectId]/test-cycles`             | 대기         | 대기           |                                                                                                                                                   |
| `/projects/[projectId]/test-plans`              | 대기         | 대기           |                                                                                                                                                   |
| `/projects/[projectId]/test-plans/[planId]`     | 대기         | 대기           |                                                                                                                                                   |
| `/projects/[projectId]/test-plans/new`          | 대기         | 대기           |                                                                                                                                                   |
| `/projects/[projectId]/test-runs`               | 대기         | 대기           |                                                                                                                                                   |
| `/projects/[projectId]/test-runs/[runId]`       | 대기         | 대기           |                                                                                                                                                   |
| `/projects/[projectId]/test-runs/compare`       | 대기         | 대기           |                                                                                                                                                   |
| `/projects/[projectId]/test-runs/new`           | 대기         | 대기           |                                                                                                                                                   |
| `/projects/[projectId]/test-suites`             | 대기         | 대기           |                                                                                                                                                   |
| `/projects/[projectId]/test-suites/[suiteId]`   | 대기         | 대기           |                                                                                                                                                   |
| `/projects/[projectId]/traceability`            | 대기         | 대기           |                                                                                                                                                   |
| `/projects/new`                                 | 대기         | 대기           |                                                                                                                                                   |
| `/shared/[token]`                               | 대기         | 대기           |                                                                                                                                                   |
| `/teams`                                        | 대기         | 대기           |                                                                                                                                                   |
| `/teams/[teamId]`                               | 대기         | 대기           |                                                                                                                                                   |
| `/teams/[teamId]/settings`                      | 대기         | 대기           |                                                                                                                                                   |
| `/teams/[teamId]/settings/members`              | 대기         | 대기           |                                                                                                                                                   |
| `/teams/new`                                    | 대기         | 대기           |                                                                                                                                                   |

## 1차 구현 기록 — 2026-11-17

- `design-system/testmini/MASTER.md`에 기존 제품 스타일을 바탕으로 규격을 정리했다.
- 일반 컨트롤 40px, 테스트 케이스 필터 32px. 표 머리글·표 스크롤 경계·모달/시트 닫기 영역을 개선했다.
- 오류 요약/필드 연결을 `FormErrorSummary`로 구현하고 생성·수정·상세 시트에 적용했다.
- 단계 편집 버튼 이름과 키보드 재정렬, 목록 체크박스와 부분 선택 상태, 그룹 펼침 상태, 담당자/태그 버튼 이름을 보완했다.
- 우선순위 사용자 색상은 표시점에 보존하고 문구는 테마 전경색으로 표시한다.
- 기본 화면 외에 오류가 표시된 다크 폼도 axe 검사하도록 했다. 실제 검사에서 발견한 다크 오류 문구 대비와 선택 placeholder 대비 문제를 수정했다.
- 기존 크기 CSS에 의존하던 단계 편집 테스트를 접근 가능한 버튼 속성 기반으로 변경했다.
- 모바일 빈 목록 스크린샷을 실제 검토 후 갱신했다. 생성 모바일/데스크톱, 데이터 목록, 상세 시트 오류 화면을 직접 렌더링해 확인했다.

### 검증 증거

- `e2e/tests/ux-foundations.spec.ts`: 입력 보존/중첩 오류 링크/단계 키보드 이동/상세 시트 오류 및 포커스 복귀/영어 가로 화면/reduced-motion/375·768·1440px 양 테마 axe.
- 전체 E2E: 109 통과, 1 기존 skip (110개). 마지막 오류 색상 수정 후 My Work 및 UX foundations E2E 12개도 통과했다.
- 단위 테스트: 289개 파일, 4,949개 통과.
- 타입 검사: 오류 0, 경고 0. 린트/포맷 통과.
- 최종 빌드 및 기존 번들 예산 통과: 전체 클라이언트 1904.06 KiB / 1933.59 KiB, 최대 route node 134.20 KiB / 136.72 KiB.

### 다음에 해결할 항목

1. 테스트 케이스 상세/시트의 사용자 정의 필드·로딩·오류·권한·200% 확대까지 점검해 기준 화면을 마무리한다. 현재 schema 오류 일부가 영어이므로 한국어 오류 문구도 정리한다.
2. 테스트 실행·스위트·계획·사이클·릴리스·탐색 테스트에 목록/폼/상태 패턴을 확산한다. 상태 필터 버튼의 선택 의미와 필터 결과 없음/최초 빈 상태를 구별한다.
3. 분석 화면, 관리/인증/공유 화면을 순서대로 실제 렌더링해서 점검표를 갱신한다.
4. 51개 페이지와 연결 상태를 모두 대조한 다음에만 전체 완료로 표시한다.
