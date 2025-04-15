// server/routes/confluenceRoutes.js
const express = require('express');
const axios = require('axios');
const router = express.Router();
const config = require('../config');

// Helper to get Confluence API base URL
const getConfluenceBaseUrl = () => {
  return config.CONFLUENCE_URL.endsWith('/')
    ? config.CONFLUENCE_URL.slice(0, -1)
    : config.CONFLUENCE_URL;
};

// Helper to get Auth string
const getAuthString = () => {
  return Buffer.from(`${config.CONFLUENCE_USERNAME}:${config.CONFLUENCE_TOKEN}`).toString('base64');
};

// POST /api/createPage : Confluence REST API (wiki representation)
router.post('/createPage', async (req, res) => {
  console.log('DEBUG /createPage body:', req.body);
  const { title, content } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: 'title and content are required' });
  }

  try {
    const base = getConfluenceBaseUrl();
    const apiUrl = `${base}/rest/api/content`;
    const authString = getAuthString();

    const requestBody = {
      type: 'page',
      title,
      space: { key: config.SPACE_KEY },
      ancestors: [{ id: config.PARENT_PAGE_ID }],
      body: {
        wiki: {
          value: content,
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
    // Confluence Cloud는 응답에 webui 링크가 없을 수 있으므로 수동 생성
    const pageId = createdPage.id;
    const spaceKey = createdPage.space?.key || config.SPACE_KEY; // 응답의 space key 우선 사용
    const pageUrl = `${base}/spaces/${spaceKey}/pages/${pageId}`;

    res.json({ pageUrl });
  } catch (error) {
    console.error('Error creating Confluence page:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to create page',
      details: error.response?.data || error.message
    });
  }
});

// POST /api/getPageTitles : 여러 Page ID로 제목, URL, 내용 가져오기
router.post('/getPageTitles', async (req, res) => {
  const { pageIds } = req.body;

  if (!Array.isArray(pageIds) || pageIds.length === 0) {
    return res.status(400).json({ error: 'pageIds must be a non-empty array' });
  }

  try {
    const base = getConfluenceBaseUrl();
    const authString = getAuthString();
    const headers = {
      'Authorization': `Basic ${authString}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    // 각 Page ID에 대해 Confluence API 호출 (병렬 처리), 내용 포함 (expand=body.view)
    const pagePromises = pageIds.map(id => 
      // expand 파라미터 추가
      axios.get(`${base}/rest/api/content/${id}?expand=body.view`, { headers })
        .then(response => {
          const pageData = response.data;
          const pageId = pageData.id;
          const spaceKey = pageData.space?.key || config.SPACE_KEY;
          const pageUrl = `${base}/spaces/${spaceKey}/pages/${pageId}`;
          // content 필드 추가 (HTML 형태)
          const content = pageData.body?.view?.value || ''; 
          return {
            title: pageData.title || `제목 없음 (ID: ${id})`,
            url: pageUrl,
            content: content // 페이지 본문 내용 추가
          };
        })
        .catch(error => {
          console.warn(`Failed to fetch page ID ${id}:`, error.response?.status || error.message);
          return null;
        })
    );

    const results = await Promise.all(pagePromises);
    const pages = results.filter(page => page !== null);

    res.json({ pages });

  } catch (error) {
    console.error('Error fetching page titles/content:', error.message);
    res.status(500).json({ error: 'Failed to fetch page titles/content', details: error.message });
  }
});

module.exports = router;
