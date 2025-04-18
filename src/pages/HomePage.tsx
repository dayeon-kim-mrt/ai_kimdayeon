// src/pages/HomePage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  Button,
  LoadingOverlay,
  Textarea,
  TextInput,
  ActionIcon,
  Alert,
  Group,
  Box,
  CopyButton,
  FileInput,
  Text,
  Container,
  Paper,
  Title,
  Space,
  Divider,
  Loader,
  Progress,
  Anchor,
} from '@mantine/core';
import { IconCirclePlus, IconTrash, IconClipboardCopy, IconCheck, IconAlertCircle, IconSend, IconVideo, IconDownload, IconUpload, IconBook } from '@tabler/icons-react';
import { useWikiUpload } from '../hooks/useWikiUpload';           // 위키 페이지 생성 (SRT + Drive Link) 훅
import useSlackPreview from '../hooks/useSlackPreview';      // 새로운 통합 훅 추가
import { useSlackSender } from '../hooks/useSlackSender';          // Slack 메시지 전송 훅
import axios from 'axios'; // API 호출을 위해 axios 추가

// --- Helper for API Base URL ---
// It's better to get this from config or env variable
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001';

// Define processing status types
type VideoProcessingStatus =
  | 'idle'
  | 'uploading'
  | 'processing_srt' // Simplified status
  | 'processing_ffmpeg' // Simplified status
  | 'complete'
  | 'error';

const HomePage: React.FC = () => {
  // --- 커스텀 훅 사용 ---
  // 각 훅을 호출하여 필요한 상태와 해당 상태를 조작하는 함수들을 가져옵니다.

  // 위키 업로드 관련 상태 및 함수
  const {
    pageUrl,                // 생성된 위키 페이지 URL 상태
    isUploading: isWikiUploading,            // 위키 업로드 진행 중 여부 상태
    uploadError: wikiUploadError,            // 위키 업로드 관련 에러 메시지 상태
    uploadWiki,             // 변경된 업로드 함수
    clearUploadResult,      // 결과 초기화 함수
    clearUploadError: clearWikiUploadError,       // 업로드 에러 메시지 초기화 함수
  } = useWikiUpload();

  // 새로운 통합 Slack 미리보기 훅 사용
  const {
    slackPreview,       // 공통 미리보기 메시지 상태
    isLoading: isPreviewLoading,     // 공통 로딩 상태
    error: previewError,         // 공통 에러 상태
    generatePreview, // 수동 생성 함수
  } = useSlackPreview();

  // Slack 메시지 전송 관련 상태 및 함수
  const {
    sendResult,             // Slack 전송 결과 메시지 상태
    isSending,              // 전송 진행 중 여부 상태
    sendError,              // 전송 관련 에러 메시지 상태
    clearSendResult,        // 전송 결과 메시지 초기화 함수
    clearSendError,         // 전송 에러 메시지 초기화 함수
    sendMessage,            // 메시지 전송 함수
  } = useSlackSender();

  // --- 컴포넌트 자체 상태 ---
  // 수동 링크 입력 상태는 HomePage에서 관리
  const [manualLinks, setManualLinks] = useState<string[]>(['']);
  // 편집 가능한 최종 Slack 메시지 상태
  const [editableSlackMessage, setEditableSlackMessage] = useState<string>('');
  const [srtFile, setSrtFile] = useState<File | null>(null); // 위키 업로드용 상태 유지
  const [driveLink, setDriveLink] = useState<string>(''); // 위키 업로드용 상태 유지

  // --- 영상 처리 관련 새로운 상태 ---
  const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);
  const [videoProcessingStatus, setVideoProcessingStatus] = useState<VideoProcessingStatus>('idle');
  const [processedVideoFilename, setProcessedVideoFilename] = useState<string | null>(null);
  const [generatedSrtFilename, setGeneratedSrtFilename] = useState<string | null>(null); // <-- SRT 파일 이름 저장 상태
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isVideoProcessing, setIsVideoProcessing] = useState<boolean>(false); // 전체 처리 중 상태

  // --- Google Drive 업로드 관련 새로운 상태 ---
  const [isUploadingToDrive, setIsUploadingToDrive] = useState<boolean>(false);
  const [driveUploadResult, setDriveUploadResult] = useState<string | null>(null); // Stores success message or link
  const [driveUploadError, setDriveUploadError] = useState<string | null>(null);

  // --- 자동 Wiki 생성 관련 상태 ---
  const [isCreatingWiki, setIsCreatingWiki] = useState<boolean>(false); // Wiki 생성 로딩 상태

  // --- 수동 링크 관리 핸들러 (HomePage에 유지) ---
  const handleManualLinkChange = useCallback((index: number, value: string) => {
    const newLinks = [...manualLinks];
    newLinks[index] = value;
    setManualLinks(newLinks);
  }, [manualLinks]);

  const handleAddManualLink = useCallback(() => {
    setManualLinks(prevLinks => [...prevLinks, '']);
  }, []);

  const handleRemoveManualLink = useCallback((indexToRemove: number) => {
    if (manualLinks.length <= 1) return; 
    setManualLinks(prevLinks => prevLinks.filter((_, index) => index !== indexToRemove));
  }, [manualLinks.length]);

  // --- useEffect 훅: 미리보기 생성 시 편집 가능 메시지 업데이트 ---
  useEffect(() => {
    // useSlackPreview 훅의 previewMessage 상태를 사용
    if (slackPreview) {
      setEditableSlackMessage(slackPreview);
    }
    // 미리보기가 초기화될 때(빈 문자열) 편집 영역도 비움 (선택적)
    else {
        setEditableSlackMessage('');
    }
  }, [slackPreview]);

  // --- 이벤트 핸들러: 훅 함수 또는 지역 상태 사용 ---
  // 각 UI 요소(파일 입력, 버튼 등)와 상호작용할 때 실행될 함수들

  // SRT 파일 입력 변경 시 처리
  const handleFileUploadChange = (file: File | null) => {
    setSrtFile(file); 
    clearUploadResult(); // 이전 결과 초기화
    clearWikiUploadError();
  };

  // "오늘의 Wiki" 버튼 핸들러 - 새 훅의 함수 호출
  const handleGenerateTodayPreview = () => {
    generatePreview({ today: true });
  };

  // "직접 입력 링크" 버튼 핸들러 - 새 훅의 함수 호출, manualLinks 전달
  const handleGenerateManualPreview = () => {
    const urls = manualLinks.map(link => link.trim()).filter(link => link);
    if (urls.length === 0) {
      console.warn("No valid URLs provided for manual preview.");
      return; 
    }
    
    generatePreview({ pageUrls: urls }); // pageUrls로 원본 URL 배열 전달
  };

  // "전송" 버튼 핸들러
  const handleSendToSlack = () => {
    if (!editableSlackMessage) {
      console.error('전송할 메시지가 없습니다.'); 
      return;
    }
    clearSendError();
    sendMessage(editableSlackMessage);
  };

  // 생성된 위키 URL을 수동 링크 입력에 추가하는 핸들러
  const handleSlackInput = () => {
    if (!pageUrl) return;
    const currentLinks = [...manualLinks];
    const firstEmptyIndex = currentLinks.findIndex(link => link.trim() === '');
    if (firstEmptyIndex !== -1) {
      handleManualLinkChange(firstEmptyIndex, pageUrl);
    } else {
      handleAddManualLink();
      setTimeout(() => handleManualLinkChange(currentLinks.length, pageUrl), 0); 
    }
  };

  // 위키 업로드 버튼 핸들러 
  const handleManualUpload = () => {
    if (!srtFile || !driveLink.trim()) {
      console.error("SRT 파일이 선택되지 않았거나 구글 드라이브 링크가 입력되지 않았습니다.");
      return;
    }
    
    clearWikiUploadError();
    clearUploadResult(); 
    uploadWiki({ srtFile, driveLink });
  };

  // --- 영상 처리 관련 새로운 핸들러 ---
  const handleVideoFileChange = (file: File | null) => {
    setSelectedVideoFile(file);
    setVideoProcessingStatus('idle');
    setProcessedVideoFilename(null);
    setGeneratedSrtFilename(null);
    setVideoError(null);
    setIsVideoProcessing(false);
    setIsUploadingToDrive(false);
    setDriveUploadResult(null);
    setDriveUploadError(null);
    setIsCreatingWiki(false);
    clearWikiUploadError();
    clearUploadResult();
  };

  const handleProcessVideo = async () => {
    if (!selectedVideoFile) {
      setVideoError('처리할 MP4 파일을 선택해주세요.');
      return;
    }

    setIsVideoProcessing(true);
    setVideoProcessingStatus('uploading'); // Start with uploading status
    setVideoError(null);
    setProcessedVideoFilename(null);
    setIsUploadingToDrive(false);
    setDriveUploadResult(null); 
    setDriveUploadError(null);

    const formData = new FormData();
    formData.append('video', selectedVideoFile);

    try {
      console.log('Sending video to backend for processing...');
      const response = await axios.post(`${API_BASE_URL}/api/video/process-video`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setVideoProcessingStatus('complete');
      setProcessedVideoFilename(response.data.processedFilename);
      setGeneratedSrtFilename(response.data.srtFilename);
      console.log('Video processing successful:', response.data);

    } catch (err: any) {
      console.error('Video processing failed:', err);
      setVideoProcessingStatus('error');
      if (axios.isAxiosError(err) && err.response) {
        setVideoError(err.response.data?.message || err.response.data?.error || '영상 처리 중 오류가 발생했습니다.');
      } else {
        setVideoError('영상 처리 중 오류가 발생했습니다. 서버 연결을 확인하세요.');
      }
    } finally {
      setIsVideoProcessing(false);
    }
  };

  // Status message mapping
  const getStatusMessage = (): string => {
    switch (videoProcessingStatus) {
      case 'idle': return 'MP4 파일을 선택하고 처리 시작 버튼을 누르세요.';
      case 'uploading': return '영상 업로드 및 처리 중... 시간이 걸릴 수 있습니다. 서버 로그를 확인하세요.'; // Simplified message
      case 'processing_srt': return '자막(SRT) 생성 중... 서버 로그를 확인하세요.'; // Kept for reference, but combined above
      case 'processing_ffmpeg': return '자막을 영상에 입히는 중... 서버 로그를 확인하세요.'; // Kept for reference, but combined above
      case 'complete': return '영상 처리가 완료되었습니다! 아래 버튼으로 다운로드 또는 Drive 업로드하세요.'; // Modified message
      case 'error': return `오류 발생: ${videoError || '알 수 없는 오류'}`;
      default: return '';
    }
  };

  // --- Google Drive 업로드 핸들러 --- 
  const handleUploadToDrive = async () => {
    if (!processedVideoFilename) {
      setDriveUploadError('업로드할 처리된 영상 파일 정보가 없습니다.');
      return;
    }

    setIsUploadingToDrive(true);
    setDriveUploadResult(null);
    setDriveUploadError(null);

    try {
      console.log(`Requesting Google Drive upload for: ${processedVideoFilename}`);
      const response = await axios.post(`${API_BASE_URL}/api/video/upload-to-drive`, {
        processedFilename: processedVideoFilename, // Send the filename in the body
      });

      console.log('Google Drive upload successful:', response.data);
      setDriveUploadResult(response.data.driveLink || response.data.message); // Store link or message

    } catch (err: any) {
      console.error('Google Drive upload failed:', err);
      if (axios.isAxiosError(err) && err.response) {
        setDriveUploadError(err.response.data?.message || err.response.data?.error || 'Google Drive 업로드 중 오류 발생');
      } else {
        setDriveUploadError('Google Drive 업로드 중 오류 발생 (서버 연결 확인)');
      }
    } finally {
      setIsUploadingToDrive(false);
    }
  };

  // --- 새로운 핸들러: 자동 Wiki 생성 --- 
  const handleCreateWikiPage = async () => {
    if (!generatedSrtFilename || !driveUploadResult || !driveUploadResult.startsWith('http')) {
      console.error('SRT 파일 이름 또는 유효한 Drive 링크 X.');
      return;
    }

    setIsCreatingWiki(true);
    clearWikiUploadError(); 
    clearUploadResult(); 

    try {
      // 1. Fetch SRT content
      console.log(`Fetching SRT content for: ${generatedSrtFilename}`);
      const srtResponse = await axios.get(`${API_BASE_URL}/api/video/srt-content`, {
        params: { filename: generatedSrtFilename },
        responseType: 'text' 
      });
      const srtContent = srtResponse.data;

      // 2. Create File object from content
      const newSrtFile = new File([srtContent], generatedSrtFilename, { type: 'text/plain' });

      // 3. Extract Drive link (assuming driveUploadResult holds the link)
      const actualDriveLink = driveUploadResult; 

      // 4. Call existing uploadWiki hook function
      console.log('Calling uploadWiki with generated SRT file and Drive link...');
      await uploadWiki({ srtFile: newSrtFile, driveLink: actualDriveLink });
      console.log('uploadWiki call finished.');

    } catch (err: any) {
      console.error('Automated Wiki page creation failed:', err);
    } finally {
      setIsCreatingWiki(false);
    }
  };

  // --- 로딩 상태 관리 ---
  // 전체 로딩 상태 결정 (선택적, 단일 오버레이용)
  const isOverallLoading = isWikiUploading || isPreviewLoading || isSending || isVideoProcessing || isUploadingToDrive || isCreatingWiki;

  // --- JSX 렌더링 ---
  // UI 구조 정의
  return (
    <Container size="md" my="xl">
      <Title order={1} ta="center" mb="xl">
        AI Confluence to Slack (and Video Subtitler!)
      </Title>

      {/* 전체 로딩 오버레이 */}
      <LoadingOverlay visible={isOverallLoading} overlayProps={{ radius: "sm", blur: 2 }} />

      {/* === 새로운 섹션: 영상 자막 생성 및 삽입 === */}
      <Paper shadow="xs" p="md" mb="lg">
        <h2>영상 자막 생성 및 삽입</h2>
        <FileInput
            mb="sm"
            label="MP4 영상 파일 첨부"
            placeholder="MP4 파일을 선택하세요"
            accept="video/mp4" // accept 속성 사용
            value={selectedVideoFile}
            onChange={handleVideoFileChange}
            clearable
            leftSection={<IconVideo size={16} />}
            disabled={isVideoProcessing || isUploadingToDrive} // Also disable during Drive upload
        />
        <Button
            onClick={handleProcessVideo}
            disabled={!selectedVideoFile || isVideoProcessing || isUploadingToDrive} 
            loading={isVideoProcessing}
            mb="sm"
        >
            자막 생성 및 영상 만들기
        </Button>

        {/* 상태 메시지 표시 */}
        {videoProcessingStatus !== 'idle' && (
             <Alert
                icon={videoProcessingStatus === 'error' ? <IconAlertCircle size={16}/> : (videoProcessingStatus === 'complete' ? <IconCheck size={16}/> : <Loader size="xs"/>)}
                title={
                  videoProcessingStatus === 'error' ? '오류' : 
                  videoProcessingStatus === 'complete' ? '완료' : '처리 중'
                }
                color={
                  videoProcessingStatus === 'error' ? 'red' : 
                  videoProcessingStatus === 'complete' ? 'teal' : 'blue'
                }
                mb="sm"
             >
                {getStatusMessage()}
             </Alert>
        )}

        {/* --- 결과 버튼 그룹 (처리 완료 시) --- */}
        {videoProcessingStatus === 'complete' && processedVideoFilename && (
          <Group mt="sm"> {/* Group buttons together */}
            {/* 다운로드 버튼 */}
            <Button
              component="a"
              href={`${API_BASE_URL}/api/video/download-video/${processedVideoFilename}`}
              download
              leftSection={<IconDownload size={16} />}
              variant="outline"
              disabled={isUploadingToDrive} // Disable while uploading to Drive
            >
              결과 영상 다운로드
            </Button>

            {/* Google Drive 업로드 버튼 */}
            <Button
              onClick={handleUploadToDrive}
              leftSection={<IconUpload size={16} />} // Use upload icon
              loading={isUploadingToDrive} // Show loading spinner
              disabled={isUploadingToDrive} // Disable while uploading
            >
              Google Drive에 업로드
            </Button>
          </Group>
        )}

        {/* Google Drive 업로드 결과/오류 표시 */}
        {isUploadingToDrive && !driveUploadError && (
             <Alert icon={<Loader size="xs"/>} title="Drive 업로드 중..." color="blue" mt="sm">
                 Google Drive에 업로드하고 있습니다...
             </Alert>
        )}
        {driveUploadError && (
            <Alert icon={<IconAlertCircle size={16}/>} color="red" title="Drive 업로드 오류" mt="sm" withCloseButton onClose={() => setDriveUploadError(null)}>
                {driveUploadError}
            </Alert>
        )}
        {driveUploadResult && (
             <Alert icon={<IconCheck size={16}/>} color="teal" title="Drive 업로드 성공" mt="sm" withCloseButton={!(isCreatingWiki || isWikiUploading)} onClose={() => {setDriveUploadResult(null); clearUploadResult(); /* Clear wiki result too */ }}>
                 {driveUploadResult.startsWith('http') ? (
                     <Text>업로드 완료! 링크: <Anchor href={driveUploadResult} target="_blank">{driveUploadResult}</Anchor></Text>
                 ) : (
                     <Text>{driveUploadResult}</Text>
                 )}
                 <Button mt="xs" leftSection={<IconBook size={16}/>} onClick={handleCreateWikiPage} loading={isCreatingWiki || isWikiUploading} disabled={!generatedSrtFilename || !driveUploadResult || !driveUploadResult.startsWith('http') || isOverallLoading}> Confluence 페이지 생성 </Button>
                 {wikiUploadError && !isCreatingWiki && !isWikiUploading && ( <Alert color="orange" title="Wiki 생성 오류" mt="sm" withCloseButton onClose={clearWikiUploadError}>{wikiUploadError}</Alert> )}
                 {pageUrl && !isCreatingWiki && !isWikiUploading && ( <Alert color="lime" title="Wiki 생성 완료" mt="sm" withCloseButton onClose={clearUploadResult}> 생성된 Wiki 페이지: <Anchor href={pageUrl} target="_blank">{pageUrl}</Anchor> </Alert> )}
             </Alert>
        )}

         {/* 에러 발생 시 재시도 버튼 */}
         {videoProcessingStatus === 'error' && (
             <Button onClick={handleVideoFileChange.bind(null, null)} color="gray" variant="outline" size="xs" ml="sm">
                다시 시도 (파일 재선택)
             </Button>
         )}
      </Paper>
      <Divider my="xl" /> {/* 섹션 구분선 추가 */}

      {/* === 1. 위키 업로드 섹션 === */}
      <Paper shadow="xs" p="md" mb="lg">
        <h2>1. Confluence 페이지 생성</h2>
        {/* SRT 파일 입력 */}
        <Group mb="sm"> {/* 컴포넌트 그룹 (marginBottom: small) */}
            <FileInput
                label="SRT 자막 파일 첨부"
                placeholder="SRT 파일을 선택하세요"
                accept=".srt" // .srt 확장자만 허용
                value={srtFile} // 파일 상태 연결
                onChange={handleFileUploadChange} // 파일 변경 시 핸들러 연결
                clearable // 파일 선택 취소 버튼 표시
                style={{ flexGrow: 1 }} // 그룹 내에서 가능한 많은 공간 차지
                disabled={isOverallLoading} // 전체 로딩 시 비활성화
            />
        </Group>
        {/* 구글 드라이브 링크 입력 */}
        <TextInput
          mb="sm"
          label="구글 드라이브 링크"
          placeholder="https://drive.google.com/..."
          value={driveLink} // 링크 상태 연결
          onChange={(e) => setDriveLink(e.target.value)} // 입력 변경 시 상태 업데이트
          required // 필수 입력 필드 표시
          disabled={isOverallLoading} // 전체 로딩 시 비활성화
        />
        {/* 위키 생성 버튼 */}
        <Button
          onClick={handleManualUpload} // 클릭 시 업로드 핸들러 실행
          disabled={isOverallLoading || !srtFile || !driveLink.trim()} // 업로드 중이거나 필수 입력값이 없으면 비활성화
          loading={isWikiUploading} // 업로드 중일 때 로딩 스피너 표시
        >
          위키 페이지 생성
        </Button>
        {/* 업로드 에러 메시지 표시 */}
        {wikiUploadError && isWikiUploading && (
            <Alert
              color="red"
              title="업로드 오류"
              mt="sm" // marginTop: small
              onClose={clearWikiUploadError} // 닫기 버튼 클릭 시 에러 초기화
              withCloseButton // 닫기 버튼 표시
            >
              {wikiUploadError}
            </Alert>
        )}
        {/* 페이지 생성 성공 시 URL 및 버튼 표시 */}
        {pageUrl && !isWikiUploading && (
          <Alert color="teal" title="페이지 생성 완료" mt="sm" onClose={clearUploadResult} withCloseButton>
            <Text>생성된 페이지 URL: <a href={pageUrl} target="_blank" rel="noopener noreferrer">{pageUrl}</a></Text>
             <Group mt="xs"> {/* marginTop: extra small */}
                {/* URL 복사 버튼 */}
                <CopyButton value={pageUrl} timeout={2000}>
                    {({ copied, copy }) => (
                        // useEffect 제거: 훅 규칙 위반.
                        // copied 상태를 직접 사용하여 UI 업데이트
                        <Button 
                          color={copied ? 'teal' : 'blue'} // 복사 상태에 따라 버튼 색 변경
                          onClick={copy} // 클릭 시 복사 실행
                          leftSection={copied ? <IconCheck size={16}/> : <IconClipboardCopy size={16} />} // 아이콘 변경
                        >
                            {copied ? '복사 완료!' : 'URL 복사'} {/* 버튼 텍스트 변경 */} 
                        </Button>
                    )}
                </CopyButton>
                {/* Slack 메시지 Input 버튼 */}
                 <Button onClick={handleSlackInput} variant="outline">
                    Slack 메시지 Input
                 </Button>
             </Group>
          </Alert>
        )}
      </Paper>

      {/* === 2. Slack 메시지 생성 섹션 === */}
      <Paper shadow="xs" p="md" mb="lg">
        <h2>2. Slack 메시지 생성</h2>

        {/* --- 옵션 B: 오늘의 Wiki 기반 미리보기 생성 --- */}
        <Box mb="md"> {/* marginBottom: medium */}
            <Button
              onClick={handleGenerateTodayPreview}
              loading={isPreviewLoading}
              disabled={isOverallLoading}
            >
               오늘의 Wiki 기반 미리보기 생성
            </Button>
            {/* 공통 에러 상태 사용 */}
            {previewError && (
                <Alert color="red" title="미리보기 오류" mt="sm" onClose={() => {}} withCloseButton>
                  {previewError}
                </Alert>
            )}
        </Box>

        {/* --- 옵션 A: 직접 입력 링크 기반 미리보기 생성 --- */}
        <Box mb="md">
             <Text fw={500} mb={4}>직접 입력 링크 기반 미리보기 생성</Text> {/* fontWeight: 500 */}
            {/* 수동 링크 입력 필드 (HomePage에서 관리하는 manualLinks 사용) */}
            {manualLinks.map((link, index) => (
              <Group key={index} mb="xs"> {/* 각 링크 입력 그룹 */}
                <TextInput
                  placeholder="https://your.confluence.com/display/SPACE/12345678/Page+Title"
                  value={link} // 링크 상태 연결
                  onChange={(e) => handleManualLinkChange(index, e.currentTarget.value)} // 변경 시 핸들러 연결
                  style={{ flexGrow: 1 }} // 가능한 많은 공간 차지
                />
                {/* 링크 입력 필드가 1개 초과일 때만 제거 버튼 표시 */}
                {manualLinks.length > 1 && (
                  <ActionIcon variant="subtle" color="red" onClick={() => handleRemoveManualLink(index)} title="링크 제거">
                    <IconTrash size={18} />
                  </ActionIcon>
                )}
              </Group>
            ))}
            {/* 링크 추가 / 미리보기 생성 버튼 그룹 */}
             <Group mt="xs">
                 {/* 링크 추가 버튼 */}
                 <Button
                   onClick={handleAddManualLink}
                   variant="light" // 밝은 스타일 버튼
                   leftSection={<IconCirclePlus size={16}/>} // 버튼 왼쪽 아이콘
                   size="xs" // 작은 크기 버튼
                 >
                     링크 추가
                 </Button>
                 {/* 미리보기 생성 버튼 */}
                 <Button
                   onClick={handleGenerateManualPreview}
                   loading={isPreviewLoading}
                   // 다른 작업 진행 중이거나 입력된 링크가 없으면 비활성화
                   disabled={isOverallLoading || manualLinks.every(l => l.trim() === '')}
                   ml="auto" // 오른쪽으로 밀기 (오른쪽 정렬 효과)
                 >
                    입력 링크로 미리보기 생성
                 </Button>
             </Group>
        </Box>

        {/* --- 공통: Slack 메시지 편집 및 전송 영역 --- */}
        <Textarea
          label="Slack 메시지 미리보기 (편집 가능)"
          placeholder="미리보기 버튼을 누르면 내용이 생성됩니다..."
          value={editableSlackMessage} // 편집 가능한 메시지 상태 연결
          onChange={(event) => setEditableSlackMessage(event.currentTarget.value)} // 변경 시 상태 업데이트
          autosize // 내용에 따라 높이 자동 조절
          minRows={6} // 최소 높이 6줄
          mb="sm" // marginBottom: small
        />
        {/* 메시지 전송 버튼 */}
        <Button
          onClick={handleSendToSlack}
          loading={isSending}
          // 보낼 메시지가 없거나 다른 작업 진행 중이면 비활성화
          disabled={!editableSlackMessage || isOverallLoading}
        >
          Slack 메시지 전송
        </Button>
        {/* 전송 에러 메시지 표시 */}
        {sendError && (
            <Alert color="red" title="전송 오류" mt="sm" onClose={clearSendError} withCloseButton>
              {sendError}
            </Alert>
        )}
        {/* 전송 성공 메시지 표시 */}
        {sendResult && (
            <Alert color="green" title="전송 성공" mt="sm" onClose={clearSendResult} withCloseButton>
              {sendResult}
            </Alert>
        )}
      </Paper>

    </Container>
  );
};

export default HomePage;