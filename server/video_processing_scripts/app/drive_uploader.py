#!/usr/bin/env python
import os
import sys
import click
import pickle
import json
from pathlib import Path
from tqdm import tqdm
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request

# Google Drive API 권한 범위 (공유 드라이브 접근 권한 추가)
SCOPES = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive.metadata.readonly',
    'https://www.googleapis.com/auth/drive.readonly'
]

def get_credentials(credentials_file, token_file, force_new_token=False):
    """Google Drive API 인증 정보를 가져옵니다."""
    creds = None
    
    # 이전에 저장된 토큰이 있으면 로드
    if os.path.exists(token_file) and not force_new_token:
        with open(token_file, 'rb') as token:
            creds = pickle.load(token)
    
    # 유효한 인증 정보가 없거나 만료된 경우
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except Exception as e:
                click.echo(f"토큰 갱신 중 오류가 발생했습니다: {str(e)}", err=True)
                click.echo("새로운 인증을 시도합니다.")
                creds = None
        
        if not creds:
            if not os.path.exists(credentials_file):
                click.echo(f"오류: credentials.json 파일을 찾을 수 없습니다: {credentials_file}", err=True)
                click.echo("Google Cloud Console에서 OAuth 2.0 클라이언트 ID를 생성하고 credentials.json 파일을 다운로드하세요.")
                click.echo("자세한 내용은 https://developers.google.com/drive/api/quickstart/python 을 참조하세요.")
                sys.exit(1)
            
            flow = InstalledAppFlow.from_client_secrets_file(credentials_file, SCOPES)
            creds = flow.run_local_server(port=0)
        
        # 인증 정보 저장
        with open(token_file, 'wb') as token:
            pickle.dump(creds, token)
    
    return creds

def list_shared_drives(service):
    """사용 가능한 공유 드라이브 목록을 가져옵니다."""
    shared_drives = []
    
    try:
        # 공유 드라이브 목록 가져오기
        response = service.drives().list(fields="drives(id, name)").execute()
        shared_drives = response.get('drives', [])
        
        if not shared_drives:
            click.echo("사용 가능한 공유 드라이브가 없습니다.")
        
        return shared_drives
    except Exception as e:
        click.echo(f"공유 드라이브 목록을 가져오는 중 오류가 발생했습니다: {str(e)}", err=True)
        
        # 권한 문제인 경우 토큰 재생성 안내
        if "insufficient authentication scopes" in str(e) or "insufficientPermissions" in str(e):
            click.echo("권한이 부족합니다. 토큰을 삭제하고 다시 인증해보세요.")
            click.echo("다음 명령을 실행하여 토큰을 삭제할 수 있습니다:")
            click.echo("  rm token.pickle")
            click.echo("또는 --force-new-token 옵션을 사용하여 새 토큰을 생성하세요.")
        
        return []

def get_shared_drive_id(service, drive_name):
    """지정된 이름의 공유 드라이브 ID를 가져옵니다."""
    shared_drives = list_shared_drives(service)
    
    for drive in shared_drives:
        if drive['name'].lower() == drive_name.lower():
            return drive['id']
    
    click.echo(f"오류: '{drive_name}' 이름의 공유 드라이브를 찾을 수 없습니다.", err=True)
    click.echo("사용 가능한 공유 드라이브 목록:")
    for drive in shared_drives:
        click.echo(f"  - {drive['name']}")
    
    return None

def get_folder_id(service, folder_name, parent_id=None, drive_id=None):
    """지정된 이름의 폴더 ID를 가져옵니다. 없으면 생성합니다."""
    query = f"name='{folder_name}' and mimeType='application/vnd.google-apps.folder'"
    
    if parent_id:
        query += f" and '{parent_id}' in parents"
    
    # 검색 옵션 설정
    search_options = {
        'q': query,
        'spaces': 'drive',
        'fields': 'files(id, name)'
    }
    
    # 공유 드라이브인 경우 추가 옵션 설정
    if drive_id:
        search_options['corpora'] = 'drive'
        search_options['driveId'] = drive_id
        search_options['includeItemsFromAllDrives'] = True
        search_options['supportsAllDrives'] = True
    
    results = service.files().list(**search_options).execute()
    
    items = results.get('files', [])
    
    if items:
        return items[0]['id']
    else:
        # 폴더가 없으면 생성
        folder_metadata = {
            'name': folder_name,
            'mimeType': 'application/vnd.google-apps.folder'
        }
        
        if parent_id:
            folder_metadata['parents'] = [parent_id]
        
        # 공유 드라이브인 경우 추가 설정
        if drive_id and not parent_id:
            folder_metadata['parents'] = [drive_id]
        
        # 폴더 생성 옵션 설정
        create_options = {
            'body': folder_metadata,
            'fields': 'id'
        }
        
        # 공유 드라이브인 경우 추가 옵션 설정
        if drive_id:
            create_options['supportsAllDrives'] = True
        
        folder = service.files().create(**create_options).execute()
        
        return folder.get('id')

def upload_file(service, file_path, folder_id=None, mime_type=None, drive_id=None):
    """파일을 Google Drive에 업로드합니다."""
    file_name = os.path.basename(file_path)
    
    # 파일 메타데이터 설정
    file_metadata = {'name': file_name}
    
    if folder_id:
        file_metadata['parents'] = [folder_id]
    
    # MIME 타입이 지정되지 않은 경우 자동 감지
    if not mime_type:
        # 일반적인 MIME 타입 매핑
        mime_types = {
            '.mp4': 'video/mp4',
            '.avi': 'video/x-msvideo',
            '.mkv': 'video/x-matroska',
            '.mov': 'video/quicktime',
            '.srt': 'application/x-subrip',
            '.txt': 'text/plain',
            '.pdf': 'application/pdf',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif'
        }
        
        file_ext = os.path.splitext(file_path)[1].lower()
        mime_type = mime_types.get(file_ext, 'application/octet-stream')
    
    # 파일 업로드
    media = MediaFileUpload(
        file_path,
        mimetype=mime_type,
        resumable=True
    )
    
    # 파일 크기 가져오기
    file_size = os.path.getsize(file_path)
    
    # 업로드 옵션 설정
    upload_options = {
        'body': file_metadata,
        'media_body': media,
        'fields': 'id'
    }
    
    # 공유 드라이브인 경우 추가 옵션 설정
    if drive_id:
        upload_options['supportsAllDrives'] = True
    
    # 진행 상황 표시
    with tqdm(total=file_size, unit='B', unit_scale=True, desc=f"업로드 중: {file_name}") as pbar:
        request = service.files().create(**upload_options)
        
        response = None
        last_uploaded = 0
        
        while response is None:
            status, response = request.next_chunk()
            if status:
                uploaded = int(status.resumable_progress)
                pbar.update(uploaded - last_uploaded)
                last_uploaded = uploaded
        
        # 완료 표시
        pbar.update(file_size - last_uploaded)
    
    return response.get('id')

@click.group()
def cli():
    """Google Drive 파일 업로드 및 관리 CLI 도구"""
    pass

@cli.command('list-drives')
@click.option("--credentials", "-c", default="credentials.json", help="Google API 인증 정보 파일 경로 (기본값: credentials.json)")
@click.option("--token", "-t", default="token.pickle", help="인증 토큰 저장 파일 경로 (기본값: token.pickle)")
@click.option("--force-new-token", "-f", is_flag=True, help="기존 토큰을 무시하고 새로운 인증 토큰 생성")
def list_drives_cmd(credentials, token, force_new_token):
    """사용 가능한 공유 드라이브 목록을 표시합니다."""
    try:
        # 인증 정보 가져오기
        creds = get_credentials(credentials, token, force_new_token)
        
        # Drive API 서비스 생성
        service = build('drive', 'v3', credentials=creds)
        
        # 공유 드라이브 목록 가져오기
        shared_drives = list_shared_drives(service)
        
        if shared_drives:
            click.echo("\n사용 가능한 공유 드라이브 목록:")
            for i, drive in enumerate(shared_drives):
                click.echo(f"{i+1}. {drive['name']} (ID: {drive['id']})")
        
        return 0
    
    except Exception as e:
        click.echo(f"오류가 발생했습니다: {str(e)}", err=True)
        return 1

@cli.command('upload')
@click.option("--file", "-f", required=True, help="업로드할 파일 경로")
@click.option("--folder", "-d", help="업로드할 Google Drive 폴더 경로 (예: '폴더1/폴더2')")
@click.option("--shared-drive", "-sd", help="업로드할 공유 드라이브 이름")
@click.option("--credentials", "-c", default="credentials.json", help="Google API 인증 정보 파일 경로 (기본값: credentials.json)")
@click.option("--token", "-t", default="token.pickle", help="인증 토큰 저장 파일 경로 (기본값: token.pickle)")
@click.option("--mime-type", "-m", help="파일의 MIME 타입 (지정하지 않으면 자동 감지)")
@click.option("--force-new-token", "-f", is_flag=True, help="기존 토큰을 무시하고 새로운 인증 토큰 생성")
def upload_cmd(file, folder, shared_drive, credentials, token, mime_type, force_new_token):
    """파일을 Google Drive에 업로드합니다."""
    try:
        # 인증 정보 가져오기
        creds = get_credentials(credentials, token, force_new_token)
        
        # Drive API 서비스 생성
        service = build('drive', 'v3', credentials=creds)
        
        # 파일 존재 확인
        if not os.path.exists(file):
            click.echo(f"오류: 파일을 찾을 수 없습니다: {file}", err=True)
            sys.exit(1)
        
        # 공유 드라이브 ID 가져오기
        drive_id = None
        if shared_drive:
            drive_id = get_shared_drive_id(service, shared_drive)
            if not drive_id:
                sys.exit(1)
            click.echo(f"대상 공유 드라이브: {shared_drive} (ID: {drive_id})")
        
        # 폴더 경로 처리
        folder_id = None
        if folder:
            # 폴더 경로를 '/'로 분리
            folder_parts = folder.strip('/').split('/')
            
            # 각 폴더 수준에서 ID 가져오기
            for i, folder_name in enumerate(folder_parts):
                parent_id = folder_id
                folder_id = get_folder_id(service, folder_name, parent_id, drive_id)
                
                if i == 0:
                    if not shared_drive:
                        click.echo(f"대상 드라이브 폴더: {folder_name} (ID: {folder_id})")
                    else:
                        click.echo(f"대상 폴더: {folder_name} (ID: {folder_id})")
                else:
                    click.echo(f"하위 폴더: {folder_name} (ID: {folder_id})")
        
        # 파일 업로드
        file_id = upload_file(service, file, folder_id, mime_type, drive_id)
        
        # 업로드 결과 출력
        file_name = os.path.basename(file)
        click.echo(f"\n파일 '{file_name}'이(가) 성공적으로 업로드되었습니다.")
        click.echo(f"파일 ID: {file_id}")
        
        # 파일 링크 생성
        if shared_drive:
            click.echo(f"파일 링크: https://drive.google.com/file/d/{file_id}/view?usp=drivesdk")
        else:
            click.echo(f"파일 링크: https://drive.google.com/file/d/{file_id}/view")
        
        return 0
    
    except Exception as e:
        click.echo(f"오류가 발생했습니다: {str(e)}", err=True)
        return 1

@cli.command('delete-token')
@click.option("--token", "-t", default="token.pickle", help="삭제할 인증 토큰 파일 경로 (기본값: token.pickle)")
def delete_token_cmd(token):
    """저장된 인증 토큰을 삭제합니다."""
    try:
        if os.path.exists(token):
            os.remove(token)
            click.echo(f"인증 토큰 파일이 삭제되었습니다: {token}")
        else:
            click.echo(f"인증 토큰 파일이 존재하지 않습니다: {token}")
        return 0
    except Exception as e:
        click.echo(f"토큰 삭제 중 오류가 발생했습니다: {str(e)}", err=True)
        return 1

def main():
    """CLI 진입점"""
    cli()

if __name__ == "__main__":
    main() 