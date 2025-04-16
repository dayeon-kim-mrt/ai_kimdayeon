import { useState, useCallback } from 'react';
import { 
  getPageTitlesByIds, 
  PageInfo 
} from '../api/confluenceApi';
import { 
  generateSummary, 
  generateSlackElements, 
  SlackElementRequestPage 
} from '../api/claudeApi';
import { parsePageIdFromUrl } from '../utils/helpers';

export const useManualSlackPreview = () => {
  const [manualLinks, setManualLinks] = useState<string[]>(['']);
  const [previewMessage, setPreviewMessage] = useState<string>('');
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const handleManualLinkChange = useCallback((index: number, value: string) => {
    const newLinks = [...manualLinks];
    newLinks[index] = value;
    setManualLinks(newLinks);
  }, [manualLinks]);

  const handleAddManualLink = useCallback(() => {
    setManualLinks(prevLinks => [...prevLinks, '']);
  }, []);

  const handleRemoveManualLink = useCallback((indexToRemove: number) => {
    if (manualLinks.length <= 1) return; // Keep at least one input
    setManualLinks(prevLinks => prevLinks.filter((_, index) => index !== indexToRemove));
  }, [manualLinks.length]);

  const generatePreview = async () => {
    setIsPreviewLoading(true);
    setPreviewError(null);
    setPreviewMessage('');

    const validUrls = manualLinks.map(link => link.trim()).filter(link => link !== '');
    if (validUrls.length === 0) {
      setPreviewError('미리보기를 생성할 유효한 Confluence 링크를 하나 이상 입력하세요.');
      setIsPreviewLoading(false);
      return;
    }

    const pageIds = validUrls.map(parsePageIdFromUrl).filter((id): id is string => id !== null);

    if (pageIds.length !== validUrls.length) {
      console.warn('Some URLs did not contain valid Confluence Page IDs and were skipped.');
    }
    if (pageIds.length === 0) {
       setPreviewError('입력된 URL에서 유효한 Confluence Page ID를 추출할 수 없습니다. URL 형식을 확인하세요. (예: .../pages/12345/...)');
       setIsPreviewLoading(false);
       return;
    }

    try {
      const pagesInfo: PageInfo[] = await getPageTitlesByIds(pageIds);
      if (!pagesInfo || pagesInfo.length === 0) {
        throw new Error('링크에서 페이지 정보를 가져올 수 없습니다. ID나 권한을 확인하세요.');
      }

      const summaryPromises = pagesInfo.map(page => 
        generateSummary(page.content)
      );
      const summaries = await Promise.all(summaryPromises);

      const pagesForElements: SlackElementRequestPage[] = pagesInfo.map((page, index) => ({
        title: page.title,
        summary: summaries[index] || ''
      }));
      
      const { emojis, closingRemark } = await generateSlackElements(pagesForElements);

      let message = ':mega: *모두의 AI 영상이 업로드 되었어요~*\n\n';
      pagesInfo.forEach((page, index) => {
        const emoji = emojis[index]?.emoji || ':page_facing_up:';
        const summary = summaries[index] || '(요약)'; 
        message += `${emoji} *${page.title}*\n`;
        message += `${summary}\n`; 
        message += `<${page.url}>\n\n`;
      });
      message += `${closingRemark}\n`;

      setPreviewMessage(message);

    } catch (err: any) {
      console.error('Manual Slack Preview Error:', err);
      setPreviewError(err.message || '입력된 링크 기반 Slack 미리보기 생성 오류');
    } finally {
      setIsPreviewLoading(false);
    }
  };
  
  // Function to allow setting preview message externally (e.g., from today's preview)
  const setExternalPreviewMessage = useCallback((message: string) => {
      setPreviewMessage(message);
  }, []);

  return {
    manualLinks,
    handleManualLinkChange,
    handleAddManualLink,
    handleRemoveManualLink,
    previewMessage,
    isPreviewLoading,
    previewError,
    generatePreview,
    clearPreviewError: () => setPreviewError(null),
    setExternalPreviewMessage // Expose setter
  };
}; 