# server/Dockerfile (빌드 컨텍스트는 이제 프로젝트 루트 '.')

# 1. Node.js 및 기본 도구 설치 (Debian 기반 이미지 사용)
FROM node:lts AS base

# pyenv 설치 및 Python 3.11.11 설치
ENV PYENV_ROOT="/root/.pyenv"
# pyenv shims 및 bin 경로, pipx 경로를 PATH에 추가
ENV PATH="$PYENV_ROOT/shims:$PYENV_ROOT/bin:/root/.local/bin:$PATH"

# pyenv 의존성 및 기타 도구 설치 (+ 한글 폰트 추가)
RUN apt-get update && apt-get install -y --no-install-recommends \
    # pyenv dependencies
    make build-essential libssl-dev zlib1g-dev libbz2-dev \
    libreadline-dev libsqlite3-dev wget curl llvm libncurses5-dev \
    libncursesw5-dev xz-utils tk-dev libffi-dev liblzma-dev python3-openssl \
    # Other dependencies
    git ffmpeg \
    # Add Korean font package
    fonts-noto-cjk \
    # Cleanup
    && rm -rf /var/lib/apt/lists/*

# pyenv 설치
RUN curl https://pyenv.run | bash

# Python 3.11.11 설치 및 전역 설정
RUN pyenv install 3.11.11 && \
    pyenv global 3.11.11

# pyenv Python을 사용하여 pipx 설치 (pip 업그레이드 포함)
RUN python -m pip install --upgrade pip && \
    python -m pip install --user pipx

# pipx를 사용하여 poetry 설치
RUN pipx install poetry

# 2. 작업 디렉토리 설정
WORKDIR /usr/src/app

# --- Node.js 애플리케이션 설정 ---
COPY server/package*.json ./
RUN npm install --only=production

# --- Poetry 프로젝트 설정 (변경된 경로 사용) ---
# 빌드 컨텍스트 루트의 server/video_processing_scripts 에서 파일을 복사하여
# 컨테이너 WORKDIR(/usr/src/app) 아래 video_processing_scripts 폴더로 복사
COPY server/video_processing_scripts/pyproject.toml server/video_processing_scripts/poetry.lock* ./video_processing_scripts/
# 컨테이너 WORKDIR 아래의 video_processing_scripts 폴더로 이동하여 poetry 실행
RUN cd video_processing_scripts && poetry install --no-root --only main

# --- 나머지 소스 코드 복사 ---
# 서버 코드 복사
COPY server/ .
# 파이썬 스크립트 코드 복사 (변경된 경로)
COPY server/video_processing_scripts/ ./video_processing_scripts/

# 5. 애플리케이션 포트 노출
EXPOSE 3001

# 6. 애플리케이션 실행 명령어
CMD [ "node", "index.js" ] 