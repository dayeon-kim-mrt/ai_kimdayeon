require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json({ limit: '5mb' }));

const {
  CONFLUENCE_URL,
  CONFLUENCE_USERNAME,
  CONFLUENCE_TOKEN,
  CLAUDE_API_KEY
} = process.env;

// 예: "모두의 AI" 페이지 ID & Space Key
const PARENT_PAGE_ID = '4139942192'; 
const SPACE_KEY = 'AL';

// ==========================================
// 1) Claude 호출 헬퍼
// ==========================================
async function callClaude(prompt, maxTokens = 3000) {
  const ANTHROPIC_MESSAGES_API_URL = 'https://api.anthropic.com/v1/messages';
  const DEFAULT_MODEL = 'claude-3-7-sonnet-20250219';

  const requestBody = {
    model: DEFAULT_MODEL,
    max_tokens: maxTokens,
    temperature: 0.7,
    system: "당신은 한국어 문서에 최적화된 전문 작가입니다. 불필요한 '도와드리겠습니다' 같은 문구를 쓰지 않고, 깔끔한 최종 텍스트만 작성하세요.",
    messages: [
      { role: 'user', content: prompt }
    ]
  };

  const response = await axios.post(
    ANTHROPIC_MESSAGES_API_URL,
    requestBody,
    {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      }
    }
  );

  const contentArr = response.data.content || [];
  return contentArr.map(obj => obj.text).join('\n');
}

// ==========================================
// 2) 스크립트를 일정 길이(문자수)로 분할
// (토큰 정확성은 떨어지지만, 단순 예시)
// ==========================================
function chunkText(script, chunkSize = 4000) {
  const chunks = [];
  let start = 0;
  while (start < script.length) {
    const end = Math.min(script.length, start + chunkSize);
    chunks.push(script.slice(start, end));
    start = end;
  }
  return chunks;
}

// ==========================================
// /api/makeTitle : 제목(30자 내외) 요약
// ==========================================
app.post('/api/makeTitle', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'prompt is required' });
  }

  try {
    // Claude에게 "30자 이내" 요청
    const finalPrompt = `
다음 스크립트를 보고, 한국어로 된 Confluence 문서 제목을 30자 이내로 만들어주세요.
너무 장황하지 않도록 주의하세요.

스크립트:
${prompt}

조건:
- 30자 이내 (한국어 기준)
- 불필요 문구 없이

Assistant:
`.trim();

    const title = await callClaude(finalPrompt, 500);
    return res.json({ title });
  } catch (err) {
    console.error('Error calling /api/makeTitle:', err.response?.data || err.message);
    return res.status(500).json({ error: 'Error calling makeTitle', details: err.message });
  }
});

// ==========================================
// /api/chunkSummarize : 긴 스크립트 → 부분 요약들 → 최종 Confluence Wiki Markup
// ==========================================
app.post('/api/chunkSummarize', async (req, res) => {
  const { script } = req.body;
  if (!script) {
    return res.status(400).json({ error: 'script is required' });
  }

  try {
    // 1) 스크립트 분할
    const chunks = chunkText(script, 4000); // 원하는 크기 조절

    // 2) 각 chunk 요약
    let partialSummaries = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunkPrompt = `
다음은 스크립트의 일부(Chunk ${i+1}/${chunks.length})입니다:

---
${chunks[i]}
---

위 내용을 한국어로 간결히 요약해 주세요. 
불필요한 표현 없이 핵심만 담고, 문장만 출력해주세요.
`.trim();

      console.log(`-- Summarizing chunk ${i+1}`);
      const partial = await callClaude(chunkPrompt, 3000);
      partialSummaries.push(partial);
    }

    // 3) 부분 요약들을 합쳐 최종 문서
    const combined = partialSummaries.join('\n\n');
    const finalPrompt = `
아래는 여러 Chunk 요약들을 합친 내용입니다:

${combined}

이제 이것을 종합해서, Confluence 위키 마크업으로 최종 본문을 작성해 주세요.

조건:
- h1. 은 최상위 제목
- h2. , h3. 등으로 섹션 구분
- 한국어 작성
- 약 800~1200자 정도(너무 길면 축약)
- "도와드리겠습니다" 같은 표현 없이
- 깔끔하고 전문적 문체

Assistant:
`.trim();

    console.log('-- Final compile for Confluence wiki markup');
    const finalWiki = await callClaude(finalPrompt, 3500);

    return res.json({ wikiContent: finalWiki });
  } catch (err) {
    console.error('Error in /api/chunkSummarize:', err.response?.data || err.message);
    return res.status(500).json({ error: 'Chunk Summarize failed', details: err.message });
  }
});

// ==========================================
// /api/createPage : Confluence REST API (wiki representation)
// ==========================================
app.post('/api/createPage', async (req, res) => {
  console.log('DEBUG /createPage body:', req.body);

  const { title, content } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: 'title and content are required' });
  }

  try {
    // Confluence REST endpoint
    const apiUrl = `${CONFLUENCE_URL}/rest/api/content`;
    // Basic Auth
    const authString = Buffer.from(`${CONFLUENCE_USERNAME}:${CONFLUENCE_TOKEN}`).toString('base64');

    // 이 시나리오에서는 "wiki" representation 사용 → Confluence 구버전 문법에 맞춤
    // (Cloud에서도 어느 정도 호환, 그러나 최신은 storage=HTML 권장)
    // 필요시 "storage" + HTML로 해도 됨.
    const requestBody = {
      type: 'page',
      title,
      space: { key: SPACE_KEY },
      ancestors: [{ id: PARENT_PAGE_ID }],
      body: {
        wiki: {
          value: content, // finalWiki (Confluence wiki markup)
          representation: 'wiki'
        }
      }
    };

    const responseCreate = await axios.post(apiUrl, requestBody, {
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    const createdPage = responseCreate.data;
    const pageId = createdPage.id;
    const pageUrl = `${CONFLUENCE_URL}/spaces/${SPACE_KEY}/pages/${pageId}`;

    return res.json({ pageUrl });
  } catch (error) {
    console.error('Error creating Confluence page:', error.response?.data || error.message);
    return res.status(500).json({
      error: 'Failed to create page',
      details: error.response?.data || error.message
    });
  }
});

// 헬스체크
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`Express server running at http://localhost:${port}`);
});
