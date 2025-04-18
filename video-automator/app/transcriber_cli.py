import os
import sys
import click
from tqdm import tqdm
from pathlib import Path

from app.commons.transcriber import Transcriber

class ProgressCallback:
    """진행 상황을 표시하기 위한 콜백 클래스"""
    def __init__(self):
        self.pbar = None
    
    def __call__(self, percent, message):
        if percent < 0:
            if self.pbar:
                self.pbar.close()
            click.echo(f"오류: {message}", err=True)
            return
        
        if percent == 0 or self.pbar is None:
            if self.pbar:
                self.pbar.close()
            self.pbar = tqdm(total=100, desc=message)
        elif percent == 100:
            self.pbar.update(100 - self.pbar.n)
            self.pbar.close()
            click.echo(f"완료: {message}")
        else:
            self.pbar.update(percent - self.pbar.n)
            self.pbar.set_description(message)

@click.command()
@click.option("--source-file", "-s", required=True, help="변환할 오디오 또는 비디오 파일 경로")
@click.option("--output-file", "-o", help="출력 SRT 자막 파일 경로 (기본값: 입력 파일과 같은 이름, .srt 확장자)")
@click.option("--api-key", "-k", help="OpenAI API 키 (기본값: OPENAI_API_KEY 환경 변수)")
@click.option("--model", "-m", default="base", help="사용할 Whisper 모델 (tiny, base, small, medium, large)")
@click.option("--chunk-duration", "-c", default=10, type=int, help="큰 파일 분할 시 청크 길이(분) (기본값: 10분)")
@click.option("--filter-filler", "-f", is_flag=True, help="불필요한 단어(어, 그, 저 등)를 필터링합니다")
def main(source_file, output_file, api_key, model, chunk_duration, filter_filler):
    """오디오 또는 비디오 파일을 SRT 자막으로 변환하는 CLI 도구
    
    비디오 파일이 입력되면 자동으로 오디오를 추출하여 처리합니다.
    지원되는 비디오 형식: MP4, AVI, MKV, MOV, WMV, FLV, WEBM, M4V
    지원되는 오디오 형식: MP3, WAV, M4A, AAC, OGG, FLAC
    """
    # 입력 파일 확인
    if not os.path.exists(source_file):
        click.echo(f"오류: 파일을 찾을 수 없습니다: {source_file}", err=True)
        sys.exit(1)
    
    # API 키 설정
    if api_key:
        os.environ["OPENAI_API_KEY"] = api_key
    elif not os.environ.get("OPENAI_API_KEY"):
        click.echo("오류: OpenAI API 키가 제공되지 않았습니다. --api-key 옵션을 사용하거나 OPENAI_API_KEY 환경 변수를 설정하세요.", err=True)
        sys.exit(1)
    
    # 출력 파일 경로 설정
    if not output_file:
        output_file = os.path.splitext(source_file)[0] + ".srt"
    
    # 파일 확장자 확인
    file_ext = os.path.splitext(source_file)[1].lower()
    file_type = "비디오" if file_ext in ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v'] else "오디오"
    
    click.echo(f"입력 {file_type} 파일: {source_file}")
    click.echo(f"출력 자막 파일: {output_file}")
    click.echo(f"모델: {model}")
    click.echo(f"청크 길이: {chunk_duration}분")
    if filter_filler:
        click.echo("불필요한 단어 필터링: 활성화")
    
    # 진행 상황 콜백 설정
    progress_callback = ProgressCallback()
    
    # 변환 실행
    transcriber = Transcriber(progress_callback)
    
    # 청크 길이 설정 (분 -> 초)
    transcriber.chunk_duration = chunk_duration * 60
    
    try:
        # 모델 로드
        transcriber.load_model(model)
        
        # 변환 실행
        success = transcriber.transcribe(source_file, output_file, filter_filler)
        
        if success:
            click.echo(f"\n자막 파일이 성공적으로 생성되었습니다: {output_file}")
            return 0
        else:
            click.echo("\n자막 생성에 실패했습니다.", err=True)
            return 1
    
    except Exception as e:
        click.echo(f"\n오류가 발생했습니다: {str(e)}", err=True)
        return 1

if __name__ == "__main__":
    main() 