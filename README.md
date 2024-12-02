# MintMe Pool Monitor Bot

MintMe Pool Monitor Bot은 텔레그램을 통해 MintMe 풀의 상태를 모니터링하고, 블록 높이 차이를 감지하여 알림을 보내는 봇입니다. 이 봇은 Node.js와 SQLite를 사용하여 구현되었습니다.

## 기능

- 풀 상태 주기적 체크 및 저장
- 블록 높이 차이 감지 시 알림 전송
- 풀 상태 기록 조회
- 자동 비교 알리미 기능
- 다양한 명령어를 통한 상태 및 설정 관리

## 설치

### 요구 사항

- Node.js (v14 이상)
- npm
- 텔레그램 봇 API 토큰

### 설치 방법

1. 이 저장소를 클론합니다.
   ```bash
   git clone https://github.com/yourusername/mintme-pool-monitor-bot.git
   cd mintme-pool-monitor-bot   ```

2. 필요한 패키지를 설치합니다.
   ```bash
   npm install   ```

3. `.env` 파일을 설정합니다. `.env.sample` 파일을 참고하여 `.env` 파일을 생성하고, 텔레그램 봇 토큰과 풀 엔드포인트를 설정합니다.
   ```plaintext
   TELEGRAM_BOT_TOKEN=your_actual_telegram_bot_token
   POOL_ENDPOINTS=https://web-test.gonspool.com/api/stats,https://www.mintme.com/pool/api/stats
   POOL_NAMES=gonspool,mintme   ```

4. 데이터베이스 파일을 무시하도록 `.gitignore`에 추가합니다.
   ```plaintext
   pool_stats.db   ```

## 사용법

### 스크립트 명령어

- **시작**: `npm run start` - PM2를 사용하여 봇을 시작합니다.
- **중지**: `npm run stop` - PM2를 사용하여 봇을 중지합니다.
- **재시작**: `npm run restart` - PM2를 사용하여 봇을 재시작합니다.
- **모니터링**: `npm run monitor` - PM2 모니터링을 시작합니다.
- **로그 보기**: `npm run logs` - PM2 로그를 확인합니다.
- **개발 모드**: `npm run dev` - Nodemon을 사용하여 개발 모드로 실행합니다.

### 텔레그램 명령어

- `/start` - 풀 블럭 차이 긴급 알리미 시작
- `/stop` - 풀 블럭 차이 긴급 알리미 중지
- `/monitor` - 풀 블럭 차이 긴급 알리미 상태 확인
- `/status` - 현재 풀 상태 확인
- `/compare` - 풀 높이 비교
- `/history` - 풀 상태 기록 보기
- `/settings` - 설정 메뉴

## 기여

기여를 환영합니다! 버그 리포트, 기능 제안, 풀 리퀘스트 등을 통해 프로젝트에 기여할 수 있습니다.

## 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다. 자세한 내용은 `LICENSE` 파일을 참조하세요. 