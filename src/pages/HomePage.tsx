// src/pages/HomePage.tsx
import React, { useState } from 'react';
import axios from 'axios';
import { generateWikiPageTitle, chunkSummarizeScript, createConfluencePage } from '../api/claudeApi';

const HomePage: React.FC = () => {
  // SRT 파일과 구글 드라이브 링크를 위한 상태 추가
  const [srtFile, setSrtFile] = useState<File | null>(null);
  const [driveLink, setDriveLink] = useState('');
  
  // 기존 상태들
  const [wikiTitle, setWikiTitle] = useState('');
  const [wikiContent, setWikiContent] = useState('');
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [slackPreview, setSlackPreview] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // FileReader API를 사용하여 파일을 텍스트로 읽어주는 헬퍼 함수
  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(reader.result as string);
      };
      reader.onerror = () => {
        reject(new Error('파일을 읽는 도중 오류 발생'));
      };
      reader.readAsText(file, 'UTF-8');
    });
  };

  // 위키 업로드 핸들러
  // 위키 업로드 핸들러
const handleUpload = async () => {
  if (!srtFile) {
    setError('SRT 자막 파일을 먼저 선택하세요.');
    return;
  }
  if (!driveLink.trim()) {
    setError('구글 드라이브 링크를 입력해주세요.');
    return;
  }

  setLoading(true);
  setError(null);
  setWikiTitle('');
  setWikiContent('');
  setPageUrl(null);
  setSlackPreview(null);
  setSendResult(null);

  try {
    // SRT 파일을 읽어서 스크립트 내용을 가져옴
    const scriptContent = await readFileAsText(srtFile);

    // 1) 제목 생성
    const title = await generateWikiPageTitle(scriptContent);
    setWikiTitle(title);

    // 2) 본문 요약 생성 (청크 처리 및 기존 요약 흐름)
    let content = await chunkSummarizeScript(scriptContent);
    // 구글 드라이브 링크를 위키 본문 최상단에 추가 (원하는 형식 적용)
    content = `h3. 구글 드라이브 링크:\n🔗 ${driveLink}\n\n${content}`;
    setWikiContent(content);

    // 3) Confluence 페이지 생성
    const url = await createConfluencePage(title, content);
    setPageUrl(url);
  } catch (err: any) {
    setError(err.message || '위키 업로드 중 오류 발생');
  } finally {
    setLoading(false);
  }
};


  // Slack 미리보기 생성 핸들러 (기존과 동일)
  const handleSlackPreview = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`${process.env.REACT_APP_API_BASE_URL}/api/getSlackPreviewMessage`);
      setSlackPreview(response.data.slackPreview);
    } catch (err: any) {
      setError(err.message || 'Slack 미리보기 생성 오류');
    } finally {
      setLoading(false);
    }
  };

  // Slack 메시지 전송 핸들러 (기존과 동일)
  const handleSendSlackMessage = async () => {
    if (!slackPreview) {
      setError('먼저 Slack 메시지 미리보기를 생성하세요.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await axios.post(`${process.env.REACT_APP_API_BASE_URL}/api/sendSlackMessage`, {
        slackMessage: slackPreview,
      });
      setSendResult(response.data.message || 'Slack 메시지 전송 완료');
    } catch (err: any) {
      setError(err.message || 'Slack 메시지 전송 오류');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 800, margin: '0 auto' }}>
      <h1>Confluence 위키 업로드 & Slack 메시지 미리보기</h1>
      
      {/* SRT 파일 첨부 입력 */}
      <div style={{ marginBottom: 10 }}>
        <label>
          SRT 자막 파일 첨부:&nbsp;
          <input
            type="file"
            accept=".srt"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                setSrtFile(e.target.files[0]);
              }
            }}
          />
        </label>
      </div>

      {/* 구글 드라이브 링크 입력 */}
      <div style={{ marginBottom: 10 }}>
        <label>
          구글 드라이브 링크:&nbsp;
          <input
            type="text"
            value={driveLink}
            onChange={(e) => setDriveLink(e.target.value)}
            placeholder="https://drive.google.com/..."
            style={{ width: '100%' }}
          />
        </label>
      </div>

      {/* 버튼 영역 */}
      <div style={{ marginBottom: 10 }}>
        <button onClick={handleUpload} disabled={loading || !srtFile || !driveLink.trim()}>
          {loading ? '업로드 중...' : '위키 업로드'}
        </button>
        <button onClick={handleSlackPreview} disabled={loading} style={{ marginLeft: 10 }}>
          {loading ? '미리보기 중...' : 'Slack 메시지 미리보기'}
        </button>
        <button onClick={handleSendSlackMessage} disabled={loading || !slackPreview} style={{ marginLeft: 10 }}>
          {loading ? '전송 중...' : 'Slack 메시지 전송'}
        </button>
      </div>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {wikiTitle && (
        <div style={{ marginTop: 20 }}>
          <h2>생성된 제목</h2>
          <p>{wikiTitle}</p>
        </div>
      )}

      {wikiContent && (
        <div style={{ marginTop: 20 }}>
          <h2>생성된 Wiki 본문 (Confluence Markup)</h2>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{wikiContent}</pre>
        </div>
      )}

      {pageUrl && (
        <div style={{ marginTop: 20 }}>
          <h2>Confluence 페이지 생성 완료!</h2>
          <a href={pageUrl} target="_blank" rel="noopener noreferrer">
            {pageUrl}
          </a>
        </div>
      )}

      {slackPreview && (
        <div style={{ marginTop: 20 }}>
          <h2>Slack 메시지 미리보기</h2>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{slackPreview}</pre>
        </div>
      )}

      {sendResult && (
        <div style={{ marginTop: 20 }}>
          <h2>Slack 전송 결과</h2>
          <p>{sendResult}</p>
        </div>
      )}
    </div>
  );
};

export default HomePage;
