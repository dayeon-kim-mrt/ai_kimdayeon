import os
import sys
import click
import ffmpeg
from tqdm import tqdm
import time
import subprocess
from enum import Enum

def get_video_duration(video_path):
    """비디오 파일의 길이를 초 단위로 반환합니다."""
    probe = ffmpeg.probe(video_path)
    return float(probe['format']['duration'])

def get_video_info(video_path):
    """비디오 파일의 정보를 반환합니다."""
    probe = ffmpeg.probe(video_path)
    video_stream = next((stream for stream in probe['streams'] if stream['codec_type'] == 'video'), None)
    if video_stream:
        return {
            'width': int(video_stream.get('width', 0)),
            'height': int(video_stream.get('height', 0)),
            'fps': eval(video_stream.get('r_frame_rate', '30/1')),
            'codec': video_stream.get('codec_name', 'h264')
        }
    return {'width': 0, 'height': 0, 'fps': 30, 'codec': 'h264'}

class VideoPreset(str, Enum):
    ORIGINAL = "original"
    HD720P = "720p"
    HD1080P = "1080p"
    UHD4K = "4k"
    WEB = "web"
    MOBILE = "mobile"

class VideoCodec(str, Enum):
    H264 = "h264"
    H265 = "h265"
    VP9 = "vp9"
    AV1 = "av1"
    ORIGINAL = "original"

# 프리셋 설정
PRESETS = {
    VideoPreset.ORIGINAL: {},  # 원본 유지
    VideoPreset.HD720P: {'width': 1280, 'height': 720},
    VideoPreset.HD1080P: {'width': 1920, 'height': 1080},
    VideoPreset.UHD4K: {'width': 3840, 'height': 2160},
    VideoPreset.WEB: {'width': 1280, 'height': 720, 'fps': 30, 'codec': 'h264', 'crf': 23},
    VideoPreset.MOBILE: {'width': 854, 'height': 480, 'fps': 30, 'codec': 'h264', 'crf': 28}
}

# 코덱 설정
CODEC_SETTINGS = {
    VideoCodec.H264: {'codec': 'libx264', 'options': {}},
    VideoCodec.H265: {'codec': 'libx265', 'options': {}},
    VideoCodec.VP9: {'codec': 'libvpx-vp9', 'options': {}},
    VideoCodec.AV1: {'codec': 'libaom-av1', 'options': {'cpu-used': '8', 'row-mt': '1'}}
}

class ProgressCallback:
    """진행 상황을 표시하기 위한 콜백 클래스"""
    def __init__(self, total_duration):
        self.total_duration = total_duration
        self.start_time = time.time()
        self.pbar = tqdm(total=100, desc="자막 합성 중")
        self.last_progress = 0
    
    def update(self, progress=None):
        """진행 상황을 업데이트합니다."""
        if progress is not None:
            # FFmpeg에서 파싱한 실제 진행률을 사용
            current_progress = int(progress)
            # 이전 진행률보다 작으면 업데이트하지 않음 (가끔 발생하는 역행 방지)
            if current_progress > self.last_progress:
                self.pbar.update(current_progress - self.last_progress)
                self.last_progress = current_progress
        else:
            # FFmpeg 진행률을 파싱할 수 없을 때 시간 기반 추정 사용
            elapsed_time = time.time() - self.start_time
            # 진행률 계산 (최대 99%까지만 표시하여 완료 전 상태 표시)
            estimated_progress = min(99, (elapsed_time / (self.total_duration * 1.2)) * 100)
            current_progress = int(estimated_progress)
            if current_progress > self.last_progress:
                self.pbar.update(current_progress - self.last_progress)
                self.last_progress = current_progress
    
    def complete(self):
        """작업 완료 시 호출합니다."""
        self.pbar.update(100 - self.last_progress)
        self.pbar.close()

@click.command()
@click.option("--video-file", "-v", required=True, help="자막을 합성할 비디오 파일 경로")
@click.option("--subtitle-file", "-s", required=True, help="합성할 SRT 자막 파일 경로")
@click.option("--output-file", "-o", help="출력 비디오 파일 경로 (기본값: 입력 파일명_subtitled.mp4)")
@click.option("--font-size", "-fs", default=24, type=int, help="자막 폰트 크기 (기본값: 24)")
@click.option("--font-color", "-fc", default="white", type=click.Choice(["white", "yellow", "green", "cyan", "red", "blue", "magenta", "black"]), help="자막 폰트 색상 (기본값: white)")
@click.option("--outline-width", "-ow", default=2, type=int, help="자막 테두리 두께 (기본값: 2, 범위: 0-4)")
@click.option("--disable-existing-subtitles", "-des", is_flag=True, help="기존 비디오에 내장된 자막 비활성화 (기본값: 비활성화하지 않음)")
@click.option("--preset", "-p", type=click.Choice([p.value for p in VideoPreset]), default=VideoPreset.ORIGINAL.value, 
              help="비디오 프리셋 (기본값: original)")
@click.option("--codec", "-c", type=click.Choice([c.value for c in VideoCodec]), default=VideoCodec.ORIGINAL.value, 
              help="비디오 코덱 (기본값: original)")
@click.option("--width", "-w", type=int, help="출력 비디오 너비 (기본값: 원본 유지)")
@click.option("--height", "-h", type=int, help="출력 비디오 높이 (기본값: 원본 유지)")
@click.option("--fps", "-f", type=int, help="출력 비디오 프레임율 (기본값: 원본 유지)")
@click.option("--crf", type=int, default=23, help="비디오 품질 (0-51, 낮을수록 고품질, 기본값: 23)")
@click.option("--sample", "-sm", is_flag=True, help="샘플 모드 활성화 (기본값: 비활성화)")
@click.option("--sample-duration", "-sd", default=60, type=int, help="샘플 길이(초) (기본값: 60초)")
@click.option("--sample-start", "-ss", default=0, type=int, help="샘플 시작 시간(초) (기본값: 0초)")
def main(video_file, subtitle_file, output_file, font_size, font_color, 
         outline_width, preset, codec, width, height, fps, crf, sample, sample_duration, sample_start,
         disable_existing_subtitles):
    """비디오 파일에 SRT 자막을 하드코딩하는 CLI 도구"""
    # 입력 파일 확인
    if not os.path.exists(video_file):
        click.echo(f"오류: 비디오 파일을 찾을 수 없습니다: {video_file}", err=True)
        sys.exit(1)
    
    if not os.path.exists(subtitle_file):
        click.echo(f"오류: 자막 파일을 찾을 수 없습니다: {subtitle_file}", err=True)
        sys.exit(1)
    
    # 출력 파일 경로 설정
    if not output_file:
        base_name = os.path.splitext(video_file)[0]
        suffix = "_sample" if sample else "_subtitled"
        output_file = f"{base_name}{suffix}.mp4"
    
    # 원본 비디오 정보 가져오기
    video_info = get_video_info(video_file)
    
    # 비디오 길이 가져오기
    full_duration = get_video_duration(video_file)
    
    # 샘플 모드 설정
    if sample:
        # 샘플 시작 시간이 비디오 길이를 초과하는지 확인
        if sample_start >= full_duration:
            click.echo(f"오류: 샘플 시작 시간({sample_start}초)이 비디오 길이({full_duration:.1f}초)를 초과합니다.", err=True)
            sys.exit(1)
        
        # 샘플 길이 조정 (비디오 끝을 넘어가지 않도록)
        actual_sample_duration = min(sample_duration, full_duration - sample_start)
        
        click.echo(f"샘플 모드: {sample_start}초부터 {actual_sample_duration}초 동안 처리합니다.")
    else:
        sample_start = 0
        actual_sample_duration = full_duration
    
    # 프리셋 설정 적용
    encoding_settings = {}
    if preset != VideoPreset.ORIGINAL.value:
        encoding_settings.update(PRESETS[preset])
    
    # 개별 설정이 있으면 프리셋보다 우선 적용
    if width:
        encoding_settings['width'] = width
    if height:
        encoding_settings['height'] = height
    if fps:
        encoding_settings['fps'] = fps
    
    # 코덱 설정
    codec_info = None
    if codec != VideoCodec.ORIGINAL.value:
        codec_info = CODEC_SETTINGS[codec]
    elif 'codec' in encoding_settings:
        codec_name = encoding_settings['codec']
        for c in VideoCodec:
            if c.value == codec_name:
                codec_info = CODEC_SETTINGS[c]
                break
    
    # 최종 설정 출력
    final_width = encoding_settings.get('width', video_info['width'])
    final_height = encoding_settings.get('height', video_info['height'])
    final_fps = encoding_settings.get('fps', video_info['fps'])
    
    # 코덱 이름 처리
    if codec_info:
        final_codec = codec_info['codec']
    else:
        # 원본 코덱에 따라 적절한 FFmpeg 코덱 이름 설정
        if video_info['codec'] == 'h264':
            final_codec = 'libx264'
        else:
            final_codec = f"lib{video_info['codec']}"
    
    # 색상 코드 매핑
    color_codes = {
        "white": "FFFFFF",
        "yellow": "FFFF00",
        "green": "00FF00",
        "cyan": "00FFFF",
        "red": "FF0000",
        "blue": "0000FF",
        "magenta": "FF00FF",
        "black": "000000"
    }
    
    # 색상 코드 가져오기
    color_code = color_codes.get(font_color, "FFFFFF")
    
    click.echo(f"입력 비디오: {video_file}")
    click.echo(f"입력 자막: {subtitle_file}")
    click.echo(f"출력 파일: {output_file}")
    click.echo(f"자막 설정: 크기={font_size}, 색상={font_color} (#{color_code}), 테두리 두께={outline_width}")
    click.echo(f"인코딩 설정: 해상도={final_width}x{final_height}, FPS={final_fps}, 코덱={final_codec}, CRF={crf}")
    
    try:
        # 진행 상황 콜백 설정
        progress = ProgressCallback(actual_sample_duration)
        
        # 자막 스타일 설정
        subtitle_style = f"subtitles={subtitle_file}"
        
        # 테두리 두께 범위 제한 (0-4)
        outline_width = max(0, min(4, outline_width))
        
        # 자막 스타일 설정 (테두리 두께 적용)
        subtitle_style += f":force_style='FontSize={font_size},PrimaryColour=&H{color_code},BorderStyle=1,Outline={outline_width},Shadow=1'"
        
        # 필터 체인 구성
        filter_chain = []
        
        # 자막 필터 추가
        filter_chain.append(subtitle_style)
        
        # 해상도 변경이 필요한 경우
        if final_width != video_info['width'] or final_height != video_info['height']:
            filter_chain.append(f"scale={final_width}:{final_height}")
        
        # 프레임율 변경이 필요한 경우
        if final_fps != video_info['fps']:
            filter_chain.append(f"fps={final_fps}")
        
        # 필터 체인 결합
        vf_option = ",".join(filter_chain)
        
        # FFmpeg 명령 구성
        ffmpeg_cmd = [
            'ffmpeg',
        ]
        
        # 샘플 모드인 경우 시작 시간과 길이 지정
        if sample:
            ffmpeg_cmd.extend(['-ss', str(sample_start), '-t', str(actual_sample_duration)])
        
        # 입력 파일 추가
        ffmpeg_cmd.extend(['-i', video_file])
        
        # 기존 자막 비활성화 (필요한 경우)
        if disable_existing_subtitles:
            # 비디오 스트림만 선택하고 자막 스트림은 제외
            ffmpeg_cmd.extend(['-map', '0:v', '-map', '0:a', '-sn'])
        
        # 필터 추가
        ffmpeg_cmd.extend(['-vf', vf_option])
        
        # 코덱 설정 추가
        if codec_info:
            ffmpeg_cmd.extend(['-c:v', codec_info['codec']])
            for k, v in codec_info['options'].items():
                ffmpeg_cmd.extend([f'-{k}', v])
        else:
            ffmpeg_cmd.extend(['-c:v', final_codec])
        
        # 품질 설정 추가
        ffmpeg_cmd.extend(['-crf', str(crf)])
        
        # 오디오 설정 추가
        ffmpeg_cmd.extend(['-c:a', 'aac', '-b:a', '192k'])
        
        # 출력 파일 및 덮어쓰기 옵션 추가
        ffmpeg_cmd.extend(['-y', output_file])
        
        # FFmpeg 명령 출력 (디버깅용)
        click.echo(f"실행 명령: {' '.join(ffmpeg_cmd)}")
        
        # FFmpeg 실행
        process = subprocess.Popen(
            ffmpeg_cmd, 
            stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE,
            universal_newlines=True,
            bufsize=1
        )
        
        # 진행 상황 업데이트
        import re
        duration_pattern = re.compile(r'Duration: (\d{2}):(\d{2}):(\d{2})\.(\d{2})')
        time_pattern = re.compile(r'time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})')
        
        total_seconds = None
        
        # 비동기로 stderr 읽기
        import threading
        
        def read_stderr():
            nonlocal total_seconds
            for line in iter(process.stderr.readline, ''):
                # 총 길이 파싱
                if total_seconds is None:
                    duration_match = duration_pattern.search(line)
                    if duration_match:
                        h, m, s, ms = map(int, duration_match.groups())
                        total_seconds = h * 3600 + m * 60 + s + ms / 100
                
                # 현재 진행 시간 파싱
                time_match = time_pattern.search(line)
                if time_match and total_seconds:
                    h, m, s, ms = map(int, time_match.groups())
                    current_seconds = h * 3600 + m * 60 + s + ms / 100
                    prog_percent = min(99, (current_seconds / total_seconds) * 100)
                    progress.update(prog_percent)
                    
        # 스레드 시작
        stderr_thread = threading.Thread(target=read_stderr)
        stderr_thread.daemon = True
        stderr_thread.start()
        
        # 기본 진행 업데이트 (ffmpeg에서 파싱 실패할 경우를 대비)
        while process.poll() is None:
            progress.update()
            time.sleep(1)
        
        # 스레드 종료 대기
        stderr_thread.join(timeout=1)
        
        # 작업 완료
        progress.complete()
        
        # 결과 확인
        if process.returncode == 0:
            if sample:
                click.echo(f"\n샘플 자막 비디오가 성공적으로 생성되었습니다: {output_file}")
            else:
                click.echo(f"\n자막이 성공적으로 합성되었습니다: {output_file}")
            return 0
        else:
            stderr = process.stderr.read().decode('utf-8')
            click.echo(f"\n자막 합성에 실패했습니다: {stderr}", err=True)
            return 1
    
    except Exception as e:
        click.echo(f"\n오류가 발생했습니다: {str(e)}", err=True)
        return 1

if __name__ == "__main__":
    main() 