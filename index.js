require('dotenv').config();
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
TelegramBot.Promise = Promise;

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { 
  polling: true,
  cancelAfter: 0
});

const CHECK_INTERVAL = 60 * 1000;
const BLOCK_HEIGHT_THRESHOLD = 10;

// 모니터링 중인 채팅 ID 목록
let activeChatIds = [];

// SQLite 데이터베이스 설정
const db = new sqlite3.Database('./pool_stats.db', (err) => {
  if (err) {
    console.error('데이터베이스 연결 오류:', err);
  } else {
    console.log('SQLite 데이터베이스에 연결되었습니다.');
    db.run(`CREATE TABLE IF NOT EXISTS pool_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      height INTEGER,
      hashrate INTEGER,
      miners INTEGER,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  }
});

// 환경 변수에서 풀 엔드포인트 및 이름 가져오기
const poolUrls = process.env.POOL_ENDPOINTS.split(',');
const poolNames = process.env.POOL_NAMES.split(',');

const poolEndpoints = poolUrls.map((url, index) => ({
  url,
  name: poolNames[index]
}));

// 봇 명령어 메뉴 설정
bot.setMyCommands([
  { command: '/start', description: '모니터링 시작' },
  { command: '/stop', description: '모니터링 중지' },
  { command: '/monitor', description: '모니터링 상태 확인' },
  { command: '/line', description: '──────────────' },
  { command: '/status', description: '현재 풀 상태 확인' },
  { command: '/compare', description: '풀 높이 비교' },
  { command: '/history', description: '풀 상태 기록 보기' }
]);

// 해시레이트 포맷팅 함수 추가
function formatHashrate(hashrate) {
  if (hashrate >= 1000000) {
    return `${(hashrate / 1000000).toFixed(2)} MH/s`;
  } else if (hashrate >= 1000) {
    return `${(hashrate / 1000).toFixed(2)} KH/s`;
  }
  return `${hashrate} H/s`;
}

// 숫자 포맷팅 함수 추가
function formatNumber(number) {
  return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// 한국 시간으로 변환하는 유틸리티 함수 추가
function formatKSTDateTime(timestamp) {
  const options = {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  };
  return new Date(timestamp).toLocaleString('ko-KR', options);
}

// 풀 상태 조회 함수
async function getPoolStats() {
  const poolStats = await Promise.all(
    poolEndpoints.map(async (endpoint) => {
      const response = await axios.get(endpoint.url);
      return {
        name: endpoint.name,
        url: endpoint.url,
        height: parseInt(response.data.nodes[0].height),
        hashrate: response.data.hashrate,
        miners: response.data.minersTotal,
        lastBlockFound: response.data.stats.lastBlockFound
      };
    })
  );
  return poolStats;
}

// 풀 상태 저장 함수
function savePoolStats(poolStats) {
  const stmt = db.prepare("INSERT INTO pool_stats (name, height, hashrate, miners) VALUES (?, ?, ?, ?)");
  poolStats.forEach(pool => {
    stmt.run(pool.name, pool.height, pool.hashrate, pool.miners);
  });
  console.log(`풀 상태가 저장되었습니다. (${poolStats.length}개 풀 상태 저장됨)`);
  stmt.finalize();
}

// 풀 상태 메시지 생성 함수
function createStatusMessage(poolStats) {
  return poolStats.map(pool => 
    `🏊‍♂️ ${pool.name}\n` +
    `📦 블록 높이: ${formatNumber(pool.height)}\n` +
    `⚡ 해시레이트: ${formatHashrate(pool.hashrate)}\n` +
    `👥 채굴자 수: ${formatNumber(pool.miners)}\n` +
    `🕒 ${formatKSTDateTime(pool.lastBlockFound * 1000)}`
  ).join('\n\n');
}

// 높이 비교 메시지 생성 함수
function createHeightCompareMessage(poolStats) {
  const [pool1, pool2] = poolStats;
  const heightDiff = Math.abs(pool1.height - pool2.height);
  const blockTimeDiff = Math.abs(pool1.lastBlockFound - pool2.lastBlockFound);
  
  return `📊 풀 높이 및 블록타임 비교\n\n` +
    `🏊‍♂️ ${pool1.name}\n높이: ${formatNumber(pool1.height)}\n블록타임: ${new Date(pool1.lastBlockFound * 1000).toLocaleString('ko-KR')}\n\n` +
    `🏊‍♂️ ${pool2.name}\n높이: ${formatNumber(pool2.height)}\n블록타임: ${new Date(pool2.lastBlockFound * 1000).toLocaleString('ko-KR')}\n\n` +
    `📈 높이 차이: ${formatNumber(heightDiff)} 블록\n` +
    `🕒 블록타임 차이: ${formatNumber(blockTimeDiff)} 초\n` +
    (heightDiff >= BLOCK_HEIGHT_THRESHOLD ? 
      `⚠️ 주의: 블록 높이 차이가 ${BLOCK_HEIGHT_THRESHOLD} 이상입니다!` : 
      `✅ 정상: 블록 높이 차이가 안정적입니다.`);
}

// 주기적 풀 상태 체크
async function checkPoolStatus() {
  try {
    const poolStats = await getPoolStats();
    savePoolStats(poolStats); // 풀 상태 저장
    const heights = poolStats.map(pool => pool.height);
    const maxHeight = Math.max(...heights);
    const minHeight = Math.min(...heights);
    
    if (maxHeight - minHeight >= BLOCK_HEIGHT_THRESHOLD) {
      const message = createStatusMessage(poolStats);
      for (const chatId of activeChatIds) {
        await bot.sendMessage(chatId, 
          `⚠️ 풀 간 블록 높이 차이가 감지되었습니다!\n\n${message}`
        );
      }
    }
  } catch (error) {
    console.error('풀 상태 확인 중 오류 발생:', error);
    for (const chatId of activeChatIds) {
      await bot.sendMessage(chatId, '❌ 풀 상태 확인 중 오류가 발생했습니다.');
    }
  }
}

// 버튼 메뉴 생성 함수
function createMainMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📊 현재 풀 상태', callback_data: 'status' },
          { text: '📈 풀 높이 비교', callback_data: 'compare' }
        ],
        [
          { text: '📡 모니터링 시작', callback_data: 'start' },
          { text: '⏹ 모니터링 중지', callback_data: 'stop' }
        ],
        [
          { text: '📡 모니터링 상태', callback_data: 'monitor' },
          { text: '📜 풀 상태 기록', callback_data: 'history' }
        ]
      ]
    }
  };
}

// 메인 메뉴 표시 명령어 추가
bot.onText(/\/menu/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(
    chatId, 
    '🔷 원하시는 작업을 선택해주세요:', 
    createMainMenu()
  );
});

// 명령어 핸들러 추가
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  if (!activeChatIds.includes(chatId)) {
    activeChatIds.push(chatId);
    await bot.sendMessage(chatId, '✅ 풀 상태 모니터링을 시작합니다.');
  } else {
    await bot.sendMessage(chatId, '❗ 이미 모니터링이 활성화되어 있습니다.');
  }
});

bot.onText(/\/stop/, async (msg) => {
  const chatId = msg.chat.id;
  const index = activeChatIds.indexOf(chatId);
  if (index !== -1) {
    activeChatIds.splice(index, 1);
    await bot.sendMessage(chatId, '⏹ 풀 상태 모니터링을 중지했습니다.');
  } else {
    await bot.sendMessage(chatId, '❌ 모니터링이 활성화되어 있지 않습니다.');
  }
});

bot.onText(/\/monitor/, async (msg) => {
  const chatId = msg.chat.id;
  if (!activeChatIds.includes(chatId)) {
    await bot.sendMessage(chatId, '📴 현재 모니터링이 비활성화 상태입니다.');
    return;
  }
  const monitorMessage = 
    '📊 모니터링 상태\n\n' +
    `✅ 상태: 활성화\n` +
    `🔄 체크 주기: ${CHECK_INTERVAL / 1000}초\n` +
    `⚠️ 블록 차이 임계값: ${BLOCK_HEIGHT_THRESHOLD}블록\n` +
    `👤 모니터링 채팅 ID: ${chatId}`;
  await bot.sendMessage(chatId, monitorMessage);
});

bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const poolStats = await getPoolStats();
    const statusMessage = createStatusMessage(poolStats);
    await bot.sendMessage(chatId, `📊 현재 풀 상태:\n\n${statusMessage}`);
  } catch (error) {
    console.error('풀 상태 확인 중 오류:', error);
    await bot.sendMessage(chatId, '❌ 풀 상태 확인 중 오류가 발생했습니다.');
  }
});

bot.onText(/\/compare/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const compareStats = await getPoolStats();
    const compareMessage = createHeightCompareMessage(compareStats);
    await bot.sendMessage(chatId, compareMessage);
  } catch (error) {
    console.error('풀 비교 중 오류:', error);
    await bot.sendMessage(chatId, '❌ 풀 비교 중 오류가 발생했습니다.');
  }
});

// 풀 기록 조회 함수 추가
function getPoolHistory(limit = 5) {
  return new Promise((resolve, reject) => {
    const query = `
      WITH RankedPools AS (
        SELECT 
          name,
          height,
          hashrate,
          miners,
          datetime(timestamp, 'localtime') as timestamp,
          ROW_NUMBER() OVER (PARTITION BY name ORDER BY timestamp DESC) as rn
        FROM pool_stats
        WHERE timestamp >= datetime('now', '-1 hour')
      )
      SELECT 
        name,
        height,
        hashrate,
        miners,
        timestamp
      FROM RankedPools
      WHERE rn = 1
      ORDER BY timestamp DESC
      LIMIT ?
    `;
    
    db.all(query, [limit], (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

// 풀 기록 메시지 생성 함수
function createHistoryMessage(poolHistory) {
  if (poolHistory.length === 0) {
    return '📝 아직 기록된 풀 상태가 없습니다.';
  }

  const message = ['📜 최근 풀 상태 기록:\n'];
  
  const groupedByName = {};
  poolHistory.forEach(record => {
    if (!groupedByName[record.name]) {
      groupedByName[record.name] = [];
    }
    groupedByName[record.name].push(record);
  });
  
  Object.entries(groupedByName).forEach(([name, records]) => {
    const latest = records[0];
    message.push(
      `\n🏊‍♂️ ${name}\n` +
      `📦 블록 높이: ${formatNumber(latest.height)}\n` +
      `⚡ 해시레이트: ${formatHashrate(latest.hashrate)}\n` +
      `👥 채굴자 수: ${formatNumber(latest.miners)}\n` +
      `🕒 ${formatKSTDateTime(new Date(latest.timestamp))}`
    );
    message.push('\n');
  });

  return message.join('');
}

// history 명령어 핸들러 추가
bot.onText(/\/history/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const poolHistory = await getPoolHistory();
    const historyMessage = createHistoryMessage(poolHistory);
    await bot.sendMessage(chatId, historyMessage);
  } catch (error) {
    console.error('풀 기록 조회 중 오류:', error);
    await bot.sendMessage(chatId, '❌ 풀 기록 조회 중 오류가 발생했습니다.');
  }
});

// 주기적 체크 시작
setInterval(checkPoolStatus, CHECK_INTERVAL);

// 에러 핸들링
bot.on('error', (error) => {
  console.error('텔레그램 봇 에러:', error);
});

console.log('텔레그램 봇이 시작되었습니다.');
