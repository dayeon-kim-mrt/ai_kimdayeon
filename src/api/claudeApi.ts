import axios from 'axios';

const BASE_URL = process.env.REACT_APP_CLAUDE_API_BASE_URL;

/** 
 * /api/makeTitle : 30자 이내 한국어 제목
 */
export async function generateWikiPageTitle(script: string): Promise<string> {
  if (!BASE_URL) throw new Error('API base URL not set');
  const resp = await axios.post(`${BASE_URL}/makeTitle`, { prompt: script });
  return resp.data.title;
}

/**
 * /api/chunkSummarize : 긴 스크립트 → Chunk 요약 → 최종 Confluence wiki
 */
export async function chunkSummarizeScript(script: string): Promise<string> {
  if (!BASE_URL) throw new Error('API base URL not set');
  const resp = await axios.post(`${BASE_URL}/chunkSummarize`, { script });
  return resp.data.wikiContent; // Confluence wiki markup
}

/**
 * /api/createPage : 위키 생성
 */
export async function createConfluencePage(title: string, content: string): Promise<string> {
  if (!BASE_URL) throw new Error('API base URL not set');
  const resp = await axios.post(`${BASE_URL}/createPage`, { title, content });
  return resp.data.pageUrl;
}
