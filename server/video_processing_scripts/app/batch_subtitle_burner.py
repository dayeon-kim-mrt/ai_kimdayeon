import os
import sys
import click
import glob
from pathlib import Path
from app.subtitle_burner import main as subtitle_burner_main

@click.command()
@click.option("--video-dir", required=True, help="비디오 파일이 있는 디렉토리 경로")
@click.option("--subtitle-dir", required=True, help="자막 파일이 있는 디렉토리 경로")
@click.option("--output-dir", help="출력 비디오 파일을 저장할 디렉토리 경로 (기본값: 비디오 디렉토리)")
@click.option("--font-size", "-fs", default=24, type=int, help="자막 폰트 크기 (기본값: 24)")
@click.option("--font-color", "-fc", default="white", type=click.Choice(["white", "yellow", "green", "cyan", "red", "blue", "magenta", "black"]), help="자막 폰트 색상 (기본값: white)")
@click.option("--outline-width", "-ow", default=2, type=int, help="자막 테두리 두께 (기본값: 2, 범위: 0-4)")
@click.option("--disable-existing-subtitles", "-des", is_flag=True, help="기존 비디오에 내장된 자막 비활성화 (기본값: 비활성화하지 않음)")
@click.option("--preset", "-p", default="original", help="비디오 프리셋 (기본값: original)")
@click.option("--codec", "-c", default="original", help="비디오 코덱 (기본값: original)")
@click.option("--width", "-w", type=int, help="출력 비디오 너비 (기본값: 원본 유지)")
@click.option("--height", "-h", type=int, help="출력 비디오 높이 (기본값: 원본 유지)")
@click.option("--fps", "-f", type=int, help="출력 비디오 프레임율 (기본값: 원본 유지)")
@click.option("--crf", type=int, default=23, help="비디오 품질 (0-51, 낮을수록 고품질, 기본값: 23)")
@click.option("--sample", "-sm", is_flag=True, help="샘플 모드 활성화 (기본값: 비활성화)")
@click.option("--sample-duration", "-sd", default=60, type=int, help="샘플 길이(초) (기본값: 60초)")
@click.option("--sample-start", "-ss", default=0, type=int, help="샘플 시작 시간(초) (기본값: 0초)")
@click.option("--dry-run", is_flag=True, help="실제 처리 없이 처리할 파일만 표시")
def main(video_dir, subtitle_dir, output_dir, font_size, font_color, outline_width, 
         preset, codec, width, height, fps, crf, sample, sample_duration, sample_start,
         disable_existing_subtitles, dry_run):
    """여러 비디오 파일에 자막을 일괄 합성하는 CLI 도구
    
    비디오 디렉토리와 자막 디렉토리에서 같은 이름의 파일을 찾아 자막을 합성합니다.
    예: video_dir/test.mp4 + subtitle_dir/test.srt -> output_dir/test.mp4
    """
    # 디렉토리 확인
    if not os.path.isdir(video_dir):
        click.echo(f"오류: 비디오 디렉토리를 찾을 수 없습니다: {video_dir}", err=True)
        sys.exit(1)
    
    if not os.path.isdir(subtitle_dir):
        click.echo(f"오류: 자막 디렉토리를 찾을 수 없습니다: {subtitle_dir}", err=True)
        sys.exit(1)
    
    # 출력 디렉토리 설정
    if not output_dir:
        output_dir = video_dir
    else:
        # 출력 디렉토리가 없으면 생성
        os.makedirs(output_dir, exist_ok=True)
    
    # 비디오 파일 목록 가져오기
    video_files = []
    for ext in ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v']:
        video_files.extend(glob.glob(os.path.join(video_dir, f"*{ext}")))
    
    # 자막 파일 목록 가져오기
    subtitle_files = glob.glob(os.path.join(subtitle_dir, "*.srt"))
    
    # 비디오-자막 쌍 찾기
    pairs = []
    for video_file in video_files:
        video_name = os.path.splitext(os.path.basename(video_file))[0]
        subtitle_file = os.path.join(subtitle_dir, f"{video_name}.srt")
        
        if os.path.exists(subtitle_file):
            # 출력 파일 경로 설정
            if sample:
                output_file = os.path.join(output_dir, f"{video_name}_sample.mp4")
            else:
                output_file = os.path.join(output_dir, f"{video_name}.mp4")
            
            pairs.append({
                'video': video_file,
                'subtitle': subtitle_file,
                'output': output_file
            })
    
    if not pairs:
        click.echo("처리할 비디오-자막 쌍을 찾을 수 없습니다.")
        sys.exit(0)
    
    # 처리할 파일 목록 표시
    click.echo(f"총 {len(pairs)}개의 비디오-자막 쌍을 처리합니다:")
    for pair in pairs:
        click.echo(f"비디오: {os.path.basename(pair['video'])}")
        click.echo(f"자막: {os.path.basename(pair['subtitle'])}")
        click.echo(f"출력: {os.path.basename(pair['output'])}")
        click.echo("---")
    
    if dry_run:
        click.echo("드라이 런 모드: 실제 처리는 수행하지 않습니다.")
        return 0
    
    # 각 쌍에 대해 자막 합성 실행
    for i, pair in enumerate(pairs):
        click.echo(f"\n[{i+1}/{len(pairs)}] 처리 중: {os.path.basename(pair['video'])}")
        
        # subtitle_burner_main 함수 호출
        try:
            # 원래 sys.argv 저장
            original_argv = sys.argv.copy()
            
            # 새로운 sys.argv 구성
            sys.argv = [
                'subtitle-burner',
                '--video-file', pair['video'],
                '--subtitle-file', pair['subtitle'],
                '--output-file', pair['output'],
                '--font-size', str(font_size),
                '--font-color', font_color,
                '--outline-width', str(outline_width),
                '--preset', preset,
                '--codec', codec,
                '--crf', str(crf)
            ]
            
            # 선택적 인자 추가
            if width:
                sys.argv.extend(['--width', str(width)])
            if height:
                sys.argv.extend(['--height', str(height)])
            if fps:
                sys.argv.extend(['--fps', str(fps)])
            if disable_existing_subtitles:
                sys.argv.append('--disable-existing-subtitles')
            if sample:
                sys.argv.append('--sample')
                sys.argv.extend(['--sample-duration', str(sample_duration)])
                sys.argv.extend(['--sample-start', str(sample_start)])
            
            # subtitle_burner_main 함수 직접 호출
            result = subtitle_burner_main(
                video_file=pair['video'],
                subtitle_file=pair['subtitle'],
                output_file=pair['output'],
                font_size=font_size,
                font_color=font_color,
                outline_width=outline_width,
                preset=preset,
                codec=codec,
                width=width,
                height=height,
                fps=fps,
                crf=crf,
                sample=sample,
                sample_duration=sample_duration,
                sample_start=sample_start,
                disable_existing_subtitles=disable_existing_subtitles
            )
            
            # 원래 sys.argv 복원
            sys.argv = original_argv
            
            if result != 0:
                click.echo(f"오류: {os.path.basename(pair['video'])} 처리 실패", err=True)
        
        except Exception as e:
            click.echo(f"오류 발생: {str(e)}", err=True)
    
    click.echo("\n모든 파일 처리가 완료되었습니다.")
    return 0

if __name__ == "__main__":
    main() 