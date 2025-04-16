import { useState } from 'react';
import { sendSlackMessage } from '../api/slackApi';

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
    setSendResult(null); // Clear previous result

    try {
      // Add <!here> mention before sending
      const finalMessage = `<!here> ${message}`;
      const result = await sendSlackMessage(finalMessage);
      
      if (result.error) {
        // If the API wrapper returned an error object
        throw new Error(result.details || result.error);
      }
      
      setSendResult(result.message || 'Slack 메시지 전송 완료');
    } catch (err: any) {
      console.error('Slack Send Error:', err);
      setSendError(err.message || 'Slack 메시지 전송 오류');
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