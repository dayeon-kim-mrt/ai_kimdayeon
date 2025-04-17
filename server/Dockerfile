# server/Dockerfile

# 1. Node.js 환경 설정 (Alpine 버전 사용 권장 - 이미지 크기 작음)
FROM node:lts-alpine AS base

# 2. 작업 디렉토리 설정
WORKDIR /usr/src/app

# 3. 의존성 설치 (package.json 변경 시에만 재설치하도록 분리)
COPY package*.json ./
# 운영 환경에서는 개발 의존성 제외
RUN npm install --only=production

# 4. 애플리케이션 소스 코드 복사
COPY . .

# 5. 애플리케이션 포트 노출 (config.js의 PORT와 일치)
EXPOSE 3001

# 6. 애플리케이션 실행 명령어
CMD [ "node", "index.js" ] 