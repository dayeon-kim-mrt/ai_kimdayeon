# server/Dockerfile (Build context: project root '.')

# Base image with Node.js
FROM node:lts AS base

# Install system dependencies for Python build (pyenv) and runtime (ffmpeg, git)
RUN apt-get update && apt-get install -y --no-install-recommends \
    # pyenv build dependencies
    make build-essential libssl-dev zlib1g-dev libbz2-dev \
    libreadline-dev libsqlite3-dev wget curl llvm libncurses5-dev \
    libncursesw5-dev xz-utils tk-dev libffi-dev liblzma-dev python3-openssl \
    # Runtime dependencies
    git ffmpeg \
    # Korean fonts for potential subtitle rendering needs
    fonts-noto-cjk \
    # Cleanup
    && rm -rf /var/lib/apt/lists/*

# Setup pyenv and install Python 3.11
ENV PYENV_ROOT="/root/.pyenv"
ENV PATH="$PYENV_ROOT/shims:$PYENV_ROOT/bin:$PATH"
RUN curl https://pyenv.run | bash && \
    pyenv install 3.11.11 && \
    pyenv global 3.11.11

# Install poetry using the installed Python
# Ensure PATH includes pipx binaries (~/.local/bin)
ENV PATH="/root/.local/bin:$PATH"
RUN python -m pip install --upgrade pip && \
    python -m pip install --user pipx && \
    pipx install poetry

# Set working directory for the application
WORKDIR /usr/src/app

# --- Install Python dependencies first for layer caching ---
# Copy only necessary files for poetry install from the correct location
# Use server/video_processing_scripts path relative to build context
COPY server/video_processing_scripts/pyproject.toml server/video_processing_scripts/poetry.lock* ./video_processing_scripts/
# Change to the correct directory name and install dependencies
RUN cd video_processing_scripts && poetry install --no-root --only main

# --- Install Node.js dependencies ---
# Copy package files from the correct location (server/)
COPY server/package*.json ./
# Install production Node.js dependencies
RUN npm install --only=production 

# --- Copy application source code --- 
# Copy Node.js server code from local server/ directory to WORKDIR (/usr/src/app)
COPY server/ . 
# Copy Python code from local server/video_processing_scripts/ directory to WORKDIR/video_processing_scripts
# Use the correct source path and directory name
COPY server/video_processing_scripts/ ./video_processing_scripts/

# (Optional but recommended) Create output directories if needed by the app
RUN mkdir -p /usr/src/app/uploads \
             /usr/src/app/processing \
             /usr/src/app/output

# Expose the application port
EXPOSE 3001

# Run the Node.js application (index.js should be in /usr/src/app now)
CMD [ "node", "index.js" ] 