# TestMini — 배포 가이드

> 최종 수정: 2026-03-05

---

## 목차

1. [사전 요구사항](#1-사전-요구사항)
2. [환경 변수](#2-환경-변수)
3. [개발 환경 설정](#3-개발-환경-설정)
4. [프로덕션 배포](#4-프로덕션-배포)
   - [Docker Compose (권장)](#41-docker-compose-권장)
   - [수동 배포](#42-수동-배포)
5. [데이터베이스](#5-데이터베이스)
6. [백업 및 복원](#6-백업-및-복원)
   - [수동 백업](#61-수동-백업)
   - [백업에서 복원](#62-백업에서-복원)
   - [자동 백업 (Docker Compose)](#63-자동-백업-docker-compose)
   - [백업 무결성 검증](#64-백업-무결성-검증)
7. [SSL / 리버스 프록시](#7-ssl--리버스-프록시)
8. [모니터링](#8-모니터링)
9. [트러블슈팅](#9-트러블슈팅)
10. [롤백](#10-롤백)

---

## 1. 사전 요구사항

### 공통

| 소프트웨어 | 최소 버전 | 비고 |
|-----------|-----------|------|
| Node.js | 24+ | LTS 권장 |
| pnpm | 9+ | `corepack enable && corepack prepare pnpm@latest --activate` |
| PostgreSQL | 16+ | 프로덕션 compose는 17-alpine 사용 |
| Redis | 7+ | SSE 실시간 동기화 및 Soft Lock용 |

### Docker 배포 시 추가 요구사항

| 소프트웨어 | 최소 버전 |
|-----------|-----------|
| Docker | 24+ |
| Docker Compose | v2.20+ |

### 서버 사양 (최소 권장)

- CPU: 1 vCPU
- 메모리: 1 GB RAM
- 디스크: 10 GB (파일 첨부 볼륨 고려하여 충분히 확보)

---

## 2. 환경 변수

`.env.example`을 복사하여 `.env`를 생성하고 아래 항목을 설정합니다.

```bash
cp .env.example .env
```

### 필수 변수

| 변수 | 설명 | 예시 |
|------|------|------|
| `DATABASE_URL` | PostgreSQL 연결 문자열 | `postgres://user:password@localhost:5432/testmini` |
| `ORIGIN` | 앱의 공개 URL (슬래시 없이) | `https://qa.example.com` |
| `BETTER_AUTH_SECRET` | 세션 서명 시크릿 (32자 이상 필수) | `openssl rand -base64 32` 출력값 |

### 선택 변수

| 변수 | 설명 | 기본값 | 예시 |
|------|------|--------|------|
| `REDIS_URL` | Redis 연결 문자열 | `redis://localhost:6379` | `redis://:password@localhost:6379` |
| `PORT` | 앱 리스닝 포트 | `3000` | `3000` |
| `NODE_ENV` | Node 실행 환경 | — | `production` |

### Docker Compose 전용 변수 (`compose.prod.yaml`)

`compose.prod.yaml`은 아래 변수를 호스트 환경(`.env` 파일 또는 쉘)에서 읽습니다.

| 변수 | 설명 | 예시 |
|------|------|------|
| `POSTGRES_PASSWORD` | PostgreSQL `testmini` 계정 비밀번호 | `openssl rand -base64 24` 출력값 |
| `REDIS_PASSWORD` | Redis `requirepass` 비밀번호 | `openssl rand -base64 24` 출력값 |
| `ORIGIN` | 앱의 공개 URL | `https://qa.example.com` |
| `BETTER_AUTH_SECRET` | 세션 서명 시크릿 | `openssl rand -base64 32` 출력값 |
| `APP_PORT` | 호스트에 노출할 포트 | `3000` |

> **주의:** `BETTER_AUTH_SECRET`이 노출되면 세션 토큰 위조가 가능합니다. 절대로 Git에 커밋하지 마세요.

### 강력한 시크릿 생성 방법

```bash
# BETTER_AUTH_SECRET
openssl rand -base64 32

# POSTGRES_PASSWORD, REDIS_PASSWORD
openssl rand -base64 24
```

---

## 3. 개발 환경 설정

```bash
# 1. 저장소 클론
git clone <repository-url>
cd testmini

# 2. 의존성 설치
pnpm install

# 3. 개발용 Docker 서비스 시작 (PostgreSQL + Redis)
docker compose -f compose.yaml up -d

# 4. 환경 변수 설정
cp .env.example .env
# .env 파일을 열어 DATABASE_URL, ORIGIN, BETTER_AUTH_SECRET 설정

# 5. DB 스키마 적용
pnpm db:push

# 6. 개발 서버 실행
pnpm dev
```

개발 서버는 기본적으로 `http://localhost:5173`에서 실행됩니다.

### 개발용 환경 변수 예시 (`.env`)

```dotenv
DATABASE_URL="postgres://root:mysecretpassword@localhost:5432/local"
ORIGIN="http://localhost:5173"
BETTER_AUTH_SECRET="dev-only-secret-change-in-production"
REDIS_URL="redis://localhost:6379"
```

### 주요 개발 스크립트

```bash
pnpm dev              # 개발 서버 (HMR)
pnpm check            # TypeScript + Svelte 타입 체크
pnpm test             # Vitest 단위 테스트
pnpm test:e2e         # Playwright E2E 테스트
pnpm lint             # ESLint 검사
pnpm format           # Prettier 포맷
pnpm db:studio        # Drizzle Studio (브라우저 DB GUI)
```

---

## 4. 프로덕션 배포

### 4.1 Docker Compose (권장)

`compose.prod.yaml`을 사용합니다. 앱(Node 24-alpine), PostgreSQL 17, Redis 7이 단일 구성으로 포함됩니다.

#### 아키텍처

```
인터넷
  │
  └── 리버스 프록시 (Nginx / Caddy)  ← HTTPS 종단
        │
        └── app:3000  (frontend 네트워크)
              │
              ├── db:5432    (backend 네트워크, 외부 미노출)
              └── redis:6379 (backend 네트워크, 외부 미노출)
```

#### 배포 절차

```bash
# 1. 서버에서 저장소 클론
git clone <repository-url>
cd testmini

# 2. 프로덕션 환경 변수 파일 생성
cat > .env << 'EOF'
POSTGRES_PASSWORD=<강력한_비밀번호>
REDIS_PASSWORD=<강력한_비밀번호>
ORIGIN=https://qa.example.com
BETTER_AUTH_SECRET=<32자_이상_랜덤_문자열>
APP_PORT=3000
EOF

# 3. Docker 이미지 빌드 및 서비스 시작
docker compose -f compose.prod.yaml up -d --build

# 4. DB 마이그레이션 실행
docker compose -f compose.prod.yaml exec app pnpm db:migrate

# 5. 서비스 상태 확인
docker compose -f compose.prod.yaml ps
```

#### 서비스 상태 확인

```bash
# 전체 서비스 상태
docker compose -f compose.prod.yaml ps

# 앱 헬스체크 (정상이면 {"status":"ok"} 반환)
curl http://localhost:3000/api/health

# 로그 확인
docker compose -f compose.prod.yaml logs -f app
docker compose -f compose.prod.yaml logs -f db
docker compose -f compose.prod.yaml logs -f redis
```

#### 서비스 재시작

```bash
# 앱만 재빌드 후 재시작
docker compose -f compose.prod.yaml up -d --build app

# 전체 재시작
docker compose -f compose.prod.yaml restart
```

#### 서비스 중지

```bash
# 컨테이너만 중지 (볼륨 유지)
docker compose -f compose.prod.yaml down

# 볼륨까지 삭제 (데이터 초기화 — 주의!)
docker compose -f compose.prod.yaml down -v
```

---

### 4.2 수동 배포

Docker를 사용하지 않고 직접 Node.js 서버에 배포하는 방법입니다.

#### 사전 준비

- PostgreSQL 16+ 데이터베이스 및 사용자 생성 완료
- Redis 7+ 서버 실행 중
- Node.js 24+, pnpm 설치 완료

#### 빌드 및 배포

```bash
# 1. 저장소 클론
git clone <repository-url>
cd testmini

# 2. 의존성 설치
pnpm install --frozen-lockfile

# 3. 환경 변수 설정
cp .env.example .env
# .env 파일 편집: DATABASE_URL, ORIGIN, BETTER_AUTH_SECRET, REDIS_URL 설정

# 4. 프로덕션 빌드
pnpm build

# 5. 프로덕션 의존성만 남기기 (선택, 빌드 서버에서 배포 서버로 전송 시)
pnpm prune --prod

# 6. DB 마이그레이션 실행
pnpm db:migrate

# 7. 서버 시작
NODE_ENV=production node build
```

#### 프로세스 관리 (PM2 사용 권장)

```bash
# PM2 전역 설치
pnpm add -g pm2

# 앱 시작
NODE_ENV=production pm2 start build/index.js --name testmini

# 서버 재시작 시 자동 시작 등록
pm2 startup
pm2 save

# 상태 확인
pm2 status
pm2 logs testmini
```

#### systemd 유닛 파일 예시

```ini
# /etc/systemd/system/testmini.service
[Unit]
Description=TestMini QA Management System
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=testmini
WorkingDirectory=/opt/testmini
EnvironmentFile=/opt/testmini/.env
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/node /opt/testmini/build/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
# 유닛 등록 및 시작
sudo systemctl daemon-reload
sudo systemctl enable testmini
sudo systemctl start testmini
sudo systemctl status testmini
```

---

## 5. 데이터베이스

### 마이그레이션 명령

```bash
# 마이그레이션 파일 생성 (스키마 변경 후)
pnpm db:generate

# 마이그레이션 실행 (SQL 파일 적용)
pnpm db:migrate

# 스키마 즉시 반영 (개발용, 마이그레이션 파일 없이)
pnpm db:push
```

> **프로덕션에서는 반드시 `db:migrate`를 사용하세요.** `db:push`는 개발 환경 전용입니다.

### Docker 환경에서 마이그레이션

```bash
# 앱 컨테이너 내에서 실행
docker compose -f compose.prod.yaml exec app pnpm db:migrate
```

### 마이그레이션 파일 위치

```
drizzle/
├── 0000_puzzling_klaw.sql                  # 초기 스키마
├── 0001_aromatic_black_queen.sql
├── 0002_search_indexes.sql
├── 0003_test_suite.sql
├── 0004_index_tuning.sql
├── 0005_user_preference.sql
├── 0006_test_execution_constraints.sql
└── 0007_attachment_referential_integrity.sql
```

---

## 6. 백업 및 복원

백업 스크립트는 `scripts/backup/` 디렉토리에 있습니다. Docker exec 모드(Compose 스택과 함께 실행)와 직접 연결 모드를 모두 지원합니다.

### 6.1 수동 백업

#### 스크립트 사용 (권장)

```bash
# Docker Compose 환경에서 백업 (기본값: ./backups 디렉토리, 30개 보관)
./scripts/backup/pg-backup.sh

# 백업 디렉토리 및 보관 수 지정
./scripts/backup/pg-backup.sh --backup-dir /opt/backups --retain 14

# 직접 연결 모드 (Docker 없이)
./scripts/backup/pg-backup.sh \
  --mode direct \
  --host localhost \
  --port 5432 \
  --user testmini \
  --password "$POSTGRES_PASSWORD" \
  --dbname testmini

# 환경 변수로 설정 가능
POSTGRES_PASSWORD=secret BACKUP_DIR=/opt/backups ./scripts/backup/pg-backup.sh
```

#### 원라이너 (Docker Compose 환경)

```bash
docker compose -f compose.prod.yaml exec db \
  env PGPASSWORD="$POSTGRES_PASSWORD" \
  pg_dump -U testmini testmini \
  | gzip > backup_$(date +%Y-%m-%d_%H%M%S).sql.gz
```

#### 원라이너 (직접 연결)

```bash
PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
  -h localhost -p 5432 -U testmini testmini \
  | gzip > backup_$(date +%Y-%m-%d_%H%M%S).sql.gz
```

#### 스크립트 옵션 전체 목록

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `-d`, `--backup-dir` | 백업 저장 디렉토리 | `./backups` |
| `-r`, `--retain` | 보관할 최대 백업 수 | `30` |
| `-m`, `--mode` | `docker` 또는 `direct` | `docker` |
| `-c`, `--compose-file` | Compose 파일 경로 | `compose.prod.yaml` |
| `-s`, `--service` | DB 서비스 이름 | `db` |
| `-h`, `--host` | DB 호스트 (direct 모드) | `localhost` |
| `-p`, `--port` | DB 포트 (direct 모드) | `5432` |
| `-U`, `--user` | DB 사용자 | `testmini` |
| `-P`, `--password` | DB 비밀번호 | `$POSTGRES_PASSWORD` |
| `-n`, `--dbname` | DB 이름 | `testmini` |

### 6.2 백업에서 복원

#### 스크립트 사용 (권장)

```bash
# 복원 전 확인 프롬프트 표시 (기본값)
./scripts/backup/pg-restore.sh ./backups/backup_2026-03-05_020000.sql.gz

# 확인 생략 (자동화 스크립트 등에서 사용)
./scripts/backup/pg-restore.sh --force ./backups/backup_2026-03-05_020000.sql.gz

# 직접 연결 모드
./scripts/backup/pg-restore.sh \
  --mode direct \
  --host localhost \
  --user testmini \
  --password "$POSTGRES_PASSWORD" \
  --dbname testmini \
  ./backups/backup_2026-03-05_020000.sql.gz
```

복원 스크립트는 다음 순서로 동작합니다.

1. 요약 및 확인 프롬프트 표시 (`--force` 생략 가능)
2. 기존 DB의 활성 연결 종료 (`pg_terminate_backend`)
3. 데이터베이스 DROP 및 재생성
4. gzip 압축 해제 후 SQL 복원 (`ON_ERROR_STOP=1`)
5. `information_schema.tables` 기준으로 테이블 수 검증

#### 원라이너 (Docker Compose 환경)

```bash
# 경고: 기존 데이터가 모두 삭제됩니다
gunzip -c backup_2026-03-05_020000.sql.gz | \
  docker compose -f compose.prod.yaml exec -T db \
  env PGPASSWORD="$POSTGRES_PASSWORD" \
  psql -U testmini testmini
```

### 6.3 자동 백업 (Docker Compose)

`compose.prod.yaml`의 `backup` 서비스가 자동 백업을 담당합니다. 스택 시작 시 초기 백업을 1회 실행하고, 이후 cron 스케줄에 따라 반복 실행합니다.

#### 백업 서비스 환경 변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `BACKUP_SCHEDULE` | cron 표현식 | `0 2 * * *` (매일 02:00) |
| `BACKUP_RETAIN` | 보관할 최대 백업 수 | `30` |

`.env` 파일 또는 쉘에서 설정합니다.

```dotenv
BACKUP_SCHEDULE=0 2 * * *
BACKUP_RETAIN=30
```

#### 백업 파일 위치

백업은 `backups` Docker 볼륨(`/backups`)에 저장됩니다. 호스트에서 접근하려면:

```bash
# 볼륨 마운트 위치 확인
docker volume inspect testmini_backups

# 백업 목록 조회
docker compose -f compose.prod.yaml exec backup ls -lh /backups/

# 백업 파일을 호스트로 복사
docker compose -f compose.prod.yaml \
  cp backup:/backups/backup_2026-03-05_020000.sql.gz ./
```

#### 백업 서비스 로그 확인

```bash
docker compose -f compose.prod.yaml logs -f backup
```

#### 수동으로 즉시 백업 트리거

```bash
docker compose -f compose.prod.yaml exec backup \
  /usr/local/bin/run-backup.sh
```

#### cron 스케줄 예시

| 표현식 | 설명 |
|--------|------|
| `0 2 * * *` | 매일 02:00 (기본값) |
| `0 */6 * * *` | 6시간마다 |
| `0 2 * * 0` | 매주 일요일 02:00 |
| `30 1 1 * *` | 매월 1일 01:30 |

### 6.4 백업 무결성 검증

#### gzip 파일 유효성 검사

```bash
# gzip 무결성 확인 (손상 파일 감지)
gzip -t backup_2026-03-05_020000.sql.gz && echo "OK" || echo "CORRUPTED"

# 파일 내용 미리보기 (처음 20줄)
gunzip -c backup_2026-03-05_020000.sql.gz | head -20
```

#### 테스트 DB에서 복원 검증

```bash
# 1. 검증용 임시 DB 생성
docker compose -f compose.prod.yaml exec db \
  env PGPASSWORD="$POSTGRES_PASSWORD" \
  psql -U testmini -c "CREATE DATABASE testmini_verify;"

# 2. 백업 복원
gunzip -c backup_2026-03-05_020000.sql.gz | \
  docker compose -f compose.prod.yaml exec -T db \
  env PGPASSWORD="$POSTGRES_PASSWORD" \
  psql -U testmini testmini_verify

# 3. 테이블 수 확인
docker compose -f compose.prod.yaml exec db \
  env PGPASSWORD="$POSTGRES_PASSWORD" \
  psql -U testmini testmini_verify \
  -c "SELECT count(*) AS table_count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';"

# 4. 임시 DB 삭제
docker compose -f compose.prod.yaml exec db \
  env PGPASSWORD="$POSTGRES_PASSWORD" \
  psql -U testmini -c "DROP DATABASE testmini_verify;"
```

#### 백업 파일 목록 및 크기 확인

```bash
# Docker 볼륨 내 백업 목록 (최신순)
docker compose -f compose.prod.yaml exec backup \
  ls -lht /backups/backup_*.sql.gz

# 전체 백업 볼륨 사용량
docker system df -v | grep backups
```

---

## 7. SSL / 리버스 프록시

앱은 포트 3000에서 HTTP로 동작합니다. 외부에는 반드시 리버스 프록시를 통해 HTTPS로 노출하세요.

### Nginx 예시

```nginx
# /etc/nginx/sites-available/testmini
server {
    listen 80;
    server_name qa.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name qa.example.com;

    ssl_certificate     /etc/letsencrypt/live/qa.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/qa.example.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # 파일 업로드 크기 제한
    client_max_body_size 50M;

    # SSE (Server-Sent Events) 실시간 스트리밍
    proxy_buffering off;
    proxy_cache off;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;

        # SSE 타임아웃 방지
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

```bash
# Nginx 설정 활성화
sudo ln -s /etc/nginx/sites-available/testmini /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Let's Encrypt 인증서 발급 (certbot)
sudo certbot --nginx -d qa.example.com
```

### Caddy 예시 (자동 HTTPS)

```caddyfile
# /etc/caddy/Caddyfile
qa.example.com {
    # 파일 업로드 크기
    request_body {
        max_size 50MB
    }

    reverse_proxy localhost:3000 {
        # SSE 스트리밍을 위한 플러시 간격
        flush_interval -1
    }
}
```

```bash
# Caddy 시작 (자동으로 HTTPS 인증서 발급)
sudo systemctl enable caddy
sudo systemctl start caddy
```

> **ORIGIN 환경 변수**는 반드시 리버스 프록시의 외부 URL과 일치해야 합니다.
> 예: `ORIGIN=https://qa.example.com`

---

## 8. 모니터링

### 헬스체크 엔드포인트

```
GET /api/health
```

- 정상: HTTP 200, `{"status": "ok"}`
- DB 연결 실패: HTTP 503, `{"status": "error", "message": "Database connection failed"}`

```bash
# 수동 확인
curl -s http://localhost:3000/api/health | python3 -m json.tool

# 주기적 모니터링 (cron)
*/5 * * * * curl -sf http://localhost:3000/api/health || \
  echo "TestMini health check failed" | mail -s "Alert" admin@example.com
```

`compose.prod.yaml`은 30초 간격으로 헬스체크를 자동 실행합니다. 3회 연속 실패 시 컨테이너가 `unhealthy` 상태로 전환됩니다.

### 로그 수집

```bash
# Docker 환경 로그 (실시간)
docker compose -f compose.prod.yaml logs -f --tail=100 app

# 특정 시간 이후 로그
docker compose -f compose.prod.yaml logs --since="2026-03-05T00:00:00" app

# PM2 환경 로그
pm2 logs testmini --lines 100
```

### 로그 레벨

앱은 `NODE_ENV=production` 시 최소 로그만 출력합니다. Redis 연결 오류, DB 오류는 표준 에러로 출력됩니다.

### 디스크 사용량 모니터링

파일 첨부 기능으로 인해 `/app/data/uploads` (Docker: `uploads` 볼륨) 디스크 사용량이 증가할 수 있습니다.

```bash
# Docker 볼륨 사용량 확인
docker system df -v | grep uploads

# 업로드 디렉토리 크기 확인 (수동 배포)
du -sh /opt/testmini/data/uploads
```

---

## 9. 트러블슈팅

### 앱이 시작되지 않음

**증상:** 컨테이너가 즉시 종료되거나 `unhealthy` 상태

**원인 및 해결:**

```bash
# 1. 로그 확인
docker compose -f compose.prod.yaml logs app

# 2. 필수 환경 변수 누락 여부 확인
#    BETTER_AUTH_SECRET, ORIGIN, DATABASE_URL이 설정되었는지 확인
docker compose -f compose.prod.yaml exec app env | grep -E "DATABASE_URL|ORIGIN|BETTER_AUTH_SECRET"

# 3. DB 연결 확인
docker compose -f compose.prod.yaml exec app \
  node -e "const p = require('postgres'); p('$DATABASE_URL')().then(() => console.log('ok')).catch(console.error)"
```

### DB 마이그레이션 실패

**증상:** `pnpm db:migrate` 실행 시 오류

**해결:**

```bash
# DATABASE_URL 환경 변수 확인
echo $DATABASE_URL

# PostgreSQL 접속 가능 여부 확인
psql "$DATABASE_URL" -c "SELECT version();"

# Docker 환경: DB가 healthy 상태인지 확인
docker compose -f compose.prod.yaml ps db
```

### Redis 연결 실패

**증상:** 실시간 SSE 업데이트가 동작하지 않음. 로그에 `Redis connection error` 출력

**해결:**

```bash
# Redis 서비스 상태 확인
docker compose -f compose.prod.yaml ps redis

# Redis 접속 테스트 (Docker 환경)
docker compose -f compose.prod.yaml exec redis \
  redis-cli -a "$REDIS_PASSWORD" ping
# 정상 응답: PONG

# REDIS_URL 형식 확인 (비밀번호 포함 시)
# redis://:password@host:6379
```

> Redis 없이도 앱은 동작하지만, SSE 실시간 동기화 및 Soft Lock 기능이 비활성화됩니다.

### ORIGIN 불일치로 인한 인증 오류

**증상:** 로그인 후 리다이렉트 실패, CSRF 오류

**해결:**

- `ORIGIN` 환경 변수가 브라우저에서 접근하는 URL과 정확히 일치해야 합니다.
- 끝에 슬래시(`/`)가 없어야 합니다.
- HTTPS 배포 시 반드시 `https://`로 설정해야 합니다.

```bash
# 예시
ORIGIN=https://qa.example.com   # 올바름
ORIGIN=https://qa.example.com/  # 잘못됨 (후행 슬래시)
ORIGIN=http://qa.example.com    # 잘못됨 (HTTPS인데 http 설정)
```

### 파일 업로드 실패

**증상:** 첨부파일 업로드 시 오류

**해결:**

```bash
# Docker: uploads 볼륨 마운트 확인
docker compose -f compose.prod.yaml exec app ls -la /app/data/uploads

# 수동 배포: 디렉토리 권한 확인
ls -la /opt/testmini/data/uploads
# testmini 사용자가 쓰기 권한을 가져야 함

# 권한 수정
chown -R testmini:testmini /opt/testmini/data/uploads
chmod 755 /opt/testmini/data/uploads

# 리버스 프록시: client_max_body_size 설정 확인 (Nginx 기준)
grep client_max_body_size /etc/nginx/sites-available/testmini
```

### 포트 충돌

**증상:** `address already in use :3000`

**해결:**

```bash
# 포트 사용 프로세스 확인
lsof -i :3000

# compose.prod.yaml에서 APP_PORT 변경
APP_PORT=8080 docker compose -f compose.prod.yaml up -d
```

### 메모리 부족

**증상:** 컨테이너가 OOM으로 재시작

**해결:**

```bash
# 컨테이너 메모리 사용량 확인
docker stats

# compose.prod.yaml에 메모리 제한 추가 (app 서비스)
# deploy:
#   resources:
#     limits:
#       memory: 512M
```

---

## 10. 롤백

### Docker Compose 환경에서 롤백

이전 버전의 이미지 태그를 사용하거나, 이전 Git 커밋으로 되돌린 후 재빌드합니다.

```bash
# 1. 현재 서비스 중지 (DB는 유지)
docker compose -f compose.prod.yaml stop app

# 2. 이전 버전으로 Git 되돌리기
git log --oneline -10         # 되돌릴 커밋 해시 확인
git checkout <이전_커밋_해시>

# 3. 이미지 재빌드 및 시작
docker compose -f compose.prod.yaml up -d --build app

# 4. 헬스체크 확인
curl -s http://localhost:3000/api/health
```

### DB 마이그레이션 롤백

Drizzle ORM은 자동 롤백을 지원하지 않습니다. 마이그레이션 롤백이 필요한 경우:

```bash
# 방법 1: 배포 전 백업에서 복원 (스크립트 사용)
./scripts/backup/pg-restore.sh --force backup_before_deploy.sql.gz

# 방법 2: 수동으로 역방향 SQL 실행
# drizzle/ 디렉토리의 마이그레이션 파일을 참고하여
# DROP/ALTER 문을 수동으로 작성하여 실행
docker compose -f compose.prod.yaml exec db psql -U testmini testmini
```

> 마이그레이션 롤백은 데이터 손실 위험이 있습니다. **배포 전 반드시 백업을 수행하세요.**

### 배포 전 체크리스트

배포 전 아래 항목을 확인하세요.

- [ ] 데이터베이스 백업 완료
- [ ] `.env` 환경 변수 확인 (특히 `ORIGIN`, `BETTER_AUTH_SECRET`)
- [ ] `pnpm db:migrate` 실행 예정 여부 확인 (신규 마이그레이션 파일 존재 시)
- [ ] 헬스체크 엔드포인트 (`/api/health`) 배포 후 정상 응답 확인
- [ ] 리버스 프록시 설정 확인 (HTTPS, SSE 타임아웃)
- [ ] 업로드 볼륨/디렉토리 마운트 확인
