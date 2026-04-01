# 대학교 축제 관리 웹앱 MVP (FestFlow)

React + Spring Boot + MySQL 기반의 로컬 실행용 축제 관리 앱입니다.

## 프로젝트 구조

- `backend`: Spring Boot (Java 17, Gradle)
- `frontend`: React (Vite, Tailwind CSS, PWA)

## 사전 준비

- Java 17
- Node.js 18+
- MySQL 8.x (포트 3306)

## 1) MySQL 준비

아래 SQL을 먼저 실행해서 DB만 생성하세요.

```sql
CREATE DATABASE IF NOT EXISTS festival_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

백엔드 연결 정보는 고정되어 있습니다.

- DB: `festival_db`
- username: `root`
- password: `6247`
- port: `3306`

## 2) 백엔드 실행

```bash
cd backend
./gradlew bootRun
```

Windows PowerShell:

```powershell
cd backend
.\gradlew.bat bootRun
```

동작 포트: `http://localhost:8080`

### 백엔드 동작 특징

- JPA `ddl-auto=update`로 테이블 자동 생성
- 앱 시작 시 `CommandLineRunner`로 더미 데이터 자동 삽입
- CORS: `http://localhost:5173` 허용

## 3) 프론트엔드 실행

```bash
cd frontend
npm install
npm run dev
```

동작 포트: `http://localhost:5173`

## 구현 기능

### 1. 지도 + 부스 표시

- 홈 화면 더미 지도 영역
- 부스 목록 표시
- 혼잡도 색상 배지 표시

### 2. 혼잡도 시스템

- `POST /api/gps`로 GPS 로그 저장
- 최근 15분 GPS 로그 기준으로 부스 반경 80m 내 사용자 수 계산
- 혼잡도 단계: `여유 / 보통 / 혼잡 / 매우혼잡`

### 3. 공연 시스템

- `GET /api/events`로 공연 목록 조회
- 현재 시간 기준으로 상태 자동 계산(`예정 / 진행중 / 종료`)

### 4. 챗봇 시스템

- `POST /api/chat`
- 질문 입력 시 키워드 기반 더미 응답 반환

## API 목록

- `GET /api/booths`
- `GET /api/booths/{id}/congestion`
- `POST /api/gps`
- `GET /api/events`
- `POST /api/chat`

### 요청 예시

`POST /api/gps`

```json
{
  "latitude": 37.5665,
  "longitude": 126.9780
}
```

`POST /api/chat`

```json
{
  "question": "지금 혼잡한 부스가 어디야?"
}
```

## PWA 구성

- `frontend/public/manifest.json`
- `frontend/public/service-worker.js`
- `src/main.jsx`에서 Service Worker 등록
- 홈 화면 추가(설치) 가능

## 화면 구성

- Home: 더미 지도, 부스 리스트, 혼잡도, 샘플 GPS 전송 버튼
- Event: 공연 리스트 + 상태 표시
- Chat: 질문 입력 + 챗봇 응답

## 검증 결과

- 백엔드 빌드 성공: `./gradlew clean build`
- 프론트 빌드 성공: `npm run build`
