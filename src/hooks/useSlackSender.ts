import { useState } from 'react';
import axios from 'axios';

export const useSlackSender = () => {
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const sendMessage = async (message: string) => {
    if (!message) {
      setSendError('전송할 Slack 메시지가 없습니다.');
      return;
    }
    
    setIsSending(true);
    setSendError(null);
    setSendResult(null);

    try {
      const response = await axios.post('/api/sendSlackMessage', { slackMessage: message });
      
      setSendResult(response.data.message || 'Slack 메시지 전송 완료');
    } catch (err: any) {
      console.error('Slack Send Hook Error:', err);
      const backendError = err.response?.data?.error || err.response?.data?.details;
      setSendError(backendError || err.message || 'Slack 메시지 전송 오류');
    } finally {
      setIsSending(false);
    }
  };

  return {
    sendResult,
    isSending,
    sendError,
    sendMessage,
    clearSendResult: () => setSendResult(null),
    clearSendError: () => setSendError(null)
  };
}; 