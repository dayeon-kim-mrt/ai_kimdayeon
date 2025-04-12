import React, { useState } from 'react';
import { generateWikiPageTitle, chunkSummarizeScript, createConfluencePage } from '../api/claudeApi';

const HomePage: React.FC = () => {
  const [script, setScript] = useState('');
  const [wikiTitle, setWikiTitle] = useState('');
  const [wikiContent, setWikiContent] = useState('');
  const [pageUrl, setPageUrl] = useState<string|null>(null);
  const [error, setError] = useState<string|null>(null);
  const [loading, setLoading] = useState(false);

  const handleUpload = async () => {
    if (!script.trim()) return;
    setLoading(true);
    setError(null);
    setWikiContent('');
    setWikiTitle('');
    setPageUrl(null);

    try {
      // 1) Claude로부터 30자 이내 한국어 제목
      const genTitle = await generateWikiPageTitle(script);
      setWikiTitle(genTitle);

      // 2) Chunk Summarize로 본문
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

  return (
    <div style={{ padding: 20, maxWidth: 800, margin: '0 auto' }}>
      <h1>긴 스크립트 → Confluence 위키 (Wiki Markup)</h1>
      <textarea
        rows={10}
        style={{ width: '100%', marginBottom: 10 }}
        value={script}
        onChange={(e) => setScript(e.target.value)}
        placeholder="매우 긴 스크립트 입력..."
      />
      <button onClick={handleUpload} disabled={loading || !script.trim()}>
        {loading ? '업로드 중...' : '위키 업로드'}
      </button>

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
    </div>
  );
};

export default HomePage;
