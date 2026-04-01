# FestFlow - 대학교 축제 관리 웹앱

React + Spring Boot + MySQL 기반의 로컬 실행용 축제 관리 앱입니다.

## 프로젝트 구조

- `backend`: Spring Boot (Java 17, Gradle)
- `frontend`: React (Vite, Tailwind CSS, PWA)

## 기술 스택

- Frontend: React, Vite, Tailwind CSS, PWA, React Leaflet(실제 지도)
- Backend: Spring Boot 3, Spring Data JPA, Spring Security, JWT, SSE
- Database: MySQL 8

## 실행 전 준비

- Java 17
- Node.js 18+
- MySQL 8.x (포트 `3306`)

## DB 연결 정보

- DB 이름: `festival_db`
- username: `root`
- password: `6247`
- port: `3306`

`application.properties`에 아래처럼 설정되어 있습니다.

```properties
spring.datasource.url=jdbc:mysql://localhost:3306/festival_db?createDatabaseIfNotExist=true&useSSL=false&serverTimezone=Asia/Seoul&allowPublicKeyRetrieval=true
spring.datasource.username=root
spring.datasource.password=6247
spring.jpa.hibernate.ddl-auto=update
```

`createDatabaseIfNotExist=true`가 포함되어 있어, MySQL 서버만 켜져 있으면 DB가 자동 생성됩니다.

## 실행 방법

### 1) 백엔드 실행

```powershell
cd backend
.\gradlew.bat bootRun
```

- 서버: `http://localhost:8080`
- 첫 실행 시 테이블 자동 생성
- 더미 데이터 자동 삽입(CommandLineRunner)
- 기본 관리자 계정 자동 생성
  - ID: `admin`
  - PW: `admin1234`

### 2) 프론트 실행

```bash
cd frontend
npm install
npm run dev
```

- 웹앱: `http://localhost:5173`

참고: `npm start`도 동작하도록 스크립트를 추가해 두었습니다.

## 주요 기능

### 사용자 기능

- 홈
  - 실제 지도(OSM 타일) + 부스 마커 표시
  - 줌아웃 시 마커 클러스터 표시
  - 카카오/네이버 외부 길찾기 링크
  - 운영 공지 실시간 노출(긴급/분실물/우천)
  - 부스 카드(정사각형 소개 카드 유지)
  - 검색/필터/정렬, 즐겨찾기, 최근 본 부스
  - 혼잡도 요약 차트
- 부스 상세
  - 이미지, 설명, 위치 지도, 혼잡도 상세
  - \"지금 출발\"(카카오/네이버) 버튼
  - 현재 위치 기준 예상 도보시간 계산
  - 메모 저장(localStorage)
- 공연
  - 공연 목록/상태 표시(예정/진행중/종료)
  - 임박 공연 배너
- 챗봇
  - 질문 입력 + 더미 응답

### 실시간 기능

- SSE 기반 실시간 반영
  - `/api/stream/congestion`: 혼잡도 갱신
  - `/api/stream/events`: 공연 상태 갱신
  - `/api/stream/notices`: 공지 갱신
- 브라우저 알림
  - 혼잡 급상승 알림
  - 임박 공연 알림

### 관리자 기능

- JWT 로그인
- 관리자 API 보호(`/api/admin/**`)
- 운영 KPI 상단 고정 표시
  - 오늘 총 방문자
  - 현재 가장 혼잡한 부스
  - 30분 내 시작 공연
- 공지 작성/수정/삭제 및 홈 실시간 반영
- 부스/공연 CRUD
- 부스 이미지 업로드
- CSV 일괄 업로드(부스/공연)
- 부스 드래그 정렬(순서 저장)
- 최근 관리자 감사 로그 조회

### 혼잡도 계산 개선

- 최근 15분 GPS 로그를 사용
- 시간 가중치 적용(최근 로그일수록 점수 높음)
- 가중치 점수 기반으로 `여유/보통/혼잡/매우혼잡` 단계 계산

### 데이터 분석

- 시간대별 방문량
- 인기 부스 랭킹
- 혼잡 히트맵 포인트

## API 요약

### 기본 API

- `GET /api/booths`
- `GET /api/booths/{id}`
- `GET /api/booths/{id}/congestion`
- `POST /api/gps`
- `GET /api/events`
- `POST /api/chat`

### 인증/실시간/분석

- `POST /api/auth/login`
- `GET /api/stream/congestion` (SSE)
- `GET /api/stream/events` (SSE)
- `GET /api/stream/notices` (SSE)
- `GET /api/notices/active`
- `GET /api/analytics/traffic-hourly`
- `GET /api/analytics/popular-booths`
- `GET /api/analytics/congestion-heatmap`

### 관리자 API (JWT 필요)

- `POST /api/admin/booths`
- `PUT /api/admin/booths/{id}`
- `DELETE /api/admin/booths/{id}`
- `POST /api/admin/booths/{id}/image` (multipart)
- `PUT /api/admin/booths/reorder`
- `POST /api/admin/import/booths` (CSV)
- `POST /api/admin/import/events` (CSV)
- `POST /api/admin/events`
- `PUT /api/admin/events/{id}`
- `DELETE /api/admin/events/{id}`
- `GET /api/admin/dashboard/kpis`
- `GET /api/admin/audit-logs`
- `GET /api/admin/notices`
- `POST /api/admin/notices`
- `PUT /api/admin/notices/{id}`
- `DELETE /api/admin/notices/{id}`

## PWA

- `frontend/public/manifest.json`
- `frontend/public/service-worker.js`
- 오프라인 페이지: `frontend/public/offline.html`

## 검증 커맨드

- 백엔드: `cd backend && .\gradlew.bat clean build`
- 프론트: `cd frontend && npm run build`

## 자주 만나는 오류

### 1) `Unknown database 'festival_db'`

- MySQL 서버가 꺼져 있거나 접속 정보가 다른 경우입니다.
- MySQL 서비스 실행 후 다시 `bootRun` 하세요.

### 2) `npm error To see a list of scripts, run: npm run`

- `frontend` 폴더가 아닌 위치에서 실행했거나, 존재하지 않는 스크립트(`npm run xxx`)를 실행한 경우입니다.
- 반드시 `frontend` 폴더에서 `npm run dev` 또는 `npm start`를 실행하세요.
