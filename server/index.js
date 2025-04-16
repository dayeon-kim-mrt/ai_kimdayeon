// server/index.js
// 필요한 모듈 임포트
const express = require('express'); // Express 웹 프레임워크
const cors = require('cors');       // CORS 미들웨어 (다른 도메인에서의 요청 허용)
const config = require('./config'); // 서버 설정 파일 (포트, API 키 등)

// 라우트 파일들 불러오기
const claudeRoutes = require('./routes/claudeRoutes');         // Claude 관련 API 라우터
const confluenceRoutes = require('./routes/confluenceRoutes');   // Confluence 관련 API 라우터
const slackPreviewRoutes = require('./routes/slackPreview');     // Slack 메시지 관련 API 라우터

const app = express();
const port = config.PORT;

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// 라우터 등록: '/api' 경로로 들어오는 요청을 각 라우트 파일로 분기
app.use('/api', claudeRoutes);      // 예: /api/makeTitle -> claudeRoutes에서 처리
app.use('/api', confluenceRoutes);  // 예: /api/createPage -> confluenceRoutes에서 처리
app.use('/api', slackPreviewRoutes);  // 예: /api/getSlackPreviewMessage -> slackPreviewRoutes에서 처리

// 간단한 헬스체크 엔드포인트 (서버 동작 확인용)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`Express server running at http://localhost:${port}`);
});
