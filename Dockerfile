# ./Dockerfile (프로젝트 루트)

# --- 단계 1: React 앱 빌드 ---
FROM node:lts-alpine AS builder

# 작업 디렉토리 설정
WORKDIR /app

# 의존성 설치 (루트 package.json 사용)
COPY package*.json ./
RUN npm install

# 소스 코드 복사 (전체 프로젝트)
# .dockerignore 파일에 의해 node_modules 등 불필요한 파일 제외됨
COPY . .

# React 앱 빌드
RUN npm run build

# --- 단계 2: Nginx로 정적 파일 서빙 ---
FROM nginx:stable-alpine

# 빌드 결과물(static 파일)을 Nginx 기본 경로로 복사
COPY --from=builder /app/build /usr/share/nginx/html

# 커스텀 Nginx 설정 파일 복사 (아래 3번에서 생성)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Nginx 기본 포트(80) 노출
EXPOSE 80

# Nginx 실행 (포그라운드에서 실행)
CMD ["nginx", "-g", "daemon off;"] 