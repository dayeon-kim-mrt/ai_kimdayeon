import { useState } from 'react';
import axios from 'axios';
import { readFileAsText } from '../utils/helpers';

interface UploadParams {
  srtFile: File;
  driveLink: string;
}

interface UseWikiUploadReturn {
  pageUrl: string | null;
  isUploading: boolean;
  uploadError: string | null;
  uploadWiki: (params: UploadParams) => Promise<void>;
  clearUploadResult: () => void;
  clearUploadError: () => void;
}

export const useWikiUpload = (): UseWikiUploadReturn => {
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadWiki = async ({ srtFile, driveLink }: UploadParams) => {
    setIsUploading(true);
    setUploadError(null);
    setPageUrl(null);

    try {
      const srtContent = await readFileAsText(srtFile);
      console.log('[useWikiUpload] SRT file read successfully.');

      console.log('[useWikiUpload] Calling backend /api/createWikiPageFromSource...');
      const response = await axios.post('/api/createWikiPageFromSource', { 
        srtContent, 
        driveLink 
      });

      const createdPageUrl = response.data.pageUrl;
      if (!createdPageUrl) {
        throw new Error('Backend did not return a page URL.');
      }
      setPageUrl(createdPageUrl);
      console.log(`[useWikiUpload] Wiki page created successfully: ${createdPageUrl}`);

    } catch (err: any) {
      console.error('Wiki Upload Hook Error:', err);
      const backendError = err.response?.data?.error || err.message;
      setUploadError(backendError || '위키 페이지 생성 중 오류 발생');
    } finally {
      setIsUploading(false);
    }
  };

  return {
    pageUrl,
    isUploading,
    uploadError,
    uploadWiki,
    clearUploadResult: () => setPageUrl(null),
    clearUploadError: () => setUploadError(null),
  };
}; 