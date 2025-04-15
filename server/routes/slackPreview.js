// server/routes/slackPreview.js
const express = require('express');
const axios = require('axios');
const router = express.Router();
const config = require('../config');
// claudeRoutes.js에서 직접 callClaude 가져오는 대신, 필요하면 generateSummary API 호출
// const { callClaude } = require('./claudeRoutes');

/**
 * 주어진 텍스트를 1-2문장의 친근한 어조로 요약하도록 Claude에 요청합니다.
 * 문장은 완전하게 마무리되어야 합니다.
 */
async function generateFriendlySummary(text) {
  if (!text) return "";
  const cleanText = text.replace(/<[^>]+>/g, "").trim();
  if (!cleanText) return "";

  try {
    // generateSummary API 엔드포인트 호출 (claudeRoutes.js에 정의됨)
    const response = await axios.post(`http://localhost:${config.PORT}/api/generateSummary`, { textContent: cleanText });
    return response.data.summary || "(요약 생성 중 오류)";
  } catch (err) {
    console.error('Error calling generateSummary API:', err.response?.data || err.message);
    // 오류 시 대체 텍스트
    return "(요약)";
  }
}

// **** 추가: 이모지 및 마무리 멘트 생성 API 호출 헬퍼 ****
async function generateSlackElementsApi(pagesForClaude) {
  try {
    // claudeRoutes.js의 /api/generateSlackElements 엔드포인트 호출
    const response = await axios.post(`http://localhost:${config.PORT}/api/generateSlackElements`, { pages: pagesForClaude });
    return response.data; // { emojis: [{emoji: string}], closingRemark: string }
  } catch (err) {
    console.error('Error calling generateSlackElements API:', err.response?.data || err.message);
    // 오류 시 기본값 반환
    return {
      emojis: pagesForClaude.map(() => ({ emoji: ':page_facing_up:' })),
      closingRemark: '내용을 확인해주세요.'
    };
  }
}

/**
 * 각 페이지에 대해 동적 이모지, 제목, 친근 요약, 링크, 동적 마무리 멘트를 포함한 Slack 메시지 텍스트를 구성합니다.
 */
async function composeSlackPreviewMessage(pages) {
  if (!pages || pages.length === 0) {
    return "오늘 업데이트된 페이지가 없습니다.";
  }

  // 1. 각 페이지에 대한 친근한 요약 생성 (병렬)
  const summaryPromises = pages.map(page => generateFriendlySummary(page.summary));
  const summaries = await Promise.all(summaryPromises);

  // 2. Claude 호출을 위한 데이터 준비 (제목 + 생성된 요약)
  const pagesForClaude = pages.map((page, index) => ({
    title: page.title,
    summary: summaries[index] || page.summary // 요약 생성 실패 시 원본 사용 (선택적)
  }));

  // 3. 이모지 및 마무리 멘트 생성 API 호출
  const { emojis, closingRemark } = await generateSlackElementsApi(pagesForClaude);
  // **** 추가: 받은 데이터 로깅 ****
  console.log("[composeSlackPreviewMessage] Received from generateSlackElementsApi - Emojis:", JSON.stringify(emojis, null, 2));
  console.log("[composeSlackPreviewMessage] Received from generateSlackElementsApi - Closing Remark:", closingRemark);

  // 4. 최종 메시지 조합
  let message = ':mega: *이번 주 모두의 AI 발표를 소개합니다~*\n\n';
  pages.forEach((page, index) => {
    const emoji = emojis[index]?.emoji || ':page_facing_up:'; // 동적 이모지 사용, 없으면 기본값
    // **** 추가: 사용될 이모지 로깅 ****
    console.log(`[composeSlackPreviewMessage] Using emoji for page ${index}: ${emoji}`);
    message += `${emoji} *${page.title}*\n`;
    message += `${summaries[index]}\n`; // 생성된 요약 사용
    message += `<${page.pageUrl}>\n\n`;
  });

  message += `${closingRemark}\n`; // 동적 마무리 멘트 사용
  // **** 추가: 최종 생성 메시지 로깅 ****
  console.log("[composeSlackPreviewMessage] Final constructed message:", message);
  return message;
}

// 오늘 Confluence 페이지들을 가져오는 엔드포인트
router.get('/getTodayConfluencePages', async (req, res) => {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const todayFormatted = `${year}-${month}-${day}`; // Confluence CQL 날짜 형식 (YYYY-MM-DD)

    // Confluence Base URL 정리: 마지막 '/' 제거
    const confluenceBaseUrl = config.CONFLUENCE_URL.endsWith('/')
      ? config.CONFLUENCE_URL.slice(0, -1)
      : config.CONFLUENCE_URL;

    // CQL 쿼리 구성 (날짜는 "YYYY-MM-DD" 형식 사용, created 대신 lastModified 사용 가능성 고려)
    // const cqlRaw = `type=page AND space.key="${config.SPACE_KEY}" AND created >= "${todayFormatted} 00:00" AND created <= "${todayFormatted} 23:59"`;
    const cqlRaw = `type=page AND space.key="${config.SPACE_KEY}" AND lastModified >= "${todayFormatted}"`; // 오늘 수정된 내용 기준
    console.log(`Executing Confluence Search CQL: ${cqlRaw}`);

    const cql = encodeURIComponent(cqlRaw);
    // expand=body.storage 추가하여 원본 excerpt 대신 사용 가능한 내용 확보
    const url = `${confluenceBaseUrl}/rest/api/search?cql=${cql}&limit=50&expand=body.storage`;
    console.log(`Final Confluence search URL: ${url}`);

    const authString = Buffer.from(`${config.CONFLUENCE_USERNAME}:${config.CONFLUENCE_TOKEN}`).toString('base64');
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    console.log(`Confluence search returned ${response.data.results.length} results.`);

    // 결과 매핑: 제목, 요약(body.storage에서 추출 시도), URL 추출
    const pages = response.data.results.map(result => {
      const title = result.content.title || "제목 없음";
      const pageId = result.content.id;
      const spaceKey = result.content.space?.key || config.SPACE_KEY;
      const pageUrl = `${confluenceBaseUrl}/spaces/${spaceKey}/pages/${pageId}`;

      // body.storage.value (HTML)에서 텍스트 추출 시도 (간단 버전)
      let summary = "";
      if (result.content.body?.storage?.value) {
        // 매우 기본적인 태그 제거, 실제로는 더 복잡한 파서 필요 가능성 있음
        summary = result.content.body.storage.value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300); // 300자 제한
      }
      if (!summary && result.excerpt) { // storage에서 못가져오면 excerpt 사용
        summary = result.excerpt.replace(/<[^>]+>/g, '').trim();
      }
      if (!summary) {
        summary = "내용 요약 없음";
      }

      return { title, summary, pageUrl };
    });

    res.json({ pages });
  } catch (error) {
    console.error('Error fetching today Confluence pages:', error.response ? error.response.data : error.message);
    res.status(500).json({
      error: 'Failed to fetch today Confluence pages',
      details: error.response ? JSON.stringify(error.response.data) : error.message // 상세 에러 포함
    });
  }
});

// Slack 메시지 미리보기 텍스트 생성 엔드포인트
router.get('/getSlackPreviewMessage', async (req, res) => {
  try {
    // 내부적으로 오늘 Confluence 페이지 정보 조회
    const pagesResponse = await axios.get(`http://localhost:${config.PORT}/api/getTodayConfluencePages`);
    const pages = pagesResponse.data.pages;

    // 수정된 composeSlackPreviewMessage 호출
    const slackPreviewMessage = await composeSlackPreviewMessage(pages);
    res.json({ slackPreview: slackPreviewMessage });
  } catch (error) {
    console.error('Error generating Slack preview message:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Failed to generate Slack preview message', details: error.message });
  }
});

router.post('/sendSlackMessage', async (req, res) => {
  try {
    const { slackMessage } = req.body;
    if (!slackMessage) {
      return res.status(400).json({ error: 'slackMessage is required' });
    }

    const token = config.SLACK_BOT_TOKEN;
    const channel = config.SLACK_CHANNEL_ID;
    const slackApiUrl = 'https://slack.com/api/chat.postMessage';

    const response = await axios.post(slackApiUrl, {
      channel,
      text: slackMessage,
      link_names: 1 // @here 같은 멘션 활성화 위해 추가
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.data.ok) {
      console.error("Slack API responded with an error:", response.data);
      return res.status(500).json({ error: 'Failed to send message to Slack', details: response.data });
    }

    res.json({ message: 'Slack message sent successfully!', slackResponse: response.data });
  } catch (error) {
    console.error('Error sending Slack message:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Failed to send Slack message', details: error.response ? JSON.stringify(error.response.data) : error.message });
  }
});

module.exports = router;
