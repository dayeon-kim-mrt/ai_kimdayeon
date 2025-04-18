import os
import datetime
import tempfile
import ffmpeg
import json
import re
from openai import OpenAI
from pathlib import Path

class Transcriber:
    def __init__(self, progress_callback=None):
        """
        오디오 또는 비디오 파일을 SRT 자막으로 변환하는 클래스
        
        Args:
            progress_callback: 진행 상황을 보고하는 콜백 함수 (0-100 사이의 값)
        """
        self.progress_callback = progress_callback
        self.client = None
        self.chunk_duration = 10 * 60  # 10분 단위로 분할 (초 단위)
        self.max_file_size = 25 * 1024 * 1024  # 25MB (OpenAI API 제한)
        # 비디오 파일 확장자 목록
        self.video_extensions = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v']
        # 오디오 파일 확장자 목록
        self.audio_extensions = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac']
        # 필터링할 단어 목록
        self.filter_words = ["어", "음", "그", "저", "아", "에", "흠", "엄", "응", "아니", "그니까", "그래서", "그러니까"]
    
    def load_model(self, model_name="base"):
        """OpenAI 클라이언트를 초기화합니다."""
        if self.progress_callback:
            self.progress_callback(10, "OpenAI API 초기화 중...")
        
        # OpenAI API 키 확인
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            if self.progress_callback:
                self.progress_callback(-1, "OPENAI_API_KEY 환경 변수가 설정되지 않았습니다.")
            raise ValueError("OPENAI_API_KEY 환경 변수가 설정되지 않았습니다.")
        
        self.client = OpenAI(api_key=api_key)
        self.model_name = model_name
        
        if self.progress_callback:
            self.progress_callback(20, "OpenAI API 초기화 완료")
        
        return self.client
    
    def transcribe(self, file_path, output_path, filter_filler=False):
        """
        오디오 또는 비디오 파일을 SRT 자막으로 변환합니다.
        
        Args:
            file_path: 오디오 또는 비디오 파일 경로
            output_path: 출력 SRT 파일 경로
            filter_filler: 불필요한 단어("어", "그", "저" 등) 필터링 여부
            
        Returns:
            bool: 성공 여부
        """
        if not self.client:
            self.load_model()
        
        # 파일 확장자 확인
        file_ext = os.path.splitext(file_path)[1].lower()
        
        # 비디오 파일인 경우 오디오 추출
        if file_ext in self.video_extensions:
            if self.progress_callback:
                self.progress_callback(15, "비디오에서 오디오 추출 중...")
            
            # 임시 오디오 파일 생성
            with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as temp_audio:
                temp_audio_path = temp_audio.name
            
            try:
                # ffmpeg를 사용하여 오디오 추출
                (
                    ffmpeg
                    .input(file_path)
                    .output(temp_audio_path, format='mp3', acodec='libmp3lame', ab='128k')
                    .overwrite_output()
                    .run(quiet=True)
                )
                
                if self.progress_callback:
                    self.progress_callback(25, "오디오 파일 분석 중...")
                
                # 추출된 오디오 파일 처리
                result = self._process_audio_file(temp_audio_path, output_path, filter_filler)
                
                # 임시 파일 삭제
                os.unlink(temp_audio_path)
                
                return result
                
            except Exception as e:
                # 임시 파일 삭제
                if os.path.exists(temp_audio_path):
                    os.unlink(temp_audio_path)
                
                if self.progress_callback:
                    self.progress_callback(-1, f"오디오 추출 중 오류 발생: {str(e)}")
                
                return False
        else:
            # 오디오 파일 직접 처리
            if self.progress_callback:
                self.progress_callback(25, "오디오 파일 분석 중...")
            
            return self._process_audio_file(file_path, output_path, filter_filler)
    
    def _process_audio_file(self, audio_path, output_path, filter_filler=False):
        """오디오 파일을 처리합니다."""
        # 파일 크기 확인
        file_size = os.path.getsize(audio_path)
        
        # 파일이 크기 제한을 초과하는지 확인
        if file_size > self.max_file_size:
            if self.progress_callback:
                self.progress_callback(30, "파일이 너무 큽니다. 분할 처리를 시작합니다...")
            
            # 파일 분할 및 처리
            return self._process_large_file(audio_path, output_path, filter_filler)
        else:
            # 작은 파일은 직접 처리
            return self._process_single_file(audio_path, output_path, filter_filler)
    
    def _process_single_file(self, audio_path, output_path, filter_filler=False):
        """단일 파일을 처리합니다."""
        try:
            if self.progress_callback:
                self.progress_callback(40, "OpenAI API로 전송 중...")
            
            # 파일 열기
            with open(audio_path, "rb") as audio_file:
                # OpenAI API를 사용하여 음성 인식
                transcript = self.client.audio.transcriptions.create(
                    file=audio_file,
                    model="whisper-1",
                    response_format="verbose_json",
                    timestamp_granularities=["segment"]
                )
                
                if self.progress_callback:
                    self.progress_callback(70, "자막 생성 중...")
                
                # SRT 파일 생성
                self._write_srt_file(transcript.segments, output_path, filter_filler)
            
            if self.progress_callback:
                self.progress_callback(100, "변환 완료")
            
            return True
        
        except Exception as e:
            if self.progress_callback:
                self.progress_callback(-1, f"오류 발생: {str(e)}")
            return False
    
    def _process_large_file(self, audio_path, output_path, filter_filler=False):
        """큰 파일을 분할하여 처리합니다."""
        try:
            # 임시 디렉토리 생성
            with tempfile.TemporaryDirectory() as temp_dir:
                if self.progress_callback:
                    self.progress_callback(35, "오디오 파일 분할 중...")
                
                # 오디오 파일 정보 가져오기
                probe = ffmpeg.probe(audio_path)
                duration = float(probe['format']['duration'])
                
                # 청크 수 계산
                num_chunks = max(1, int(duration / self.chunk_duration) + 1)
                
                # 각 청크의 시작 시간과 길이 계산
                chunks = []
                for i in range(num_chunks):
                    start_time = i * self.chunk_duration
                    chunk_length = min(self.chunk_duration, duration - start_time)
                    if chunk_length <= 0:
                        break
                    
                    chunks.append({
                        'index': i,
                        'start_time': start_time,
                        'length': chunk_length,
                        'output_file': os.path.join(temp_dir, f"chunk_{i}.mp3")
                    })
                
                # 각 청크 처리
                all_segments = []
                total_chunks = len(chunks)
                
                for i, chunk in enumerate(chunks):
                    if self.progress_callback:
                        progress = 35 + (i / total_chunks) * 30
                        self.progress_callback(int(progress), f"청크 {i+1}/{total_chunks} 처리 중...")
                    
                    # 청크 추출
                    (
                        ffmpeg
                        .input(audio_path, ss=chunk['start_time'], t=chunk['length'])
                        .output(chunk['output_file'], format='mp3', acodec='libmp3lame', ab='128k')
                        .overwrite_output()
                        .run(quiet=True)
                    )
                    
                    # 청크 처리
                    with open(chunk['output_file'], "rb") as audio_file:
                        transcript = self.client.audio.transcriptions.create(
                            file=audio_file,
                            model="whisper-1",
                            response_format="verbose_json",
                            timestamp_granularities=["segment"]
                        )
                    
                    # 시간 오프셋 적용
                    offset = chunk['start_time']
                    segments = transcript.segments
                    
                    # 세그먼트 시간 조정
                    for segment in segments:
                        segment.start += offset
                        segment.end += offset
                    
                    all_segments.extend(segments)
                
                # 모든 세그먼트 정렬
                all_segments.sort(key=lambda x: x.start)
                
                if self.progress_callback:
                    self.progress_callback(85, "자막 파일 생성 중...")
                
                # SRT 파일 생성
                self._write_srt_file(all_segments, output_path, filter_filler)
                
                if self.progress_callback:
                    self.progress_callback(100, "변환 완료")
                
                return True
        
        except Exception as e:
            if self.progress_callback:
                self.progress_callback(-1, f"오류 발생: {str(e)}")
            return False
    
    def _filter_text(self, text):
        """불필요한 단어를 필터링합니다."""
        # 단일 단어인 경우 필터링
        if text.strip() in self.filter_words:
            return ""
        
        # 문장 시작 부분의 필터 단어 제거
        for word in self.filter_words:
            pattern = f"^{word}\\s+"
            text = re.sub(pattern, "", text)
        
        # 문장 중간의 필터 단어 제거 (앞뒤에 공백이 있는 경우)
        for word in self.filter_words:
            pattern = f"\\s+{word}\\s+"
            text = re.sub(pattern, " ", text)
        
        # 연속된 공백 제거
        text = re.sub(r'\s+', ' ', text)
        
        return text.strip()
    
    def _write_srt_file(self, segments, output_path, filter_filler=False):
        """세그먼트를 SRT 파일로 작성합니다."""
        with open(output_path, "w", encoding="utf-8") as srt_file:
            index = 1
            for segment in segments:
                # 텍스트 필터링
                text = segment.text.strip()
                if filter_filler:
                    text = self._filter_text(text)
                
                # 필터링 후 텍스트가 비어있으면 건너뜀
                if not text:
                    continue
                
                # 시작 시간과 종료 시간을 SRT 형식으로 변환
                start_time = self._format_time(segment.start)
                end_time = self._format_time(segment.end)
                
                # SRT 형식으로 작성
                srt_file.write(f"{index}\n")
                srt_file.write(f"{start_time} --> {end_time}\n")
                srt_file.write(f"{text}\n\n")
                
                index += 1
    
    def _format_time(self, seconds):
        """
        초를 SRT 시간 형식(HH:MM:SS,mmm)으로 변환합니다.
        """
        time_obj = datetime.timedelta(seconds=seconds)
        hours, remainder = divmod(time_obj.seconds, 3600)
        minutes, seconds = divmod(remainder, 60)
        milliseconds = int(time_obj.microseconds / 1000)
        
        return f"{hours:02d}:{minutes:02d}:{seconds:02d},{milliseconds:03d}" 