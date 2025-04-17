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
} from '@mantine/core';
import { IconCirclePlus, IconTrash, IconClipboardCopy, IconCheck, IconAlertCircle, IconSend } from '@tabler/icons-react';
import { useWikiUpload } from '../hooks/useWikiUpload';           // 위키 페이지 생성 (SRT + Drive Link) 훅
import useSlackPreview from '../hooks/useSlackPreview';      // 새로운 통합 훅 추가
import { useSlackSender } from '../hooks/useSlackSender';          // Slack 메시지 전송 훅
import { parsePageIdFromUrl } from '../utils/helpers'; // 유틸리티 함수 임포트

const HomePage: React.FC = () => {
  // --- 커스텀 훅 사용 ---
  // 각 훅을 호출하여 필요한 상태와 해당 상태를 조작하는 함수들을 가져옵니다.

  // 위키 업로드 관련 상태 및 함수
  const {
    srtFile,                // 선택된 SRT 파일 상태
    setSrtFile,             // SRT 파일 상태 설정 함수
    driveLink,              // 입력된 구글 드라이브 링크 상태
    setDriveLink,           // 드라이브 링크 상태 설정 함수
    wikiTitle,              // 생성된 위키 제목 상태
    // wikiContent,         // 생성된 위키 본문 (현재 UI에 표시하지 않음)
    pageUrl,                // 생성된 위키 페이지 URL 상태
    setPageUrl,             // 페이지 URL 상태 설정 함수 (handleSlackInput에서 필요하여 setter 유지)
    isUploading,            // 위키 업로드 진행 중 여부 상태
    uploadError,            // 위키 업로드 관련 에러 메시지 상태
    handleUpload,           // 위키 업로드 실행 함수
    clearUploadError,       // 업로드 에러 메시지 초기화 함수
    setWikiTitle,           // 위키 제목 설정 함수 (파일 변경 시 초기화에 필요)
    setWikiContent,         // 위키 본문 설정 함수 (파일 변경 시 초기화에 필요)
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
    setSrtFile(file); // 파일 상태 업데이트 (useWikiUpload 훅)
    // 새 파일 선택 시 이전 업로드 결과 초기화
    setPageUrl(null);
    setWikiTitle('');
    setWikiContent(''); // wikiContent는 현재 UI 표시 안함
    clearUploadError();
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

    const extractedIds = urls
      .map(parsePageIdFromUrl)
      .filter((id): id is string => id !== null);

    if (extractedIds.length === 0) {
      console.warn("Could not extract valid page IDs from the provided URLs.");
      return;
    }
    
    generatePreview({ pageIds: extractedIds });
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

  // --- 로딩 상태 관리 ---
  // 전체 로딩 상태 결정 (선택적, 단일 오버레이용)
  const isOverallLoading = isUploading || isPreviewLoading || isSending;

  // --- JSX 렌더링 ---
  // UI 구조 정의
  return (
    <Container size="md" my="xl">
      <Title order={1} ta="center" mb="xl">
        AI Confluence to Slack
      </Title>

      {/* 전체 로딩 오버레이 */}
      <LoadingOverlay visible={isOverallLoading} overlayProps={{ radius: "sm", blur: 2 }} />

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
        />
        {/* 위키 생성 버튼 */}
        <Button
          onClick={handleUpload} // 클릭 시 업로드 핸들러 실행
          disabled={isOverallLoading || !srtFile || !driveLink.trim()} // 업로드 중이거나 필수 입력값이 없으면 비활성화
          loading={isUploading} // 업로드 중일 때 로딩 스피너 표시
        >
          위키 페이지 생성
        </Button>
        {/* 업로드 에러 메시지 표시 */}
        {uploadError && (
            <Alert
              color="red"
              title="업로드 오류"
              mt="sm" // marginTop: small
              onClose={clearUploadError} // 닫기 버튼 클릭 시 에러 초기화
              withCloseButton // 닫기 버튼 표시
            >
              {uploadError}
            </Alert>
        )}
        {/* 페이지 생성 성공 시 URL 및 버튼 표시 */}
        {pageUrl && (
          <Alert color="teal" title="페이지 생성 완료" mt="sm">
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
        {/* 생성된 위키 제목 표시 */}
        {wikiTitle && <Text mt="sm"><b>생성된 제목:</b> {wikiTitle}</Text>}
        {/* 필요시 위키 본문 미리보기 표시 */}
        {/* {wikiContent && <Textarea value={wikiContent} readOnly label="Generated Content Preview" autosize minRows={5} mt="sm"/>} */}
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