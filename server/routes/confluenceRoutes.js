// server/routes/confluenceRoutes.js
const express = require('express');
const axios = require('axios');
const router = express.Router();
const config = require('../config');

// POST /api/createPage : Confluence REST API (wiki representation)
router.post('/createPage', async (req, res) => {
  console.log('DEBUG /createPage body:', req.body);
  const { title, content } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: 'title and content are required' });
  }

  try {
    const base = config.CONFLUENCE_URL.endsWith('/')
      ? config.CONFLUENCE_URL.slice(0, -1)
      : config.CONFLUENCE_URL;
    const apiUrl = `${base}/rest/api/content`;
    const authString = Buffer.from(`${config.CONFLUENCE_USERNAME}:${config.CONFLUENCE_TOKEN}`).toString('base64');

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
    const pageId = createdPage.id;
    const pageUrl = `${base}/spaces/${config.SPACE_KEY}/pages/${pageId}`;

    res.json({ pageUrl });
  } catch (error) {
    console.error('Error creating Confluence page:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to create page',
      details: error.response?.data || error.message
    });
  }
});

module.exports = router;
