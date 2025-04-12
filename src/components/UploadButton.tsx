// src/components/UploadButton.tsx

import React from 'react';

const UploadButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button onClick={onClick} style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}>
    위키 업로드
  </button>
);

export default UploadButton;
export {};  // 빈 export 추가
