import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

/**
 * 백엔드 API(/api/sendSlackMessage)를 호출하여 Slack 메시지 전송을 요청.
 * @param slackMessage 전송할 Slack 메시지 본문 (<!here> 등 포함 가능)
 * @returns 백엔드 응답 Promise (성공 메시지 또는 오류 포함)
 */
export async function sendSlackMessage(slackMessage: string): Promise<{ message?: string; error?: string; details?: any }> {
  if (!API_BASE_URL) {
    throw new Error('API base URL not set for sendSlackMessage');
  }
  if (!slackMessage) {
    console.warn('Attempted to send an empty Slack message.');
    // 빈 메시지는 보내지 않고, 오류 대신 경고 후 빈 응답 반환 또는 특정 응답 반환 선택
    return { message: 'Empty message not sent.' }; 
  }

  try {
    // 백엔드 API 호출 (POST 요청)
    const response = await axios.post(`${API_BASE_URL}/api/sendSlackMessage`, {
      slackMessage, // 요청 본문에 메시지 전달
    });
    // 백엔드 성공 응답 반환
    return response.data; 
  } catch (error: any) {
    console.error('Error calling /api/sendSlackMessage:', error.response?.data || error.message);
    // 오류 발생 시 오류 정보 포함하여 예외 던지기 또는 오류 객체 반환
    // 여기서는 오류 객체를 반환하여 호출 측에서 유연하게 처리하도록 함
    return { 
      error: 'Failed to send Slack message via backend.', 
      details: error.response?.data || error.message 
    };
  }
} 