// src/pages/HomePage.tsx
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { JsonInput, Button, LoadingOverlay, Textarea, TextInput, MultiSelect, ActionIcon, Tooltip, Alert, Checkbox, Group, Box, CopyButton, FileInput, Text, Space } from '@mantine/core';
import { IconCirclePlus, IconTrash, IconInfoCircle } from '@tabler/icons-react';
import config from '../../server/config';
import { parsePageIdFromUrl, readFileAsText } from '../utils/helpers';
import { 
  generateWikiPageTitle, 
  chunkSummarizeScript, 
  generateSummary, 
  generateSlackElements, 
  SlackElementRequestPage, 
  SlackElementResponse 
} from '../api/claudeApi';
import { 
  createConfluencePage, 
  getPageTitlesByIds, 
  PageInfo 
} from '../api/confluenceApi';
import { sendSlackMessage } from '../api/slackApi';

const HomePage: React.FC = () => {
  // SRT 파일과 구글 드라이브 링크를 위한 상태 추가
  const [srtFile, setSrtFile] = useState<File | null>(null);
  const [driveLink, setDriveLink] = useState('');
  
  // 기존 상태들
  const [wikiTitle, setWikiTitle] = useState('');
  const [wikiContent, setWikiContent] = useState('');
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [editableSlackMessage, setEditableSlackMessage] = useState<string>('');
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copySuccess, setCopySuccess] = useState(''); // 클립보드 복사 성공 메시지 상태

  // 직접 입력 링크 상태 추가
  const [manualLinks, setManualLinks] = useState<string[]>(['']);

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
    setEditableSlackMessage('');
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
      setCopySuccess(''); // 새 URL 생성 시 복사 성공 메시지 초기화
    } catch (err: any) {
      setError(err.message || '위키 업로드 중 오류 발생');
    } finally {
      setLoading(false);
    }
  };

  // 핸들러: 오늘의 Wiki 기반 미리보기 생성 (기존 로직)
  const handleTodaySlackPreview = async () => {
    setLoading(true);
    setError(null);
    setEditableSlackMessage('');
    try {
      // 백엔드에서 오늘 생성된 페이지 기반의 미리보기 메시지를 가져옴
      const response = await axios.get(`${process.env.REACT_APP_API_BASE_URL}/api/getSlackPreviewMessage`);
      setEditableSlackMessage(response.data.slackPreview);
    } catch (err: any) {
      setError(err.message || '오늘의 Slack 미리보기 생성 오류');
    } finally {
      setLoading(false);
    }
  };

  // 핸들러: 직접 입력된 링크 기반 미리보기 생성 (수정됨)
  const handleManualLinkPreview = async () => {
    setLoading(true);
    setError(null);
    setEditableSlackMessage('');
    
    const validUrls = manualLinks.map(link => link.trim()).filter(link => link !== '');
    if (validUrls.length === 0) {
      setError('미리보기를 생성할 유효한 Confluence 링크를 하나 이상 입력하세요.');
      setLoading(false);
      return;
    }

    const pageIds = validUrls.map(parsePageIdFromUrl).filter((id): id is string => id !== null);
    
    if (pageIds.length !== validUrls.length) {
      // 일부 URL에서 ID 추출 실패 시 경고 (필수는 아님)
      console.warn('Some URLs did not contain valid Confluence Page IDs and were skipped.');
    }
    if (pageIds.length === 0) {
       setError('입력된 URL에서 유효한 Confluence Page ID를 추출할 수 없습니다. URL 형식을 확인하세요. (예: .../pages/12345/...)');
       setLoading(false);
       return;
    }

    try {
      // 1. 백엔드 API 호출하여 Page 정보 (제목, URL, 내용 포함) 가져오기
      const pagesInfo: PageInfo[] = await getPageTitlesByIds(pageIds);

      // 2. 각 페이지 내용으로 요약 생성 (병렬 처리)
      const summaryPromises = pagesInfo.map(page => 
        generateSummary(page.content) // 각 페이지 content로 요약 함수 호출
      );
      const summaries = await Promise.all(summaryPromises);

      // 3. 이모지 및 마무리 멘트 생성 위한 데이터 준비
      const pagesForElements: SlackElementRequestPage[] = pagesInfo.map((page, index) => ({
        title: page.title,
        summary: summaries[index] || '' // 요약 없으면 빈 문자열 전달
      }));
      
      // 4. 이모지 및 마무리 멘트 생성 API 호출
      const { emojis, closingRemark } = await generateSlackElements(pagesForElements);

      // 5. 최종 Slack 메시지 본문 구성
      let message = ':mega: *모두의 AI 영상이 업로드 되었어요~*\n\n';
      pagesInfo.forEach((page, index) => {
        const emoji = emojis[index]?.emoji || ':page_facing_up:'; // 동적 이모지 사용
        const summary = summaries[index] || '(요약)'; 
        message += `${emoji} *${page.title}*\n`;
        message += `${summary}\n`; 
        message += `<${page.url}>\n\n`;
      });
      message += `${closingRemark}\n`; // 동적 마무리 멘트 사용

      setEditableSlackMessage(message);

    } catch (err: any) {
      setError(err.message || '입력된 링크 기반 Slack 미리보기 생성 오류');
    } finally {
      setLoading(false);
    }
  };

  // 핸들러: Slack 메시지 전송 (공통 사용)
  const handleSendSlackMessage = async () => {
    if (!editableSlackMessage) {
      setError('먼저 Slack 메시지 미리보기를 생성하거나 내용을 입력하세요.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const finalMessage = `<!here> ${editableSlackMessage}`;
      const result = await sendSlackMessage(finalMessage);
      if (result.error) {
        throw new Error(result.details || result.error);
      }
      setSendResult(result.message || 'Slack 메시지 전송 완료');
    } catch (err: any) {
      setError(err.message || 'Slack 메시지 전송 오류');
    } finally {
      setLoading(false);
    }
  };

  // 클립보드 복사 핸들러
  const handleCopyToClipboard = () => {
    if (!pageUrl) return;
    navigator.clipboard.writeText(pageUrl).then(() => {
      setCopySuccess('복사 완료!');
      setTimeout(() => setCopySuccess(''), 2000); // 2초 후 메시지 사라짐
    }, (err) => {
      setCopySuccess('복사 실패');
      console.error('클립보드 복사 실패:', err);
    });
  };

  // --- 직접 링크 입력 관련 핸들러 ---
  const handleManualLinkChange = (index: number, value: string) => {
    const newLinks = [...manualLinks];
    newLinks[index] = value;
    setManualLinks(newLinks);
  };

  const handleAddManualLink = () => {
    setManualLinks([...manualLinks, '']);
  };

  // --- 추가: 직접 링크 입력 제거 핸들러 ---
  const handleRemoveManualLink = (indexToRemove: number) => {
    // 첫 번째 입력 필드는 제거하지 않음 (항상 하나는 유지)
    if (manualLinks.length <= 1) return;
    setManualLinks(manualLinks.filter((_, index) => index !== indexToRemove));
  };

  // 핸들러: 생성된 Wiki URL을 직접 링크 입력에 추가 (Slack 메시지 Input 버튼)
  const handleSlackInput = () => {
    if (!pageUrl) return;

    const currentLinks = [...manualLinks];
    const firstEmptyIndex = currentLinks.findIndex(link => link.trim() === '');

    if (firstEmptyIndex !== -1) {
      // 빈 칸이 있으면 거기에 채움
      currentLinks[firstEmptyIndex] = pageUrl;
      setManualLinks(currentLinks);
    } else {
      // 빈 칸이 없으면 새로 추가
      setManualLinks([...currentLinks, pageUrl]);
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 800, margin: '0 auto' }}>
      <h1>Confluence 위키 업로드 & Slack 메시지 생성</h1>
      
      {/* === 위키 업로드 섹션 === */}
      <h2>1. Confluence 페이지 생성</h2>
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

      {/* 위키 업로드 버튼 */} 
      <div style={{ marginBottom: 10 }}>
         <button onClick={handleUpload} disabled={loading || !srtFile || !driveLink.trim()}>
           {loading ? '업로드 중...' : '위키 업로드'}
         </button>
      </div>

      {/* 생성된 위키 페이지 URL 출력 영역 */} 
      {pageUrl && (
        <div style={{ marginBottom: 20 }}>
          <label>
           생성된 Wiki 페이지 링크:&nbsp;
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <input
                type="text"
                value={pageUrl}
                readOnly
                style={{ width: 'calc(100% - 200px)', padding: '8px', border: '1px solid #ccc', backgroundColor: '#f8f8f8' }} /* 너비 조정 */
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button onClick={handleCopyToClipboard} style={{ padding: '8px 12px' }}>
                {copySuccess || '복사'}
              </button>
              {/* 버튼 클릭 시 handleSlackInput 호출 */}
              <button onClick={handleSlackInput} style={{ padding: '8px 12px' }}>
                Slack 메시지 Input
              </button>
            </div>
          </label>
        </div>
      )}
      
      {/* === Slack 메시지 생성 섹션 === */}
      <h2 style={{ marginTop: 40 }}>2. Slack 메시지 생성 및 전송</h2>
      
       {/* --- 직접 링크 입력 --- */} 
      <div style={{ marginBottom: 10, border: '1px solid #eee', padding: 15 }}>
        <h3 style={{ marginTop: 0 }}>옵션 A: 링크 직접 입력하여 생성</h3>
        {manualLinks.map((link, index) => (
          <div key={index} style={{ display: 'flex', marginBottom: '5px', gap: '5px' }}>
            <input
              type="text"
              value={link}
              onChange={(e) => handleManualLinkChange(index, e.target.value)}
              placeholder={`https://.../pages/12345/... 링크 ${index + 1}`}
              style={{ flexGrow: 1, padding: '8px' }}
            />
            {/* + 버튼: 항상 마지막 줄에 표시 */}
            {index === manualLinks.length - 1 && (
               <button onClick={handleAddManualLink} style={{ padding: '8px 12px' }}>+</button>
            )}
            {/* - 버튼: 첫 번째 줄(index 0)을 제외하고 표시 */}
            {index > 0 && (
              <button onClick={() => handleRemoveManualLink(index)} style={{ padding: '8px 12px' }}>-</button>
            )}
          </div>
        ))}
        <button onClick={handleManualLinkPreview} disabled={loading} style={{ marginTop: 5 }}>
          Slack 메시지 미리보기 (링크 입력)
        </button>
      </div>

      {/* --- 오늘 업로드된 Wiki 기준 --- */} 
      <div style={{ marginBottom: 20, border: '1px solid #eee', padding: 15 }}>
         <h3 style={{ marginTop: 0 }}>옵션 B: 오늘 업로드된 Wiki 기준으로 생성</h3>
         <button onClick={handleTodaySlackPreview} disabled={loading}>
           오늘의 wiki Slack 메시지 미리보기
         </button>
      </div>

      {/* --- 공통 에러 메시지 --- */} 
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {/* === 생성된 Wiki 내용 (참고용) === */}
      {wikiTitle && (
        <div style={{ marginTop: 40, borderTop: '1px solid #eee', paddingTop: 20 }}>
          <h2>참고: 생성된 Wiki 제목</h2>
          <p>{wikiTitle}</p>
        </div>
      )}
      {wikiContent && (
        <div style={{ marginTop: 20 }}>
          <h2>참고: 생성된 Wiki 본문 (Confluence Markup)</h2>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{wikiContent}</pre>
        </div>
      )}

      {/* --- Slack 미리보기 및 수정 영역 (공통 사용) --- */} 
      {editableSlackMessage && (
        <div style={{ marginTop: 20 }}>
          <h3>Slack 메시지 미리보기 (수정 가능)</h3>
          <textarea
            value={editableSlackMessage}
            onChange={(e) => setEditableSlackMessage(e.target.value)}
            style={{ width: '100%', minHeight: '150px', padding: '10px', border: '1px solid #ccc', boxSizing: 'border-box' }}
          />
           {/* Slack 전송 버튼 */}
           <button onClick={handleSendSlackMessage} disabled={loading || !editableSlackMessage} style={{ marginTop: 10 }}>
             {loading ? '전송 중...' : 'Slack 메시지 전송'}
           </button>
        </div>
      )}

       {/* --- Slack 전송 결과 (공통 사용) --- */} 
      {sendResult && (
        <div style={{ marginTop: 20 }}>
          <h3>Slack 전송 결과</h3>
          <p>{sendResult}</p>
        </div>
      )}
    </div>
  );
};

export default HomePage;
