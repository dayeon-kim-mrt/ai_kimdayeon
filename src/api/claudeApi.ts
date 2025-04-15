//src/api/claudeApi.ts

import axios from 'axios';

const BASE_URL = process.env.REACT_APP_CLAUDE_API_BASE_URL;
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

/** 
 * /api/makeTitle : 30자 이내 한국어 제목
 */
export async function generateWikiPageTitle(script: string): Promise<string> {
  if (!BASE_URL) throw new Error('Claude API base URL not set');
  const resp = await axios.post(`${BASE_URL}/makeTitle`, { prompt: script });
  return resp.data.title;
}

/**
 * /api/chunkSummarize : 긴 스크립트 → Chunk 요약 → 최종 Confluence wiki
 */
export async function chunkSummarizeScript(script: string): Promise<string> {
  if (!BASE_URL) throw new Error('Claude API base URL not set');
  const resp = await axios.post(`${BASE_URL}/chunkSummarize`, { script });
  return resp.data.wikiContent; // Confluence wiki markup
}

/**
 * /api/createPage : 위키 생성 (호출은 confluenceRoutes.js로 감)
 */
export async function createConfluencePage(title: string, content: string): Promise<string> {
  if (!API_BASE_URL) throw new Error('API base URL not set for createPage');
  const resp = await axios.post(`${API_BASE_URL}/api/createPage`, { title, content });
  return resp.data.pageUrl;
}

/**
 * /api/getPageTitles : 여러 Page ID로 제목, URL, 내용 가져오기
 */
export interface PageInfo {
  title: string;
  url: string;
  content: string;
}

export async function getPageTitlesByIds(pageIds: string[]): Promise<PageInfo[]> {
  if (!API_BASE_URL) throw new Error('API base URL not set for getPageTitles');
  if (!Array.isArray(pageIds) || pageIds.length === 0) {
    console.log("getPageTitlesByIds called with empty or invalid pageIds, returning empty array.");
    return []; // 유효한 pageIds가 없으면 빈 배열 반환
  }
  
  try {
    console.log(`Calling backend /api/getPageTitles for IDs: ${pageIds.join(', ')}`);
    const response = await axios.post(`${API_BASE_URL}/api/getPageTitles`, { pageIds });
    // 백엔드 응답에서 pages 배열을 반환 (content 포함)
    return response.data.pages || []; 
  } catch (error: any) {
    console.error('Error calling /api/getPageTitles:', error.response?.data || error.message);
    // 오류 발생 시 빈 배열 또는 특정 오류 처리
    throw new Error('Failed to fetch page titles/content from backend.'); 
  }
}

/**
 * /api/generateSummary : 텍스트 내용으로 짧은 요약 생성
 */
export async function generateSummary(textContent: string): Promise<string> {
  if (!BASE_URL) throw new Error('Claude API base URL not set for generateSummary');
  if (!textContent) return ""; // 내용 없으면 빈 요약 반환

  try {
    const response = await axios.post(`${BASE_URL}/generateSummary`, { textContent });
    return response.data.summary || ""; // 요약 반환, 없으면 빈 문자열
  } catch (error: any) {
    console.error('Error calling /api/generateSummary:', error.response?.data || error.message);
    // 오류 시 대체 텍스트 또는 빈 문자열 반환 (오류 응답 본문에 fallbackSummary가 있을 수 있음)
    return error.response?.data?.fallbackSummary || "(요약 생성 실패)"; 
  }
}

/**
 * /api/generateSlackElements 요청/응답 인터페이스
 */
export interface SlackElementRequestPage {
  title: string;
  summary: string;
}

export interface SlackElementResponse {
  emojis: { emoji: string }[];
  closingRemark: string;
}

/**
 * /api/generateSlackElements : 제목/요약 기반으로 이모지 및 마무리 멘트 생성
 */
export async function generateSlackElements(pages: SlackElementRequestPage[]): Promise<SlackElementResponse> {
  if (!BASE_URL) throw new Error('Claude API base URL not set for generateSlackElements');
  if (!Array.isArray(pages) || pages.length === 0) {
    // 빈 배열 요청 시 기본값 반환
    return { emojis: [], closingRemark: '내용을 확인해주세요.' };
  }

  try {
    console.log(`Calling backend /api/generateSlackElements for ${pages.length} pages.`);
    const response = await axios.post(`${BASE_URL}/generateSlackElements`, { pages });
    // 백엔드에서 받은 그대로 반환 (오류 시 기본값 포함)
    return response.data; 
  } catch (error: any) {
    console.error('Error calling /api/generateSlackElements:', error.response?.data || error.message);
    // 오류 발생 시 기본값 반환
    return { 
      emojis: pages.map(() => ({ emoji: ':page_facing_up:' })), 
      closingRemark: '(메시지 요소 생성 실패)',
    };
  }
}
