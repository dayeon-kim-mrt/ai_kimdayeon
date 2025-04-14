import React, { useState } from 'react';
import { generateWikiPageTitle, chunkSummarizeScript, createConfluencePage } from '../api/claudeApi';
import axios from 'axios';

const HomePage: React.FC = () => {
  const [script, setScript] = useState('');
  const [wikiTitle, setWikiTitle] = useState('');
  const [wikiContent, setWikiContent] = useState('');
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [slackPreview, setSlackPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 기존 위키 생성 핸들러 (변경 없이 그대로 사용)
  const handleUpload = async () => {
    if (!script.trim()) return;
    setLoading(true);
    setError(null);
    setWikiContent('');
    setWikiTitle('');
    setPageUrl(null);
    setSlackPreview(null);

    try {
      // 1) Claude로부터 30자 이내 제목 생성
      const genTitle = await generateWikiPageTitle(script);
      setWikiTitle(genTitle);

      // 2) Chunk Summarize로 본문 생성
      const finalWiki = await chunkSummarizeScript(script);
      setWikiContent(finalWiki);

      // 3) Confluence에 업로드 (wiki markup)
      const url = await createConfluencePage(genTitle, finalWiki);
      setPageUrl(url);
    } catch (err: any) {
      setError(err.message || '오류 발생');
    } finally {
      setLoading(false);
    }
  };

  // Slack 메시지 미리보기 핸들러: 오늘 Confluence에 업로드된 페이지들을 기반으로 미리보기 메시지 생성
  const handleSlackPreview = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`${process.env.REACT_APP_API_BASE_URL}/api/getSlackPreviewMessage`);
      setSlackPreview(response.data.slackPreview);
    } catch (err: any) {
      setError(err.message || 'Slack 미리보기 오류');
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
      <div>
        <button onClick={handleUpload} disabled={loading || !script.trim()}>
          {loading ? '업로드 중...' : '위키 업로드'}
        </button>
        <button onClick={handleSlackPreview} disabled={loading} style={{ marginLeft: 10 }}>
          {loading ? '미리보기 중...' : 'Slack 메시지 미리보기'}
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
    </div>
  );
};

export default HomePage;
