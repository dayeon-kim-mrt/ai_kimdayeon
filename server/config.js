// server/config.js
require('dotenv').config();

module.exports = {
  CLAUDE_API_KEY: process.env.CLAUDE_API_KEY,
  CONFLUENCE_URL: process.env.CONFLUENCE_URL,
  CONFLUENCE_USERNAME: process.env.CONFLUENCE_USERNAME,
  CONFLUENCE_TOKEN: process.env.CONFLUENCE_TOKEN,
  PORT: process.env.PORT || 3001,
  SPACE_KEY: process.env.SPACE_KEY,
  PARENT_PAGE_ID: '4139942192',
  SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN,     
  SLACK_CHANNEL_ID: process.env.SLACK_CHANNEL_ID       
};
