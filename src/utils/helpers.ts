import config from '../../server/config';

/**
 * Confluence URL에서 페이지 ID를 추출합니다.
 * @param url - Confluence 페이지 URL
 * @returns 추출된 페이지 ID 또는 찾지 못한 경우 null
 */
export const parsePageIdFromUrl = (url: string): string | null => {
  try {
    const parsedUrl = new URL(url);
    const pathSegments = parsedUrl.pathname.split('/');
    // 일반적인 Confluence Cloud URL 형식 (.../pages/PAGE_ID/...)
    const pagesIndex = pathSegments.findIndex(segment => segment === 'pages');
    if (pagesIndex !== -1 && pathSegments.length > pagesIndex + 1) {
      const potentialId = pathSegments[pagesIndex + 1];
      if (/^\d+$/.test(potentialId)) { // 숫자로만 구성되어 있는지 확인
        return potentialId;
      }
    }
    // 레거시 또는 다른 형식 (URL 마지막 부분이 ID일 수 있음)
    const lastSegment = pathSegments[pathSegments.length - 1];
    if (/^\d+$/.test(lastSegment)) {
      return lastSegment;
    }

  } catch (error) {
    console.error("Error parsing Confluence URL:", url, error);
  }
  return null; // ID를 찾지 못한 경우
};

/**
 * File 객체를 텍스트 문자열로 비동기적으로 읽습니다.
 * @param file - 읽을 File 객체
 * @returns 파일 내용을 담은 Promise<string>
 */
export const readFileAsText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target && typeof event.target.result === 'string') {
        resolve(event.target.result);
      } else {
        reject(new Error('Failed to read file as text.'));
      }
    };
    reader.onerror = (error) => {
      reject(error);
    };
    reader.readAsText(file); // 파일을 텍스트로 읽기 시작
  });
}; 