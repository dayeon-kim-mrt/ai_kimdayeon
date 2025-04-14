// server/index.js
const express = require('express');
const cors = require('cors');
const config = require('./config');

// 라우트 파일들 불러오기
const claudeRoutes = require('./routes/claudeRoutes');
const confluenceRoutes = require('./routes/confluenceRoutes');
const slackPreviewRoutes = require('./routes/slackPreview');

const app = express();
const port = config.PORT;

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// 라우터 등록
app.use('/api', claudeRoutes.router);
app.use('/api', confluenceRoutes);
app.use('/api', slackPreviewRoutes);

// 헬스체크 엔드포인트
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`Express server running at http://localhost:${port}`);
});
