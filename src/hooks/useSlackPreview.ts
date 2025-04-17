import { useState } from 'react';
import axios from 'axios';
// import { parsePageIdFromUrl } from '../utils/helpers'; // 제거

// const API_BASE_URL = process.env.REACT_APP_API_BASE_URL; // 제거

interface PreviewParams {
  today?: boolean;
  pageIds?: string[];
}

interface UseSlackPreviewReturn {
  slackPreview: string | null;
  isLoading: boolean;
  error: string | null;
  generatePreview: (params: PreviewParams) => Promise<void>; 
  // sendSlackMessage 함수 제거됨 (HomePage에서 useSlackSender의 sendMessage 사용)
}

const useSlackPreview = (): UseSlackPreviewReturn => {
  const [slackPreview, setSlackPreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 통합된 미리보기 생성 함수.
   * 파라미터에 따라 오늘의 페이지 또는 지정된 ID의 페이지 기반으로 Slack 미리보기 요청.
   */
  const generatePreview = async (params: PreviewParams): Promise<void> => {
    setIsLoading(true);
    setError(null);
    setSlackPreview(null); // 미리보기 초기화

    console.log('[useSlackPreview] generatePreview called with params:', params);

    try {
      let requestBody = {};
      if (params.today) {
        requestBody = { today: true };
      } else if (params.pageIds && params.pageIds.length > 0) {
        requestBody = { pageIds: params.pageIds };
      } else {
        throw new Error('Invalid parameters: Either today=true or pageIds must be provided.');
      }
      // 상대 경로 사용 (프록시 설정 가정)
      const response = await axios.post('/api/generateSlackPreview', requestBody); 
      setSlackPreview(response.data.slackPreview);
      console.log('[useSlackPreview] Preview generated:', response.data.slackPreview);

    } catch (err: any) {
      console.error('[useSlackPreview] Error generating preview:', err);
      const errorMessage = err.response?.data?.error || err.message || '미리보기 생성 중 오류가 발생했습니다.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // sendSlackMessage 함수 제거됨

  return { slackPreview, isLoading, error, generatePreview }; // 반환값에서 sendSlackMessage 제거
};

export default useSlackPreview; 