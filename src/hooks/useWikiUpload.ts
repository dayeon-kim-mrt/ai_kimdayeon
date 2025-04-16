import { useState } from 'react';
import { 
  generateWikiPageTitle, 
  chunkSummarizeScript 
} from '../api/claudeApi';
import { createConfluencePage } from '../api/confluenceApi';
import { readFileAsText } from '../utils/helpers';

export const useWikiUpload = () => {
  const [srtFile, setSrtFile] = useState<File | null>(null);
  const [driveLink, setDriveLink] = useState('');
  const [wikiTitle, setWikiTitle] = useState('');
  const [wikiContent, setWikiContent] = useState('');
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleUpload = async () => {
    if (!srtFile) {
      setUploadError('SRT 자막 파일을 먼저 선택하세요.');
      return;
    }
    if (!driveLink.trim()) {
      setUploadError('구글 드라이브 링크를 입력해주세요.');
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setWikiTitle('');
    setWikiContent('');
    setPageUrl(null);

    try {
      const scriptContent = await readFileAsText(srtFile);
      const title = await generateWikiPageTitle(scriptContent);
      setWikiTitle(title);

      let content = await chunkSummarizeScript(scriptContent);
      content = `h3. 구글 드라이브 링크:\n🔗 ${driveLink}\n\n${content}`;
      setWikiContent(content);

      const url = await createConfluencePage(title, content);
      setPageUrl(url);

    } catch (err: any) {
      console.error('Wiki Upload Error:', err);
      setUploadError(err.message || '위키 업로드 중 오류 발생');
    } finally {
      setIsUploading(false);
    }
  };

  return {
    srtFile,
    setSrtFile,
    driveLink,
    setDriveLink,
    wikiTitle,
    wikiContent,
    pageUrl,
    setPageUrl, // Allow resetting pageUrl if needed elsewhere
    isUploading,
    uploadError,
    handleUpload,
    clearUploadError: () => setUploadError(null), // Function to clear error message
    setWikiTitle,
    setWikiContent 
  };
}; 