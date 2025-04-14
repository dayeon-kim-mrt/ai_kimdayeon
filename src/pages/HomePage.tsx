// src/pages/HomePage.tsx
import React, { useState } from 'react';
import axios from 'axios';
import { generateWikiPageTitle, chunkSummarizeScript, createConfluencePage } from '../api/claudeApi';

const HomePage: React.FC = () => {
  const [script, setScript] = useState('');
  const [wikiTitle, setWikiTitle] = useState('');
  const [wikiContent, setWikiContent] = useState('');
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [slackPreview, setSlackPreview] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 위키 페이지 업로드 핸들러
  const handleUpload = async () => {
    if (!script.trim()) return;
    setLoading(true);
    setError(null);
    setWikiTitle('');
    setWikiContent('');
    setPageUrl(null);
    setSlackPreview(null);
    setSendResult(null);

    try {
      // 1) 제목 생성
      const title = await generateWikiPageTitle(script);
      setWikiTitle(title);
      // 2) 본문 요약 생성
      const content = await chunkSummarizeScript(script);
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

  // Slack 미리보기 생성 핸들러
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

  // Slack 메시지 전송 핸들러
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
      <textarea
        rows={10}
        style={{ width: '100%', marginBottom: 10 }}
        value={script}
        onChange={(e) => setScript(e.target.value)}
        placeholder="매우 긴 스크립트 입력..."
      />
      <div style={{ marginBottom: 10 }}>
        <button onClick={handleUpload} disabled={loading || !script.trim()}>
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
          <a href={pageUrl} target="_blank" rel="noopener noreferrer">{pageUrl}</a>
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
