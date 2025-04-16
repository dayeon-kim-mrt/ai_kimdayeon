// src/pages/HomePage.tsx
import React, { useState, useEffect } from 'react';
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
} from '@mantine/core';
import { IconCirclePlus, IconTrash, IconClipboardCopy, IconCheck } from '@tabler/icons-react';

// --- 커스텀 훅 임포트 ---
// 각 훅은 특정 기능과 관련된 상태 및 로직을 캡슐화합니다.
import { useWikiUpload } from '../hooks/useWikiUpload';           // 위키 페이지 생성 (SRT + Drive Link) 훅
import { useManualSlackPreview } from '../hooks/useManualSlackPreview'; // 직접 입력한 링크 기반 Slack 미리보기 생성 훅
import { useTodaySlackPreview } from '../hooks/useTodaySlackPreview';  // 오늘의 위키 기반 Slack 미리보기 생성 훅
import { useSlackSender } from '../hooks/useSlackSender';          // Slack 메시지 전송 훅

// 유틸리티 함수 (현재 HomePage에서는 직접 사용되지 않음)
// import { parsePageIdFromUrl } from '../utils/helpers'; // 이 컴포넌트에서는 더 이상 직접 필요하지 않음

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

  // 수동 링크 기반 Slack 미리보기 관련 상태 및 함수
  const {
    manualLinks,            // 직접 입력된 Confluence 링크 목록 상태
    handleManualLinkChange, // 링크 입력 변경 핸들러
    handleAddManualLink,    // 링크 입력 필드 추가 핸들러
    handleRemoveManualLink, // 링크 입력 필드 제거 핸들러
    previewMessage: manualPreviewMessage, // 생성된 미리보기 메시지 상태 (이름 충돌 방지를 위해 이름 변경)
    isPreviewLoading: isManualPreviewLoading, // 미리보기 생성 진행 중 여부 상태
    previewError: manualPreviewError,       // 미리보기 생성 관련 에러 메시지 상태
    generatePreview: generateManualPreview, // 미리보기 생성 실행 함수
    clearPreviewError: clearManualPreviewError, // 미리보기 에러 메시지 초기화 함수
    // setExternalPreviewMessage, // 외부에서 미리보기 메시지 설정 함수 (오늘의 미리보기->편집 영역 반영용)
  } = useManualSlackPreview();

  // 오늘의 위키 기반 Slack 미리보기 관련 상태 및 함수
  const {
    todayPreviewMessage,      // 생성된 미리보기 메시지 상태
    isTodayPreviewLoading,    // 미리보기 생성 진행 중 여부 상태
    todayPreviewError,        // 미리보기 생성 관련 에러 메시지 상태
    generateTodayPreview,     // 미리보기 생성 실행 함수
    clearTodayPreviewError,   // 미리보기 에러 메시지 초기화 함수
    // setTodayPreviewMessage, // 외부에서 미리보기 메시지 설정 함수 (UI 표시용)
  } = useTodaySlackPreview();

  // Slack 메시지 전송 관련 상태 및 함수
  const {
    sendResult,             // Slack 전송 결과 메시지 상태
    isSending,              // 전송 진행 중 여부 상태
    sendError,              // 전송 관련 에러 메시지 상태
    sendMessage,            // 메시지 전송 실행 함수
    clearSendResult,        // 전송 결과 메시지 초기화 함수
    clearSendError,         // 전송 에러 메시지 초기화 함수
  } = useSlackSender();

  // --- 컴포넌트 자체 상태 ---
  // 편집 가능한 최종 Slack 메시지 상태
  const [editableSlackMessage, setEditableSlackMessage] = useState<string>('');

  // --- useEffect 훅: 미리보기 생성 시 편집 가능 메시지 업데이트 ---
  // 각 미리보기 훅에서 메시지가 성공적으로 생성되면 해당 메시지를 editableSlackMessage에 반영
  useEffect(() => {
    if (manualPreviewMessage) {
      setEditableSlackMessage(manualPreviewMessage);
    }
  }, [manualPreviewMessage]); // manualPreviewMessage가 변경될 때만 실행

  useEffect(() => {
    if (todayPreviewMessage) {
      setEditableSlackMessage(todayPreviewMessage);
    }
  }, [todayPreviewMessage]); // todayPreviewMessage가 변경될 때만 실행

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

  // "오늘의 Wiki" 버튼 핸들러
  const handleGenerateTodayPreview = async () => {
      clearManualPreviewError(); // 다른 미리보기 에러 초기화
      await generateTodayPreview(); // 오늘의 미리보기 생성 로직 실행 (useTodaySlackPreview 훅)
  };

  // "직접 입력 링크" 버튼 핸들러
  const handleGenerateManualPreview = async () => {
      clearTodayPreviewError(); // 다른 미리보기 에러 초기화
      await generateManualPreview(); // 수동 링크 기반 미리보기 생성 로직 실행 (useManualSlackPreview 훅)
  };

  // "전송" 버튼 핸들러
  const handleSendMessage = () => {
      if (!editableSlackMessage) {
          // 필요시 useSlackSender 또는 지역 상태 통해 에러 설정
          console.error('전송할 메시지가 없습니다.');
          return;
      }
      clearSendError(); // 이전 전송 에러 초기화
      sendMessage(editableSlackMessage); // 메시지 전송 로직 실행 (useSlackSender 훅)
  };

  // 생성된 위키 URL을 수동 링크 입력에 추가하는 핸들러
  const handleSlackInput = () => {
    if (!pageUrl) return; // 생성된 URL이 없으면 무시

    // 로직은 유사하지만, useManualSlackPreview 훅의 상태 설정 함수 사용
    const currentLinks = [...manualLinks];
    const firstEmptyIndex = currentLinks.findIndex(link => link.trim() === ''); // 비어있는 첫번째 입력칸 찾기

    if (firstEmptyIndex !== -1) {
      // 빈 칸이 있으면 해당 칸에 URL 설정
      handleManualLinkChange(firstEmptyIndex, pageUrl);
    } else {
      // 빈 칸이 없으면 새 입력칸 추가 후 URL 설정
      handleAddManualLink();
      // 주의: 상태 업데이트(handleAddManualLink)가 비동기적으로 처리될 수 있으므로,
      //        약간의 지연(setTimeout 0) 후 새 칸에 값을 설정해야 안전합니다.
      setTimeout(() => handleManualLinkChange(currentLinks.length, pageUrl), 0);
    }
  };

  // --- 로딩 상태 관리 ---
  // 전체 로딩 상태 결정 (선택적, 단일 오버레이용)
  const isLoading = isUploading || isManualPreviewLoading || isTodayPreviewLoading || isSending;

  // --- JSX 렌더링 ---
  // UI 구조 정의
  return (
    <Box style={{ padding: 20, maxWidth: 800, margin: '0 auto' }}>
      <h1>Confluence 위키 업로드 & Slack 메시지 생성</h1>
      {/* 전체 로딩 오버레이 */}
      <LoadingOverlay visible={isLoading} overlayProps={{ radius: "sm", blur: 2 }} />

      {/* === 1. 위키 업로드 섹션 === */}
      <Box mb="xl"> {/* 섹션 간격 (marginBottom: extra large) */}
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
          disabled={isUploading || !srtFile || !driveLink.trim()} // 업로드 중이거나 필수 입력값이 없으면 비활성화
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
      </Box>

      {/* === 2. Slack 메시지 생성 섹션 === */}
      <Box mb="xl">
        <h2>2. Slack 메시지 생성</h2>

        {/* --- 옵션 B: 오늘의 Wiki 기반 미리보기 생성 --- */}
        <Box mb="md"> {/* marginBottom: medium */}
            <Button
              onClick={handleGenerateTodayPreview}
              loading={isTodayPreviewLoading}
              // 다른 작업 진행 중일 때는 비활성화
              disabled={isManualPreviewLoading || isUploading || isSending}
            >
               오늘의 Wiki 기반 미리보기 생성
            </Button>
            {/* 오늘의 미리보기 에러 메시지 표시 */}
            {todayPreviewError && (
                <Alert color="red" title="오류" mt="sm" onClose={clearTodayPreviewError} withCloseButton>
                  {todayPreviewError}
                </Alert>
            )}
        </Box>

        {/* --- 옵션 A: 직접 입력 링크 기반 미리보기 생성 --- */}
        <Box mb="md">
             <Text fw={500} mb={4}>직접 입력 링크 기반 미리보기 생성</Text> {/* fontWeight: 500 */}
            {/* 수동 링크 입력 필드 목록 */}
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
                   loading={isManualPreviewLoading}
                   // 다른 작업 진행 중이거나 입력된 링크가 없으면 비활성화
                   disabled={isTodayPreviewLoading || isUploading || isSending || manualLinks.every(l => l.trim() === '')}
                   ml="auto" // 오른쪽으로 밀기 (오른쪽 정렬 효과)
                 >
                    입력 링크로 미리보기 생성
                 </Button>
             </Group>
            {/* 수동 미리보기 에러 메시지 표시 */}
            {manualPreviewError && (
                <Alert color="red" title="오류" mt="sm" onClose={clearManualPreviewError} withCloseButton>
                  {manualPreviewError}
                </Alert>
            )}
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
          onClick={handleSendMessage}
          loading={isSending}
          // 보낼 메시지가 없거나 다른 작업 진행 중이면 비활성화
          disabled={!editableSlackMessage || isUploading || isManualPreviewLoading || isTodayPreviewLoading}
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
      </Box>

    </Box>
  );
};

export default HomePage;