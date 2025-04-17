// server/routes/claudeRoutes.js
const express = require('express');
const axios = require('axios');
const router = express.Router();
const config = require('../config');

/**
 * Anthropic Claude API를 호출하는 공통 헬퍼 함수.
 * 주어진 프롬프트를 사용하여 Claude 모델에게 메시지를 보내고 응답 텍스트를 반환.
 * @param {string} prompt Claude 모델에게 전달할 프롬프트 메시지.
 * @param {number} [maxTokens=3000] 생성할 최대 토큰 수.
 * @returns {Promise<string>} Claude 모델의 응답 텍스트.
 * @throws {Error} API 호출 실패 시 에러 발생.
 */
async function callClaude(prompt, maxTokens = 3000) {
  const ANTHROPIC_MESSAGES_API_URL = 'https://api.anthropic.com/v1/messages';
  const DEFAULT_MODEL = 'claude-3-haiku-20240307';

  const requestBody = {
    model: config.CLAUDE_MODEL || DEFAULT_MODEL,
    max_tokens: maxTokens,
    temperature: 0.7,
    system: "당신은 한국어 문서에 최적화된 전문 작가입니다. 불필요한 '도와드리겠습니다' 같은 문구 없이 깔끔한 최종 텍스트만 작성하세요.",
    messages: [
      { role: 'user', content: prompt }
    ]
  };

  try {
    const response = await axios.post(
      ANTHROPIC_MESSAGES_API_URL,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.CLAUDE_API_KEY,
          'anthropic-version': '2023-06-01'
        }
      }
    );

    const contentArr = response.data.content || [];
    return contentArr.map(obj => obj.text).join('\n');
  } catch (error) {
    console.error('Error calling Claude API:', error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
    throw new Error('Claude API call failed');
  }
}

/**
 * 긴 텍스트 스크립트를 지정된 크기의 청크(chunk)로 분할하는 헬퍼 함수.
 * Claude API의 입력 토큰 제한을 맞추기 위해 사용.
 * @param {string} script 분할할 원본 텍스트 스크립트.
 * @param {number} [chunkSize=4000] 각 청크의 최대 문자 수.
 * @returns {string[]} 분할된 텍스트 청크 배열.
 */
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

// === API 엔드포인트 정의 ===

/**
 * POST /api/makeTitle
 * 프론트엔드에서 받은 스크립트 내용으로 Confluence 페이지 제목(30자 내외) 생성을 Claude에 요청.
 */
router.post('/makeTitle', async (req, res) => {
  const { prompt: scriptContent } = req.body;
  if (!scriptContent) {
    return res.status(400).json({ error: 'script content (prompt) is required' });
  }

  try {
    const finalPrompt = `
다음 스크립트를 보고, 한국어로 된 Confluence 문서 제목을 30자 이내로 만들어주세요.
너무 장황하지 않도록 주의하세요.

스크립트:
${scriptContent}

조건:
- 30자 이내 (한국어 기준)
- 불필요 문구 없이

Assistant:
    `.trim();

    const title = await callClaude(finalPrompt, 500);
    res.json({ title });
  } catch (err) {
    console.error('Error calling /api/makeTitle:', err.message);
    res.status(500).json({ error: 'Error calling makeTitle', details: err.message });
  }
});

/**
 * POST /api/chunkSummarize
 * 프론트엔드에서 받은 긴 스크립트를 청크로 나누어 Claude에 요약을 요청하고,
 * 최종적으로 Confluence 위키 마크업 형식의 본문을 생성하여 반환.
 */
router.post('/chunkSummarize', async (req, res) => {
  const { script } = req.body;
  if (!script) {
    return res.status(400).json({ error: 'script is required' });
  }

  try {
    const chunks = chunkText(script, 4000);
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

    const combinedSummaries = partialSummaries.join('\n\n');
    const finalPrompt = `
아래는 여러 Chunk 요약들을 합친 내용입니다:

${combinedSummaries}

이제 이것을 종합해서, Confluence 위키 마크업으로 최종 본문을 작성해 주세요.

조건:
- h1. 은 최상위 제목
- h2., h3. 등으로 섹션 구분
- 한국어 작성
- 약 800~1200자 정도 (너무 길면 축약)
- "도와드리겠습니다" 같은 표현 없이
- 깔끔하고 전문적인 문체

Assistant:
    `.trim();

    console.log('-- Final compile for Confluence wiki markup');
    const finalWiki = await callClaude(finalPrompt, 3500);
    res.json({ wikiContent: finalWiki });
  } catch (err) {
    console.error('Error in /api/chunkSummarize:', err.message);
    res.status(500).json({ error: 'Chunk Summarize failed', details: err.message });
  }
});

/**
 * POST /api/generateSummary
 * 프론트엔드(또는 다른 백엔드 서비스)에서 받은 텍스트 내용(HTML 포함 가능)에 대해
 * 짧고 친근한 1-2 문장 요약을 Claude에 요청하여 반환.
 */
router.post('/generateSummary', async (req, res) => {
  const { textContent } = req.body;
  if (!textContent) {
    return res.status(400).json({ error: 'textContent is required' });
  }

  const cleanText = textContent.replace(/<[^>]+>/g, "").trim();
  if (!cleanText) {
    console.log('[/api/generateSummary] Clean text is empty, returning empty summary.');
    return res.json({ summary: "" });
  }

  // 프롬프트 수정: "정중한 존댓말" 사용 명시
  const prompt = `다음 내용을 친근한 어조로 자연스럽고 단 한 문장으로, **정중한 존댓말**을 사용하여 요약해 주세요. 문장은 쉼표가 최대 1개 있을 수 있고, 짧고 간결하며, 완전하게 마무리되어야 합니다.\n\n내용:\n${cleanText}\n\n요약:\n`;
  console.log(`[/api/generateSummary] Calling Claude with prompt starting with: "${prompt.slice(0, 100)}..."`);

  try {
    const summary = await callClaude(prompt, 300);
    console.log(`[/api/generateSummary] Received summary from Claude: "${summary?.trim().slice(0, 50)}..."`);
    res.json({ summary: summary.trim() });
  } catch (err) {
    console.error('[/api/generateSummary] Error generating summary:', err.message);
    let fallback = cleanText.slice(0, 150);
    if (fallback.length > 0 && !fallback.endsWith('.')) {
      fallback += '...';
    }
    res.status(500).json({ error: 'Summary generation failed', fallbackSummary: fallback });
  }
});

/**
 * POST /api/generateSlackElements
 * 프론트엔드(또는 다른 백엔드 서비스)에서 받은 페이지 제목/요약 목록을 기반으로
 * 각 페이지에 어울리는 동적 Slack 이모지와 전체 메시지에 대한 마무리 멘트를 Claude에 요청하여 반환.
 */
router.post('/generateSlackElements', async (req, res) => {
  const { pages } = req.body;

  if (!Array.isArray(pages) || pages.length === 0) {
    return res.status(400).json({ error: 'pages must be a non-empty array' });
  }

  const defaultResponse = {
    emojis: pages.map(() => ({ emoji: ':page_facing_up:' })),
    closingRemark: '내용을 확인해주세요.'
  };

  let pageDescriptions = pages.map((p, i) => `${i + 1}. 제목: ${p.title}\n   요약: ${p.summary || '(요약 없음)'}`).join('\n\n');
  const prompt = `
다음은 여러 Confluence 페이지의 제목과 요약입니다.

${pageDescriptions}

각 페이지 내용과 가장 잘 어울리는 **단 하나의 유효한 표준 슬랙 내장 이모지 코드**를 추천해주세요. (예: :rocket:, :chart_with_upwards_trend:, :gear:, :bulb:, :speech_balloon:, :book:, :tada:, :movie_camera: 등). 반드시 **콜론(:)으로 감싸진 형식**이어야 합니다.
그리고 전체 공지 메시지에 어울리는 짧고 자연스러운 *하나의* 마무리 멘트도 한국어로 제안해주세요. (예: "즐거운 하루 보내세요!", "업데이트 확인해보세요~", "유용한 정보가 되었기를 바랍니다.")

결과는 반드시 다음 JSON 형식으로 응답해주세요:
\`\`\`json
{
  "emojis": [
    { "emoji": ":example1:" },
    { "emoji": ":example2:" }
    // ... 페이지 개수만큼
  ],
  "closingRemark": "마무리 멘트 예시입니다."
}
\`\`\`

Assistant:
  `.trim();

  try {
    const claudeResponseText = await callClaude(prompt, 500 + pages.length * 50);

    let parsedResult = defaultResponse;
    let potentialJsonString = null;

    try {
      const trimmedResponse = claudeResponseText.trim();

      const startIndex = trimmedResponse.indexOf("```json");
      const endIndex = trimmedResponse.lastIndexOf("```");

      if (startIndex !== -1 && endIndex > startIndex) {
        potentialJsonString = trimmedResponse.substring(startIndex + 7, endIndex).trim();
      } else if (trimmedResponse.startsWith('{') && trimmedResponse.endsWith('}')) {
        potentialJsonString = trimmedResponse;
      } else {
        console.warn("Could not find valid JSON block in Claude response. Using default response.");
      }

      if (potentialJsonString) {
        const tempParsed = JSON.parse(potentialJsonString);

        if (tempParsed && typeof tempParsed === 'object' &&
            Array.isArray(tempParsed.emojis) &&
            typeof tempParsed.closingRemark === 'string' &&
            tempParsed.emojis.length === pages.length) {
          const validEmojis = tempParsed.emojis.map((item) => {
            const emojiString = item && item.emoji;
            if (typeof emojiString === 'string' && /^:[a-zA-Z0-9_+-]+:$/.test(emojiString)) {
              return { emoji: emojiString };
            } else {
              console.warn(`Invalid emoji format: ${emojiString}. Using default :question:`);
              return { emoji: ':question:' };
            }
          });

          parsedResult = {
            emojis: validEmojis,
            closingRemark: tempParsed.closingRemark
          };
          console.log("Successfully parsed and validated Slack elements from Claude.");
        } else {
          console.warn("Parsed JSON structure/type invalid or emoji count mismatch. Using default response.");
        }
      }
    } catch (parseError) {
      console.error('Error during JSON.parse:', parseError.message, 'Attempted to parse string:', potentialJsonString);
    }

    res.json(parsedResult);
  } catch (apiError) {
    console.error('Error calling Claude API for Slack elements:', apiError.message);
    res.status(500).json({ ...defaultResponse, error: 'Failed to generate Slack elements via API call' });
  }
});

module.exports = router;
    