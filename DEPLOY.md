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
6. [SSL / 리버스 프록시](#6-ssl--리버스-프록시)
7. [모니터링](#7-모니터링)
8. [트러블슈팅](#8-트러블슈팅)
9. [롤백](#9-롤백)

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

### 백업

```bash
# Docker 환경에서 pg_dump로 백업
docker compose -f compose.prod.yaml exec db \
  pg_dump -U testmini testmini | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz

# 호스트에서 직접 백업 (수동 배포)
pg_dump -U testmini -h localhost testmini | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

### 복원

```bash
# Docker 환경에서 복원
gunzip -c backup_20260305_120000.sql.gz | \
  docker compose -f compose.prod.yaml exec -T db \
  psql -U testmini testmini

# 호스트에서 직접 복원
gunzip -c backup_20260305_120000.sql.gz | psql -U testmini -h localhost testmini
```

### 자동 백업 (cron 예시)

```bash
# /etc/cron.d/testmini-backup
0 3 * * * root docker compose -f /opt/testmini/compose.prod.yaml exec -T db \
  pg_dump -U testmini testmini | gzip > /backups/testmini_$(date +\%Y\%m\%d).sql.gz \
  && find /backups -name "testmini_*.sql.gz" -mtime +30 -delete
```

---

## 6. SSL / 리버스 프록시

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

## 7. 모니터링

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

## 8. 트러블슈팅

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

## 9. 롤백

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
# 방법 1: 배포 전 백업에서 복원
gunzip -c backup_before_deploy.sql.gz | \
  docker compose -f compose.prod.yaml exec -T db \
  psql -U testmini testmini

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
