// src/api/confluenceApi.ts
import axios from 'axios';

// 백엔드 API 서버 URL (환경 변수에서 가져옴)
// createPage, getPageTitles 등 일반 백엔드 기능을 위한 URL
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

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

export async function updateConfluencePage(pageId: string, content: string): Promise<any> {
    // TODO: Confluence API 호출 로직 구현 예시
    return Promise.resolve({ success: true });
  }
  
  export async function searchConfluencePages(query: string): Promise<any> {
    // TODO: Confluence API 호출 로직 구현 예시
    return Promise.resolve([]);
  }
  
  export {};  // 이 줄을 추가하여 모듈 파일로 만듭니다.
  