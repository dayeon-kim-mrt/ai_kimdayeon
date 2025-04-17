/**
 * Confluence URL에서 Page ID를 추출하는 함수.
 * 예: "https://your-domain.atlassian.net/wiki/spaces/SPACEKEY/pages/123456789/Page+Title"
 * -> "123456789"
 */
export function parsePageIdFromUrl(url: string): string | null {
  if (!url) {
    return null;
  }
  try {
    const urlObject = new URL(url); 
    // 정규 표현식을 사용하여 경로에서 마지막 숫자 시퀀스(페이지 ID)를 찾습니다.
    // /pages/ 다음에 오는 숫자 그룹을 찾습니다.
    const match = urlObject.pathname.match(/\/pages\/(\d+)/);
    if (match && match[1]) {
      return match[1]; // 첫 번째 캡처 그룹 (페이지 ID)
    }
    // URL 구조가 예상과 다를 경우 null 반환
    return null;
  } catch (error) {
    // URL 파싱 중 에러 발생 시 (유효하지 않은 URL 등)
    console.error(`Error parsing URL ${url}:`, error);
    return null;
  }
}

/**
 * 주어진 텍스트를 지정된 최대 청크 크기로 나눕니다.
 * 줄바꿈과 문장 경계를 고려하여 자연스럽게 분할하려고 시도합니다.
 */
export function chunkText(text: string, maxChunkSize: number): string[] {
  const chunks: string[] = [];
  let remainingText = text;

  while (remainingText.length > 0) {
    if (remainingText.length <= maxChunkSize) {
      chunks.push(remainingText);
      break;
    }

    let chunkEnd = maxChunkSize;

    // 최대 크기 근처에서 가장 가까운 줄바꿈 또는 문장 끝 찾기
    const lastNewline = remainingText.lastIndexOf('\n', chunkEnd);
    const lastPeriod = remainingText.lastIndexOf('.', chunkEnd);
    const lastPunctuation = Math.max(lastNewline, lastPeriod);

    if (lastPunctuation > maxChunkSize * 0.7) { // 너무 작은 청크 방지
      chunkEnd = lastPunctuation + 1; 
    } else {
        // 적절한 분할 지점 못 찾으면 그냥 최대 크기에서 자름
        // 단어 중간에서 잘리는 것을 방지하기 위해 공백 찾기 시도
        const lastSpace = remainingText.lastIndexOf(' ', chunkEnd);
        if (lastSpace > maxChunkSize * 0.7) {
            chunkEnd = lastSpace + 1;
        }
        // 그래도 못 찾으면 그냥 자름
    }

    chunks.push(remainingText.substring(0, chunkEnd).trim());
    remainingText = remainingText.substring(chunkEnd).trim();
  }

  return chunks;
}

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