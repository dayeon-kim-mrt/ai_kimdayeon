// server/routes/confluenceRoutes.js
const express = require('express');
const axios = require('axios');
const router = express.Router();
const config = require('../config'); // 서버 설정 로드 (Confluence URL, 인증 정보 등)

// === 헬퍼 함수 ===

/**
 * 설정 파일에서 Confluence Base URL을 가져와 마지막 슬래시(/)를 제거하여 반환.
 * @returns {string} 정제된 Confluence Base URL.
 */
const getConfluenceBaseUrl = () => {
  return config.CONFLUENCE_URL.endsWith('/')
    ? config.CONFLUENCE_URL.slice(0, -1) // 마지막 슬래시 제거
    : config.CONFLUENCE_URL;
};

/**
 * 설정 파일에서 Confluence 사용자 이름과 API 토큰을 사용하여
 * Basic Authentication 헤더 문자열을 생성하여 반환.
 * @returns {string} Base64 인코딩된 인증 문자열.
 */
const getAuthString = () => {
  return Buffer.from(`${config.CONFLUENCE_USERNAME}:${config.CONFLUENCE_TOKEN}`).toString('base64');
};

// === API 엔드포인트 정의 ===

/**
 * POST /api/createPage
 * 프론트엔드에서 받은 제목과 위키 마크업 내용으로 Confluence 페이지 생성을 요청.
 * Confluence REST API(/rest/api/content)를 직접 호출.
 */
router.post('/createPage', async (req, res) => {
  const { title, content } = req.body; // 요청 본문에서 제목과 내용 추출

  // 입력 유효성 검사
  if (!title || !content) {
    return res.status(400).json({ error: 'title and content are required' });
  }

  try {
    const base = getConfluenceBaseUrl(); // Confluence Base URL 가져오기
    const apiUrl = `${base}/rest/api/content`; // Confluence 페이지 생성 API 엔드포인트
    const authString = getAuthString(); // 인증 문자열 가져오기

    // Confluence API 요청 본문 구성
    const requestBody = {
      type: 'page', // 생성할 타입: 페이지
      title, // 페이지 제목
      space: { key: config.SPACE_KEY }, // 페이지를 생성할 스페이스 키 (설정 파일)
      ancestors: [{ id: config.PARENT_PAGE_ID }], // 부모 페이지 ID (설정 파일)
      body: {
        wiki: { // 위키 마크업 형식으로 본문 저장
          value: content, // 실제 본문 내용
          representation: 'wiki'
        }
      }
    };

    // Confluence API 호출 (axios 사용)
    const responseCreate = await axios.post(apiUrl, requestBody, {
      headers: {
        'Authorization': `Basic ${authString}`, // Basic 인증 헤더
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    // 페이지 생성 성공 시 응답 처리
    const createdPage = responseCreate.data;
    const pageId = createdPage.id; // 생성된 페이지 ID
    const spaceKey = createdPage.space?.key || config.SPACE_KEY; // 응답의 스페이스 키 우선 사용
    // 생성된 페이지의 전체 URL 구성
    const pageUrl = `${base}/spaces/${spaceKey}/pages/${pageId}`;

    // 프론트엔드에 페이지 URL 응답
    res.json({ pageUrl });

  } catch (error) {
    // 오류 처리 및 로깅
    console.error('Error creating Confluence page:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to create page',
      details: error.response?.data || error.message
    });
  }
});

/**
 * POST /api/getPageTitles
 * 프론트엔드에서 받은 Confluence Page ID 배열로 각 페이지의 제목, URL, 본문 내용을 조회하여 반환.
 * 각 ID에 대해 Confluence REST API(/rest/api/content/{id})를 병렬로 호출.
 */
router.post('/getPageTitles', async (req, res) => {
  const { pageIds } = req.body; // 요청 본문에서 페이지 ID 배열 추출

  // 입력 유효성 검사
  if (!Array.isArray(pageIds) || pageIds.length === 0) {
    return res.status(400).json({ error: 'pageIds must be a non-empty array' });
  }

  try {
    const base = getConfluenceBaseUrl();
    const authString = getAuthString();
    const headers = { // 공통 요청 헤더
      'Authorization': `Basic ${authString}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    // 각 Page ID에 대해 Confluence API 호출 Promise 생성
    const pagePromises = pageIds.map(id => 
      // 개별 페이지 조회 API 호출 (expand=body.view 로 본문 내용 포함)
      axios.get(`${base}/rest/api/content/${id}?expand=body.view`, { headers })
        .then(response => {
          // 성공 시 필요한 정보 추출 및 가공
          const pageData = response.data;
          const pageId = pageData.id;
          const spaceKey = pageData.space?.key || config.SPACE_KEY;
          const pageUrl = `${base}/spaces/${spaceKey}/pages/${pageId}`;
          const content = pageData.body?.view?.value || ''; // 본문 내용 (HTML)
          return {
            title: pageData.title || `제목 없음 (ID: ${id})`,
            url: pageUrl,
            content: content
          };
        })
        .catch(error => {
          // 개별 호출 실패 시 경고 로그 남기고 null 반환
          console.warn(`Failed to fetch page ID ${id}:`, error.response?.status || error.message);
          return null;
        })
    );

    // 모든 Promise가 완료될 때까지 대기 (병렬 처리)
    const results = await Promise.all(pagePromises);
    // 성공적으로 조회된 페이지만 필터링 (null 제외)
    const pages = results.filter(page => page !== null);

    // 프론트엔드에 페이지 정보 배열 응답
    res.json({ pages });

  } catch (error) {
    // 전체 로직 오류 처리 및 로깅
    console.error('Error fetching page titles/content:', error.message);
    res.status(500).json({ error: 'Failed to fetch page titles/content', details: error.message });
  }
});

/**
 * GET /api/getTodayConfluencePages
 * 오늘 생성 또는 수정된 Confluence 페이지 ID 목록을 검색하여 반환.
 * Confluence REST API(/rest/api/search)를 사용하여 CQL 쿼리로 검색.
 */
router.get('/getTodayConfluencePages', async (req, res) => {
  try {
    // 오늘 날짜 (YYYY-MM-DD 형식) 계산 로직 다시 활성화
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const todayFormatted = `${year}-${month}-${day}`;

    const confluenceBaseUrl = getConfluenceBaseUrl();

    // Confluence 검색 쿼리 (CQL) - 다시 날짜 문자열 비교 사용
    const cqlRaw = `type=page AND space.key="${config.SPACE_KEY}" AND lastModified >= "${todayFormatted}"`; 
    // const cqlRaw = `type=page AND space.key="${config.SPACE_KEY}" AND lastModified >= startOfDay()`; // startOfDay() 주석 처리
    console.log(`Executing Confluence Search CQL: ${cqlRaw}`);

    const cql = encodeURIComponent(cqlRaw);
    const url = `${confluenceBaseUrl}/rest/api/search?cql=${cql}&limit=50`; 
    console.log(`Final Confluence search URL: ${url}`);

    const authString = getAuthString();
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    console.log(`Confluence search returned ${response.data.results.length} results.`);
    
    const pageIds = response.data.results.map(result => result.content.id);

    res.json({ pageIds });
    
  } catch (error) {
    console.error('Error fetching today Confluence page IDs:', error.response ? error.response.data : error.message);
    res.status(500).json({
      error: 'Failed to fetch today Confluence page IDs',
      details: error.response ? JSON.stringify(error.response.data) : error.message
    });
  }
});

/**
 * POST /api/createWikiPageFromSource
 * SRT 파일 내용과 구글 드라이브 링크를 받아 Confluence 페이지 생성을 조율합니다.
 * 내부적으로 제목 생성 -> 내용 요약 -> 페이지 생성을 순차적으로 호출합니다.
 */
router.post('/createWikiPageFromSource', async (req, res) => {
  const { srtContent, driveLink } = req.body;
  console.log(`[POST /api/createWikiPageFromSource] Received request.`);

  if (!srtContent || !driveLink) {
    return res.status(400).json({ error: 'srtContent and driveLink are required.' });
  }

  try {
    // 1. 제목 생성 API 호출 (경로 수정: generateTitle -> makeTitle)
    console.log(`[POST /api/createWikiPageFromSource] Generating title...`);
    // 요청 본문의 키 이름도 /makeTitle 에 맞춰 prompt 로 변경
    const titleResponse = await axios.post(`http://localhost:${config.PORT}/api/makeTitle`, { prompt: srtContent });
    const title = titleResponse.data.title;
    if (!title) throw new Error('Failed to generate title.');
    console.log(`[POST /api/createWikiPageFromSource] Title generated: ${title}`);

    // 2. 내용 요약 API 호출 (경로 및 키 이름 확인 필요 -> /chunkSummarize, script 키 사용 - 변경 없음)
    console.log(`[POST /api/createWikiPageFromSource] Summarizing content...`);
    const summaryResponse = await axios.post(`http://localhost:${config.PORT}/api/chunkSummarize`, { script: srtContent });
    let summarizedContent = summaryResponse.data.summary;
    // chunkSummarize는 wikiContent를 반환하므로 키 이름 확인 및 수정 필요
    if (summaryResponse.data.wikiContent) {
        summarizedContent = summaryResponse.data.wikiContent;
    } else if (!summarizedContent) {
        throw new Error('Failed to summarize content or get wikiContent.');
    }
    console.log(`[POST /api/createWikiPageFromSource] Content summarized.`);

    // 3. 드라이브 링크 추가 (변경 없음)
    const finalContent = `h3. 구글 드라이브 링크:\n🔗 ${driveLink}\n\n${summarizedContent}`;
    console.log(`[POST /api/createWikiPageFromSource] Final content prepared.`);

    // 4. Confluence 페이지 생성 API 호출 (변경 없음, 단 응답에서 URL 키 확인 필요 -> pageUrl 사용)
    console.log(`[POST /api/createWikiPageFromSource] Creating Confluence page...`);
    const createPageResponse = await axios.post(`http://localhost:${config.PORT}/api/createPage`, { title, content: finalContent });
    const pageUrl = createPageResponse.data?.pageUrl; // createPage 응답 키 확인 -> pageUrl 사용
    if (!pageUrl) throw new Error('Failed to create Confluence page or get URL.');
    console.log(`[POST /api/createWikiPageFromSource] Confluence page created: ${pageUrl}`);

    // 5. 성공 응답 (페이지 URL 반환)
    res.json({ pageUrl: pageUrl });

  } catch (error) {
    console.error(`[POST /api/createWikiPageFromSource] Workflow failed:`, error.response?.data || error.message || error);
    const errorMessage = error.response?.data?.error || error.message || 'Wiki page creation workflow failed.';
    res.status(500).json({ error: errorMessage });
  }
});

// 이 라우터 모듈을 export
module.exports = router;
