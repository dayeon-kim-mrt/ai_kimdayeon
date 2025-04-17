// server/routes/slackPreview.js
const express = require('express');
const axios = require('axios');
const router = express.Router();
const config = require('../config');
// const { parsePageIdFromUrl } = require('../utils'); // 더 이상 필요 없으므로 제거
// claudeRoutes.js에서 직접 callClaude 가져오는 대신, 필요하면 generateSummary API 호출
// const { callClaude } = require('./claudeRoutes');

// --- 유틸리티 함수 추가 --- 
/**
 * Confluence URL에서 Page ID를 추출하는 함수.
 */
function parsePageIdFromUrl(url) {
  if (!url) return null;
  try {
    const urlObject = new URL(url);
    const match = urlObject.pathname.match(/\/pages\/(\d+)/);
    return (match && match[1]) ? match[1] : null;
  } catch (error) {
    console.error(`Error parsing URL ${url}:`, error);
    return null;
  }
}

// --- 내부 API 호출 헬퍼 ---

// 페이지 ID 목록으로 페이지 상세 정보(제목, 내용, URL) 가져오기
async function getPageDetailsByIds(pageIds) {
  if (!pageIds || pageIds.length === 0) return [];
  try {
    console.log(`[getPageDetailsByIds] Fetching details for IDs: ${pageIds.join(', ')}`);
    const response = await axios.post(`http://localhost:${config.PORT}/api/getPageTitles`, { pageIds });
    // API 응답 형식 { pages: [{ title, url, content }] } 예상
    console.log(`[getPageDetailsByIds] Received ${response.data?.pages?.length || 0} page details.`);
    return response.data?.pages || [];
  } catch (err) {
    console.error(`[getPageDetailsByIds] Error fetching page details:`, err.response?.data || err.message);
    throw new Error(`페이지 상세 정보를 가져오는 데 실패했습니다.`);
  }
}

// 주어진 텍스트 콘텐츠 요약 생성
async function generateSummary(textContent) {
  // 디버깅 로그 추가: 함수 시작 및 원본 content 확인
  console.log(`[generateSummary] Function called. Received textContent length: ${textContent?.length || 0}`); 
  if (!textContent) {
    console.log(`[generateSummary] textContent is empty or null.`);
    return "";
  }
  // HTML 태그 제거 등 간단한 전처리 (필요시)
  const cleanText = textContent.replace(/<[^>]+>/g, "").replace(/\s+/g, ' ').trim();
  // 디버깅 로그 추가: 전처리된 텍스트 확인
  console.log(`[generateSummary] Clean text length: ${cleanText.length}, starting with: "${cleanText.slice(0, 50)}..."`); 
  if (!cleanText) {
      console.log(`[generateSummary] Clean text is empty, skipping API call.`);
      return "";
  }

  try {
    // 디버깅 로그 추가: API 호출 직전
    console.log(`[generateSummary] Calling /api/generateSummary endpoint...`);
    const response = await axios.post(`http://localhost:${config.PORT}/api/generateSummary`, { textContent: cleanText });
    // 디버깅 로그 추가: API 응답 확인
    console.log(`[generateSummary] Received summary: "${response.data?.summary?.slice(0, 50)}..."`);
    return response.data.summary || "";
  } catch (err) {
    // 디버깅 로그 추가: API 호출 에러
    console.error(`[generateSummary] Error calling generateSummary API:`, err.response?.data || err.message);
    return "(요약 생성 실패)"; // 실패 시 대체 텍스트
  }
}

// 페이지 정보 목록으로 슬랙 이모지 및 마무리 멘트 생성
async function generateSlackElements(pagesForElements) {
  if (!pagesForElements || pagesForElements.length === 0) {
      return { emojis: [], closingRemark: '내용을 확인해주세요.' };
  }
  try {
    const response = await axios.post(`http://localhost:${config.PORT}/api/generateSlackElements`, { pages: pagesForElements });
    return response.data; // { emojis: [{emoji: string}], closingRemark: string }
  } catch (err) {
    console.error(`[generateSlackElements] Error calling generateSlackElements API:`, err.response?.data || err.message);
    return { // 오류 시 기본값
      emojis: pagesForElements.map(() => ({ emoji: ':page_facing_up:' })),
      closingRemark: '내용을 확인해주세요.'
    };
  }
}

// --- 핵심 로직: 슬랙 메시지 생성 (내부 헬퍼) ---
/**
 * 페이지 정보 배열과 today 플래그를 기반으로 최종 Slack 메시지 문자열을 생성합니다.
 * @param {Array<{title: string, content: string, url: string}>} pages - 페이지 정보 배열
 * @param {boolean} isToday - 오늘 생성된 페이지 기반인지 여부 
 * @returns {Promise<string>} 생성된 Slack 메시지 문자열
 */
async function composeSlackMessageInternal(pages, isToday) { 
  if (!pages || pages.length === 0) {
    // isToday 값과 관계없이 적절한 메시지 반환 (예: 페이지 없음)
    return `Slack 메시지를 생성할 페이지 정보가 없습니다.`; 
  }

  console.log(`[composeSlackMessageInternal] Composing message for ${pages.length} pages. isToday: ${isToday}`);

  try {
    // 1. 각 페이지 콘텐츠에 대한 요약 생성 (병렬 처리)
    console.log(`[composeSlackMessageInternal] Generating summaries...`);
    const summaryPromises = pages.map(page => {
      // 디버깅 로그 추가: generateSummary에 전달되는 content 타입 및 값 확인
      console.log(`[composeSlackMessageInternal] Calling generateSummary for page "${page.title}". Content type: ${typeof page.content}, Length: ${page.content?.length || 0}`);
      // console.log(`[composeSlackMessageInternal] Content sample: ${String(page.content).slice(0, 100)}...`); // 필요시 내용 샘플 로깅
      return generateSummary(page.content);
    });
    const summaries = await Promise.all(summaryPromises);
    console.log(`[composeSlackMessageInternal] Summaries generated: ${summaries.length}`);

    // 2. 슬랙 요소(이모지, 마무리멘트) 생성을 위한 데이터 준비 (페이지 제목 + 생성된 요약)
    const pagesForElements = pages.map((page, index) => ({
      title: page.title,
      summary: summaries[index] || '(요약 없음)' // 요약 실패 시 대체 텍스트 사용
    }));

    // 3. 슬랙 요소 생성 API 호출
    console.log(`[composeSlackMessageInternal] Generating Slack elements...`);
    const { emojis, closingRemark } = await generateSlackElements(pagesForElements);
    console.log(`[composeSlackMessageInternal] Slack elements generated.`);

    // 4. 최종 메시지 조합
    // isToday 값과 관계없이 항상 동일한 시작 메시지 사용
    let message = `:mega: *모두의 AI 영상이 업로드 되었어요~*\n\n`; 

    pages.forEach((page, index) => {
      const emoji = emojis[index]?.emoji || ':page_facing_up:';
      const summary = summaries[index] || '(요약)';
      message += `${emoji} *${page.title}*\n`;
      message += `${summary}\n`;
      message += `<${page.url}>\n\n`;
    });

    message += `${closingRemark}\n`;

    console.log(`[composeSlackMessageInternal] Final message composed.`);
    return message;

  } catch (error) {
    console.error(`[composeSlackMessageInternal] Error during message composition:`, error);
    return `슬랙 메시지를 생성하는 중 오류가 발생했습니다.`;
  }
}

// --- 엔드포인트 ---

/**
 * POST /api/generateSlackPreview (통합 엔드포인트)
 * 요청 본문에 따라 오늘의 페이지 또는 지정된 URL의 페이지 기반으로 Slack 미리보기 생성
 * 요청 본문 예시:
 *  - Today 케이스: { "today": true }
 *  - Manual 케이스: { "pageUrls": ["https://.../123", "https://.../456"] }
 */
router.post('/generateSlackPreview', async (req, res) => {
  const { today, pageUrls } = req.body; // pageIds -> pageUrls
  let isTodayRequest = !!today;
  let finalPageIds = [];

  console.log(`[POST /api/generateSlackPreview] Request received. today: ${isTodayRequest}, pageUrls provided: ${Array.isArray(pageUrls)}`);

  try {
    if (isTodayRequest) {
      // Today 케이스: 오늘 페이지 ID 목록 가져오기
      console.log(`[POST /api/generateSlackPreview] Handling 'today' request. Fetching today's page IDs...`);
      const idResponse = await axios.get(`http://localhost:${config.PORT}/api/getTodayConfluencePages`);
      finalPageIds = idResponse.data?.pageIds || [];
      console.log(`[POST /api/generateSlackPreview] Fetched ${finalPageIds.length} page IDs for today.`);
      if (finalPageIds.length === 0) {
        return res.json({ slackPreview: "오늘 업데이트된 페이지가 없습니다." });
      }
    } else if (Array.isArray(pageUrls) && pageUrls.length > 0) {
      // Manual 케이스: 제공된 pageUrls에서 ID 추출
      console.log(`[POST /api/generateSlackPreview] Handling 'manual' request with ${pageUrls.length} URLs.`);
      finalPageIds = pageUrls
        .map(parsePageIdFromUrl) // URL 파싱 함수 사용
        .filter(id => id !== null); // 유효한 ID만 필터링
      console.log(`[POST /api/generateSlackPreview] Extracted ${finalPageIds.length} valid page IDs from URLs.`);
      if (finalPageIds.length === 0) {
          return res.status(400).json({ error: `제공된 URL에서 유효한 Confluence 페이지 ID를 찾을 수 없습니다.` });
      }
    } else {
      // 잘못된 요청 처리
      console.log(`[POST /api/generateSlackPreview] Invalid request body. Either 'today: true' or a non-empty 'pageUrls' array is required.`);
      return res.status(400).json({ error: `'today: true' 또는 유효한 'pageUrls' 배열이 요청 본문에 필요합니다.` });
    }

    // 페이지 상세 정보 조회 (공통 로직)
    console.log(`[POST /api/generateSlackPreview] Fetching page details for ${finalPageIds.length} IDs...`);
    const pages = await getPageDetailsByIds(finalPageIds);
    console.log(`[POST /api/generateSlackPreview] Fetched details for ${pages?.length || 0} pages.`);

    if (!pages || pages.length === 0) {
      throw new Error(isTodayRequest ? `오늘 페이지의 상세 정보를 가져오지 못했습니다.` : `제공된 ID에 해당하는 페이지 상세 정보를 가져오지 못했습니다.`);
    }

    // 슬랙 메시지 생성 (공통 로직)
    const slackPreviewMessage = await composeSlackMessageInternal(pages, isTodayRequest);

    // 최종 응답
    res.json({ slackPreview: slackPreviewMessage });

  } catch (error) {
    console.error(`[POST /api/generateSlackPreview] Error:`, error.message || error);
    res.status(500).json({ error: `Slack 미리보기 생성 실패`, details: error.message });
  }
});

/**
 * POST /api/sendSlackMessage
 * Slack 메시지를 Bot Token과 Channel ID를 사용하여 전송 (chat.postMessage API 사용)
 */
router.post('/sendSlackMessage', async (req, res) => {
  const { slackMessage } = req.body;
  console.log('[POST /api/sendSlackMessage] Received request to send message using Bot Token.');

  if (!slackMessage) {
    console.log('[POST /api/sendSlackMessage] Error: No message provided.');
    return res.status(400).json({ error: '전송할 메시지가 없습니다.' });
  }

  // 설정 값 확인 (Bot Token, Channel ID)
  const token = config.SLACK_BOT_TOKEN;
  const channel = config.SLACK_CHANNEL_ID;
  if (!token || !channel) {
    console.error('[POST /api/sendSlackMessage] Error: Slack Bot Token or Channel ID not configured.');
    return res.status(500).json({ error: 'Slack Bot Token 또는 Channel ID가 서버에 설정되지 않았습니다.' });
  }

  const slackApiUrl = 'https://slack.com/api/chat.postMessage';

  try {
    // 메시지 전송 전에 <!here> 추가
    const messageText = `<!here> ${slackMessage}`;
    
    console.log(`[POST /api/sendSlackMessage] Sending message to channel ${channel} via chat.postMessage...`);
    
    // Slack API 호출 (chat.postMessage 사용)
    const response = await axios.post(slackApiUrl, {
      channel: channel, // 채널 ID 사용
      text: messageText, // 메시지 내용
      link_names: 1 // @here 같은 멘션 활성화 위해 추가
      // 만약 블록 키트를 사용한다면 text 대신 blocks 필드를 사용해야 할 수 있습니다.
    }, {
      headers: {
        'Authorization': `Bearer ${token}`, // Bot Token 사용
        'Content-Type': 'application/json; charset=utf-8'
      }
    });

    // Slack API 응답 확인
    if (!response.data.ok) {
      console.error(`[POST /api/sendSlackMessage] Slack API Error:`, response.data);
      throw new Error(`Slack API Error: ${response.data.error}`);
    }
    
    console.log('[POST /api/sendSlackMessage] Message sent successfully via chat.postMessage.');
    res.json({ message: 'Slack 메시지 전송 완료', slackResponse: response.data });

  } catch (error) {
    console.error('[POST /api/sendSlackMessage] Error sending message to Slack:', error.message || error);
    res.status(500).json({ error: 'Slack 메시지 전송 실패', details: error.message });
  }
});

module.exports = router;
