import { useState } from 'react';
import { getTodaySlackPreviewMessage } from '../api/slackApi';

export const useTodaySlackPreview = () => {
  const [todayPreviewMessage, setTodayPreviewMessage] = useState<string>('');
  const [isTodayPreviewLoading, setIsTodayPreviewLoading] = useState(false);
  const [todayPreviewError, setTodayPreviewError] = useState<string | null>(null);

  const generateTodayPreview = async () => {
    setIsTodayPreviewLoading(true);
    setTodayPreviewError(null);
    setTodayPreviewMessage(''); // Clear previous message
    try {
      const preview = await getTodaySlackPreviewMessage();
      setTodayPreviewMessage(preview);
    } catch (err: any) {
      console.error('Today Slack Preview Error:', err);
      setTodayPreviewError(err.message || '오늘의 Slack 미리보기 생성 오류');
    } finally {
      setIsTodayPreviewLoading(false);
    }
  };

  return {
    todayPreviewMessage,
    isTodayPreviewLoading,
    todayPreviewError,
    generateTodayPreview,
    clearTodayPreviewError: () => setTodayPreviewError(null),
    // Expose setter if needed to clear message from outside
    setTodayPreviewMessage 
  };
}; 