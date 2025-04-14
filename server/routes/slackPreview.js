// server/routes/slackPreview.js
const express = require('express');
const axios = require('axios');
const router = express.Router();
const config = require('../config');
// callClaude 함수는 claudeRoutes.js에서 export되어야 합니다.
const { callClaude } = require('./claudeRoutes');

/**
 * 주어진 텍스트를 1-2문장의 친근한 어조로 요약하도록 Claude에 요청합니다.
 * 문장은 완전하게 마무리되어야 합니다.
 */
async function generateFriendlySummary(text) {
  if (!text) return "";
  const cleanText = text.replace(/<\/?[^>]+(>|$)/g, "").trim();
  const prompt = `다음 내용을 1-2문장의 친근한 어조로 자연스럽게 요약해 주세요. 문장은 완전하게 마무리되어야 합니다.\n내용: ${cleanText}`;
  try {
    const summary = await callClaude(prompt, 300);
    return summary.trim();
  } catch (err) {
    console.error('Error generating friendly summary:', err.message);
    let fallback = cleanText.slice(0, 200);
    if (!fallback.endsWith('.')) {
      fallback += '.';
    }
    return fallback;
  }
}

/**
 * 각 페이지에 대해 :camera: 이모지, 제목, 친근하게 요약한 문장, 링크를 포함한 Slack 메시지 텍스트를 구성합니다.
 */
async function composeSlackPreviewMessage(pages) {
  let message = ":mega: *이번 주 모두의 AI 발표를 소개합니다~*\n\n";
  
  for (const page of pages) {
    // 고정 :camera: 이모지 사용 및 제목 굵게 표시
    message += `:camera: *${page.title}*\n`;
    // 친근한 요약 생성 요청
    const friendlySummary = await generateFriendlySummary(page.summary);
    message += `${friendlySummary}\n`;
    // 링크: <URL> 형태, 추가 텍스트 없이
    message += `<${page.pageUrl}>\n\n`;
  }
  
  message += ":gift: 오늘 발표해주셔서 감사합니다!\n";
  return message;
}

// 오늘 Confluence 페이지들을 가져오는 엔드포인트
router.get('/getTodayConfluencePages', async (req, res) => {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const todayFormatted = `${year}/${month}/${day}`;  // 예: "2025/04/14"
  
    // Confluence Base URL 정리: 마지막 '/' 제거
    const confluenceBaseUrl = config.CONFLUENCE_URL.endsWith('/')
      ? config.CONFLUENCE_URL.slice(0, -1)
      : config.CONFLUENCE_URL;
  
    // CQL 쿼리 구성 (날짜는 "YYYY/MM/DD" 형식 사용)
    const cqlRaw = `type=page AND space.key="${config.SPACE_KEY}" AND created>="${todayFormatted}" AND created<="${todayFormatted}"`;
    console.log(`CQL raw query: ${cqlRaw}`);
  
    const cql = encodeURIComponent(cqlRaw);
    const url = `${confluenceBaseUrl}/rest/api/search?cql=${cql}&limit=50`;
    console.log(`Final Confluence search URL: ${url}`);
  
    const authString = Buffer.from(`${config.CONFLUENCE_USERNAME}:${config.CONFLUENCE_TOKEN}`).toString('base64');
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/json'
      }
    });
  
    console.log("Raw response data:", response.data);
  
    // 결과 매핑: 결과 객체에서 title, excerpt, url 등을 추출
    const pages = response.data.results.map(result => {
      const title = result.title || "제목 없음";
      let pageId;
      if (result.content && result.content.id) {
        pageId = result.content.id;
      } else if (result.id) {
        pageId = result.id;
      }
  
      let pageUrl = "";
      if (result.url) {
        pageUrl = confluenceBaseUrl + result.url;
      } else if (pageId) {
        pageUrl = `${confluenceBaseUrl}/spaces/${config.SPACE_KEY}/pages/${pageId}`;
      }
  
      let summary = "내용 요약 없음";
      if (result.excerpt) {
        summary = result.excerpt.replace(/<\/?[^>]+(>|$)/g, "");
      }
  
      return { title, summary, pageUrl };
    });
  
    res.json({ pages });
  } catch (error) {
    console.error('Error fetching today Confluence pages:', error.response ? error.response.data : error.message);
    console.error('Detailed error object:', error);
    res.status(500).json({
      error: 'Failed to fetch today Confluence pages',
      details: error.response ? error.response.data : error.message
    });
  }
});

// Slack 메시지 미리보기 텍스트 생성 엔드포인트
router.get('/getSlackPreviewMessage', async (req, res) => {
  try {
    // 내부적으로 오늘 Confluence 페이지 정보 조회
    const pagesResponse = await axios.get(`http://localhost:${config.PORT}/api/getTodayConfluencePages`);
    const pages = pagesResponse.data.pages;
  
    const slackPreviewMessage = await composeSlackPreviewMessage(pages);
    res.json({ slackPreview: slackPreviewMessage });
  } catch (error) {
    console.error('Error generating Slack preview message:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Failed to generate Slack preview message', details: error.message });
  }
});


router.post('/sendSlackMessage', async (req, res) => {
    try {
      console.log("Received POST /sendSlackMessage with body:", req.body);
      const { slackMessage } = req.body;
      if (!slackMessage) {
        console.error("No slackMessage provided in the request body.");
        return res.status(400).json({ error: 'slackMessage is required' });
      }
      
      const token = config.SLACK_BOT_TOKEN;
      const channel = config.SLACK_CHANNEL_ID;
      const slackApiUrl = 'https://slack.com/api/chat.postMessage';
      
      console.log(`Sending Slack message to channel ${channel} via ${slackApiUrl}`);
      console.log("Slack message content:", slackMessage);
      
      // Slack API 호출
      const response = await axios.post(slackApiUrl, {
        channel,
        text: slackMessage,
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log("Slack API response data:", response.data);
      
      if (!response.data.ok) {
        console.error("Slack API responded with an error:", response.data);
        return res.status(500).json({ error: 'Failed to send message to Slack', details: response.data });
      }
      
      res.json({ message: 'Slack message sent successfully!', slackResponse: response.data });
    } catch (error) {
      console.error('Error sending Slack message:', error.response ? error.response.data : error.message);
      res.status(500).json({ error: 'Failed to send Slack message', details: error.response ? error.response.data : error.message });
    }
  });
  
module.exports = router;
