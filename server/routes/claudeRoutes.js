// server/routes/claudeRoutes.js
const express = require('express');
const axios = require('axios');
const router = express.Router();
const config = require('../config');

// Claude 호출 헬퍼 함수
async function callClaude(prompt, maxTokens = 3000) {
  const ANTHROPIC_MESSAGES_API_URL = 'https://api.anthropic.com/v1/messages';
  const DEFAULT_MODEL = 'claude-3-7-sonnet-20250219';

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

// 스크립트를 일정 길이로 분할하는 함수
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

// 1) POST /api/makeTitle : 제목(30자 내외) 요약
router.post('/makeTitle', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'prompt is required' });
  }

  try {
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
    res.json({ title });
  } catch (err) {
    console.error('Error calling /api/makeTitle:', err.response?.data || err.message);
    res.status(500).json({ error: 'Error calling makeTitle', details: err.message });
  }
});

// 2) POST /api/chunkSummarize : 긴 스크립트 → 부분 요약 → 최종 Confluence Wiki Markup
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

    const combined = partialSummaries.join('\n\n');
    const finalPrompt = `
아래는 여러 Chunk 요약들을 합친 내용입니다:

${combined}

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
    console.error('Error in /api/chunkSummarize:', err.response?.data || err.message);
    res.status(500).json({ error: 'Chunk Summarize failed', details: err.message });
  }
});

// 3) POST /api/generateSummary : 주어진 텍스트를 짧고 친근하게 요약
router.post('/generateSummary', async (req, res) => {
  const { textContent } = req.body;
  if (!textContent) {
    return res.status(400).json({ error: 'textContent is required' });
  }

  // HTML 태그 제거 및 공백 정리
  const cleanText = textContent.replace(/<\/?[^>]+(>|$)/g, "").trim();
  if (!cleanText) {
    return res.json({ summary: "" }); // 내용이 없으면 빈 요약 반환
  }

  const prompt = `다음 내용을 1-2문장의 친근한 어조로 자연스럽게 요약해 주세요. 문장은 완전하게 마무리되어야 합니다.\n\n내용:\n${cleanText}\n\n요약:`;

  try {
    // claude 호출 (maxTokens 줄임)
    const summary = await callClaude(prompt, 300);
    res.json({ summary: summary.trim() });
  } catch (err) {
    console.error('Error generating summary:', err.response?.data || err.message);
    // 오류 발생 시 원본 텍스트 일부를 대체 요약으로 사용 (선택적)
    let fallback = cleanText.slice(0, 150);
    if (fallback.length > 0 && !fallback.endsWith('.')) {
      fallback += '...';
    }
    res.status(500).json({ error: 'Summary generation failed', fallbackSummary: fallback });
  }
});

// 4) POST /api/generateSlackElements : 페이지 제목/요약 기반으로 동적 Slack 이모지 및 마무리 멘트 생성
router.post('/generateSlackElements', async (req, res) => {
  const { pages } = req.body; // pages: [{ title: string, summary: string }]

  // 입력 유효성 검사
  if (!Array.isArray(pages) || pages.length === 0) {
    return res.status(400).json({ error: 'pages must be a non-empty array' });
  }

  // Claude 호출 실패 또는 파싱/검증 실패 시 반환될 기본 응답
  const defaultResponse = {
    emojis: pages.map(() => ({ emoji: ':page_facing_up:' })),
    closingRemark: '내용을 확인해주세요.'
  };

  // Claude에게 전달할 프롬프트 구성 (페이지 정보 포함)
  let pageDescriptions = pages.map((p, i) => `${i + 1}. 제목: ${p.title}\n   요약: ${p.summary || '(요약 없음)'}`).join('\n\n');
  const prompt = `
다음은 여러 Confluence 페이지의 제목과 요약입니다.

${pageDescriptions}

각 페이지 내용과 가장 잘 어울리는 *단 하나의* 표준 Slack 이모지를 추천해주세요. (예: :rocket:, :chart_with_upwards_trend:, :gear:, :bulb:, :speech_balloon:, :book:, :tada:, :movie_camera: 등)
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
    // Claude API 호출
    const claudeResponseText = await callClaude(prompt, 500 + pages.length * 50);

    let parsedResult = defaultResponse; // 결과 변수를 기본값으로 초기화
    let potentialJsonString = null; // 추출된 JSON 문자열 저장 변수

    try {
      const trimmedResponse = claudeResponseText.trim();

      // 1. JSON 블록 추출 시도 (```json 마커 사용)
      const startIndex = trimmedResponse.indexOf("```json");
      const endIndex = trimmedResponse.lastIndexOf("```");

      if (startIndex !== -1 && endIndex > startIndex) {
        // 마커 사이의 내용 추출
        potentialJsonString = trimmedResponse.substring(startIndex + 7, endIndex).trim();
      } else if (trimmedResponse.startsWith('{') && trimmedResponse.endsWith('}')) {
        // 2. 마커 없으면 전체 응답이 JSON 객체 형태인지 확인
        potentialJsonString = trimmedResponse;
      } else {
        // JSON 블록 못 찾음 - 로그만 남기고 기본값 사용
        console.warn("Could not find valid JSON block in Claude response. Using default response.");
      }

      // 3. JSON 파싱 및 검증 (추출된 문자열이 있을 경우에만 시도)
      if (potentialJsonString) {
        const tempParsed = JSON.parse(potentialJsonString); // 파싱 시도

        // 4. 파싱된 결과의 구조 및 타입 검증
        if (tempParsed && typeof tempParsed === 'object' &&
            Array.isArray(tempParsed.emojis) &&
            typeof tempParsed.closingRemark === 'string' &&
            tempParsed.emojis.length === pages.length) {
          // 5. 각 이모지 형식 검증 (:name: 형태 확인)
          const validEmojis = tempParsed.emojis.map((item) => {
            const emojiString = item && item.emoji;
            if (typeof emojiString === 'string' && /^:[a-zA-Z0-9_+-]+:$/.test(emojiString)) {
              return { emoji: emojiString };
            } else {
              // 잘못된 형식은 기본값으로 대체
              console.warn(`Invalid emoji format: ${emojiString}. Using default :question:`);
              return { emoji: ':question:' };
            }
          });

          // 6. 모든 검증 통과 -> 실제 파싱된 결과 사용
          parsedResult = {
            emojis: validEmojis,
            closingRemark: tempParsed.closingRemark
          };
          console.log("Successfully parsed and validated Slack elements from Claude."); // 성공 로그는 유지
        } else {
          // 구조/타입/개수 불일치 - 로그 남기고 기본값 사용
          console.warn("Parsed JSON structure/type invalid or emoji count mismatch. Using default response.");
        }
      }
    } catch (parseError) {
      // JSON.parse 자체에서 오류 발생 시 - 로그 남기고 기본값 사용
      console.error('Error during JSON.parse:', parseError.message, 'Attempted to parse string:', potentialJsonString);
      // console.error("Full Claude Response on Parse Error:", claudeResponseText); // 상세 로그는 필요시 주석 해제
    }

    // 최종 결과 반환 (성공 시 파싱된 값, 실패 시 기본값)
    res.json(parsedResult);
  } catch (apiError) {
    // callClaude API 호출 자체 실패 시 - 로그 남기고 기본값 반환
    console.error('Error calling Claude API for Slack elements:', apiError.message);
    res.status(500).json({ ...defaultResponse, error: 'Failed to generate Slack elements via API call' });
  }
});

module.exports = router;
    