//src/api/claudeApi.ts

import axios from 'axios';

// 백엔드 API 서버들의 기본 URL (환경 변수에서 가져옴)
const BASE_URL = process.env.REACT_APP_CLAUDE_API_BASE_URL; // Claude 관련 기능 API 서버 (제목, 요약, 요소 생성)
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;   // 일반 기능 API 서버 (페이지 생성, 페이지 정보 조회, Slack 전송 등)

/**
 * 백엔드 API(/api/makeTitle)를 호출하여 주어진 스크립트 내용으로
 * Confluence 페이지 제목(30자 내외) 생성을 요청하고 결과를 반환.
 * @param script Confluence 페이지 제목 생성의 기반이 될 텍스트 스크립트
 * @returns 생성된 페이지 제목 문자열 Promise
 */
export async function generateWikiPageTitle(script: string): Promise<string> {
  // 환경 변수 설정 확인
  if (!BASE_URL) throw new Error('Claude API base URL not set');
  // 백엔드 API 호출 (POST 요청)
  const resp = await axios.post(`${BASE_URL}/makeTitle`, { prompt: script });
  return resp.data.title; // 응답 데이터에서 제목 반환
}

/**
 * 백엔드 API(/api/chunkSummarize)를 호출하여 긴 스크립트를 청크 단위로 요약하고,
 * 최종적으로 Confluence 위키 마크업 형식의 본문 생성을 요청하고 결과를 반환.
 * @param script 요약 및 Confluence 마크업 생성의 기반이 될 텍스트 스크립트
 * @returns 생성된 Confluence 위키 마크업 본문 문자열 Promise
 */
export async function chunkSummarizeScript(script: string): Promise<string> {
  if (!BASE_URL) throw new Error('Claude API base URL not set');
  const resp = await axios.post(`${BASE_URL}/chunkSummarize`, { script });
  return resp.data.wikiContent; // 응답 데이터에서 위키 본문 반환
}

/**
 * 백엔드 API(/api/createPage)를 호출하여 Confluence 페이지 생성을 요청.
 * (실제 Confluence API 호출은 백엔드의 confluenceRoutes.js에서 수행됨)
 * @param title 생성할 페이지의 제목
 * @param content 생성할 페이지의 본문 (Confluence 위키 마크업)
 * @returns 생성된 Confluence 페이지의 URL 문자열 Promise
 */
export async function createConfluencePage(title: string, content: string): Promise<string> {
  if (!API_BASE_URL) throw new Error('API base URL not set for createPage');
  const resp = await axios.post(`${API_BASE_URL}/api/createPage`, { title, content });
  return resp.data.pageUrl; // 응답 데이터에서 페이지 URL 반환
}

/**
 * 백엔드 API(/api/getPageTitles) 응답에 포함될 페이지 정보 인터페이스.
 */
export interface PageInfo {
  title: string;    // 페이지 제목
  url: string;      // 페이지 URL
  content: string;  // 페이지 본문 내용 (HTML)
}

/**
 * 백엔드 API(/api/getPageTitles)를 호출하여 주어진 Confluence Page ID 배열에 해당하는
 * 페이지들의 정보(제목, URL, 내용)를 가져와 반환.
 * @param pageIds 페이지 정보를 가져올 Confluence Page ID 문자열 배열
 * @returns 페이지 정보 객체(PageInfo) 배열 Promise
 */
export async function getPageTitlesByIds(pageIds: string[]): Promise<PageInfo[]> {
  if (!API_BASE_URL) throw new Error('API base URL not set for getPageTitles');
  // 유효한 pageIds가 없으면 빈 배열 반환
  if (!Array.isArray(pageIds) || pageIds.length === 0) {
    return [];
  }

  try {
    // 백엔드 API 호출 (POST 요청)
    console.log(`Calling backend /api/getPageTitles for IDs: ${pageIds.join(', ')}`);
    const response = await axios.post(`${API_BASE_URL}/api/getPageTitles`, { pageIds });
    // 백엔드 응답 구조 { pages: [...] } 에서 pages 배열 반환 (없으면 빈 배열)
    return response.data.pages || [];
  } catch (error: any) {
    console.error('Error calling /api/getPageTitles:', error.response?.data || error.message);
    // 오류 발생 시 예외 던지기 (호출 측에서 처리)
    throw new Error('Failed to fetch page titles/content from backend.');
  }
}

/**
 * 백엔드 API(/api/generateSummary)를 호출하여 주어진 텍스트 내용에 대한
 * 짧고 친근한 요약 생성을 요청하고 결과를 반환.
 * @param textContent 요약할 원본 텍스트 (HTML 포함 가능)
 * @returns 생성된 요약 문자열 Promise (실패 시 대체 텍스트 포함 가능)
 */
export async function generateSummary(textContent: string): Promise<string> {
  if (!BASE_URL) throw new Error('Claude API base URL not set for generateSummary');
  if (!textContent) return ""; // 내용 없으면 빈 문자열 반환

  try {
    // 백엔드 API 호출 (POST 요청)
    const response = await axios.post(`${BASE_URL}/generateSummary`, { textContent });
    return response.data.summary || ""; // 응답에서 요약 반환 (없으면 빈 문자열)
  } catch (error: any) {
    console.error('Error calling /api/generateSummary:', error.response?.data || error.message);
    // 오류 시 백엔드가 제공하는 대체 요약 또는 고정 텍스트 반환
    return error.response?.data?.fallbackSummary || "(요약 생성 실패)";
  }
}

/**
 * 백엔드 API(/api/generateSlackElements) 요청 시 전달할 페이지 정보 인터페이스.
 */
export interface SlackElementRequestPage {
  title: string;    // 페이지 제목
  summary: string;  // 페이지 요약
}

/**
 * 백엔드 API(/api/generateSlackElements) 응답 인터페이스.
 */
export interface SlackElementResponse {
  emojis: { emoji: string }[]; // 각 페이지에 추천된 이모지 배열
  closingRemark: string;       // 전체 메시지에 대한 추천 마무리 멘트
}

/**
 * 백엔드 API(/api/generateSlackElements)를 호출하여 주어진 페이지 제목/요약 목록을 기반으로
 * 각 페이지에 어울리는 Slack 이모지와 전체 메시지에 대한 마무리 멘트 생성을 요청하고 결과를 반환.
 * @param pages 각 페이지의 제목과 요약을 담은 객체 배열
 * @returns 추천된 이모지 배열과 마무리 멘트를 담은 객체(SlackElementResponse) Promise
 */
export async function generateSlackElements(pages: SlackElementRequestPage[]): Promise<SlackElementResponse> {
  if (!BASE_URL) throw new Error('Claude API base URL not set for generateSlackElements');
  // 빈 배열 요청 시 기본값 반환
  if (!Array.isArray(pages) || pages.length === 0) {
    return { emojis: [], closingRemark: '내용을 확인해주세요.' };
  }

  try {
    // 백엔드 API 호출 (POST 요청)
    console.log(`Calling backend /api/generateSlackElements for ${pages.length} pages.`);
    const response = await axios.post(`${BASE_URL}/generateSlackElements`, { pages });
    // 백엔드 응답 데이터 반환 (백엔드에서 오류 시 기본값 포함)
    return response.data;
  } catch (error: any) {
    console.error('Error calling /api/generateSlackElements:', error.response?.data || error.message);
    // API 호출 자체 실패 시 기본값 반환
    return {
      emojis: pages.map(() => ({ emoji: ':page_facing_up:' })),
      closingRemark: '(메시지 요소 생성 실패)',
    };
  }
}
