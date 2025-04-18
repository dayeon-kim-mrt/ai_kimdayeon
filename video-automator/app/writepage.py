import os
import sys
import click
import requests
import json
from pathlib import Path
from urllib.parse import quote
from dotenv import load_dotenv

class ConfluenceClient:
    """Confluence API 클라이언트 클래스"""
    
    def __init__(self, base_url, username=None, api_token=None):
        """
        Confluence API 클라이언트 초기화
        
        Args:
            base_url: Confluence 인스턴스의 기본 URL (예: https://your-domain.atlassian.net/wiki)
            username: Confluence 계정 이메일
            api_token: Confluence API 토큰
        """
        self.base_url = base_url.rstrip('/')
        self.api_url = f"{self.base_url}/rest/api"
        self.username = username or os.environ.get('CONFLUENCE_USERNAME')
        self.api_token = api_token or os.environ.get('CONFLUENCE_API_TOKEN')
        
        if not self.username or not self.api_token:
            raise ValueError("Confluence 사용자 이름과 API 토큰이 필요합니다. "
                            "--username과 --api-token 옵션을 사용하거나 "
                            "CONFLUENCE_USERNAME과 CONFLUENCE_API_TOKEN 환경 변수를 설정하세요.")
        
        self.auth = (self.username, self.api_token)
        self.headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    
    def get_space_key(self, space_name):
        """
        스페이스 이름으로 스페이스 키를 조회합니다.
        
        Args:
            space_name: 스페이스 이름
            
        Returns:
            스페이스 키 또는 None (찾지 못한 경우)
        """
        url = f"{self.api_url}/space"
        params = {
            'spaceKey': space_name,  # 먼저 입력값이 스페이스 키인지 확인
            'limit': 1
        }
        
        response = requests.get(url, auth=self.auth, headers=self.headers, params=params)
        
        if response.status_code == 200:
            data = response.json()
            if data['results'] and len(data['results']) > 0:
                return data['results'][0]['key']
        
        # 스페이스 키로 찾지 못한 경우, 이름으로 검색
        params = {
            'name': space_name,
            'limit': 100
        }
        
        response = requests.get(url, auth=self.auth, headers=self.headers, params=params)
        
        if response.status_code == 200:
            data = response.json()
            for space in data['results']:
                if space['name'].lower() == space_name.lower():
                    return space['key']
        
        return None
    
    def get_page_id(self, space_key, title, parent_title=None):
        """
        페이지 제목으로 페이지 ID를 조회합니다.
        
        Args:
            space_key: 스페이스 키
            title: 페이지 제목
            parent_title: 부모 페이지 제목 (선택 사항)
            
        Returns:
            페이지 ID 또는 None (찾지 못한 경우)
        """
        url = f"{self.api_url}/content"
        params = {
            'spaceKey': space_key,
            'title': title,
            'expand': 'ancestors',
            'limit': 100
        }
        
        response = requests.get(url, auth=self.auth, headers=self.headers, params=params)
        
        if response.status_code == 200:
            data = response.json()
            
            if not parent_title:
                # 부모 페이지가 지정되지 않은 경우, 첫 번째 결과 반환
                if data['results'] and len(data['results']) > 0:
                    return data['results'][0]['id']
            else:
                # 부모 페이지가 지정된 경우, 해당 부모를 가진 페이지 찾기
                for page in data['results']:
                    if 'ancestors' in page and page['ancestors']:
                        parent_id = page['ancestors'][-1]['id']
                        parent_page = self.get_page_by_id(parent_id)
                        if parent_page and parent_page['title'] == parent_title:
                            return page['id']
        
        return None
    
    def get_page_by_id(self, page_id):
        """
        페이지 ID로 페이지 정보를 조회합니다.
        
        Args:
            page_id: 페이지 ID
            
        Returns:
            페이지 정보 또는 None (찾지 못한 경우)
        """
        url = f"{self.api_url}/content/{page_id}"
        params = {
            'expand': 'body.storage,ancestors,version'
        }
        
        response = requests.get(url, auth=self.auth, headers=self.headers, params=params)
        
        if response.status_code == 200:
            return response.json()
        
        return None
    
    def create_page(self, space_key, title, content, parent_id=None, labels=None):
        """
        새 페이지를 생성합니다.
        
        Args:
            space_key: 스페이스 키
            title: 페이지 제목
            content: 페이지 내용 (HTML 형식)
            parent_id: 부모 페이지 ID (선택 사항)
            labels: 레이블 목록 (선택 사항)
            
        Returns:
            생성된 페이지 정보 또는 None (실패한 경우)
        """
        url = f"{self.api_url}/content"
        
        data = {
            'type': 'page',
            'title': title,
            'space': {'key': space_key},
            'body': {
                'storage': {
                    'value': content,
                    'representation': 'storage'
                }
            }
        }
        
        if parent_id:
            data['ancestors'] = [{'id': parent_id}]
        
        response = requests.post(url, auth=self.auth, headers=self.headers, json=data)
        
        if response.status_code == 200:
            page = response.json()
            
            # 레이블 추가
            if labels and len(labels) > 0:
                self.add_labels(page['id'], labels)
            
            return page
        else:
            print(f"페이지 생성 실패: {response.status_code} - {response.text}")
            return None
    
    def update_page(self, page_id, title, content, labels=None):
        """
        기존 페이지를 업데이트합니다.
        
        Args:
            page_id: 페이지 ID
            title: 페이지 제목
            content: 페이지 내용 (HTML 형식)
            labels: 레이블 목록 (선택 사항)
            
        Returns:
            업데이트된 페이지 정보 또는 None (실패한 경우)
        """
        page = self.get_page_by_id(page_id)
        if not page:
            return None
        
        url = f"{self.api_url}/content/{page_id}"
        
        data = {
            'type': 'page',
            'title': title,
            'space': {'key': page['space']['key']},
            'body': {
                'storage': {
                    'value': content,
                    'representation': 'storage'
                }
            },
            'version': {
                'number': page['version']['number'] + 1
            }
        }
        
        if 'ancestors' in page and page['ancestors']:
            data['ancestors'] = [{'id': page['ancestors'][-1]['id']}]
        
        response = requests.put(url, auth=self.auth, headers=self.headers, json=data)
        
        if response.status_code == 200:
            updated_page = response.json()
            
            # 레이블 업데이트
            if labels and len(labels) > 0:
                self.add_labels(page_id, labels)
            
            return updated_page
        else:
            print(f"페이지 업데이트 실패: {response.status_code} - {response.text}")
            return None
    
    def add_labels(self, page_id, labels):
        """
        페이지에 레이블을 추가합니다.
        
        Args:
            page_id: 페이지 ID
            labels: 레이블 목록
            
        Returns:
            성공 여부
        """
        url = f"{self.api_url}/content/{page_id}/label"
        
        label_data = [{'name': label} for label in labels]
        
        response = requests.post(url, auth=self.auth, headers=self.headers, json=label_data)
        
        return response.status_code == 200

def load_env_file(env_file=None):
    """
    .env 파일에서 환경 변수를 로드합니다.
    
    Args:
        env_file: .env 파일 경로 (선택 사항)
    """
    # 기본 .env 파일 로드
    load_dotenv()
    
    # 사용자 지정 .env 파일이 있으면 추가로 로드
    if env_file and os.path.exists(env_file):
        load_dotenv(env_file, override=True)
        click.echo(f".env 파일을 로드했습니다: {env_file}")

@click.command()
@click.option("--url", required=True, help="Confluence URL (예: https://your-domain.atlassian.net/wiki)")
@click.option("--username", help="Confluence 계정 이메일 (기본값: CONFLUENCE_USERNAME 환경 변수)")
@click.option("--api-token", help="Confluence API 토큰 (기본값: CONFLUENCE_API_TOKEN 환경 변수)")
@click.option("--env-file", help=".env 파일 경로 (환경 변수를 로드할 파일)")
@click.option("--space", required=True, help="Confluence 스페이스 이름 또는 키")
@click.option("--parent", help="부모 페이지 제목 (선택 사항)")
@click.option("--title", required=True, help="페이지 제목")
@click.option("--label", "-l", multiple=True, help="페이지 레이블 (여러 개 지정 가능)")
@click.option("--content-file", help="페이지 내용이 담긴 파일 경로 (--content와 함께 사용 불가)")
@click.option("--content", help="페이지 내용 (HTML 형식, --content-file과 함께 사용 불가)")
@click.option("--update", is_flag=True, help="같은 제목의 페이지가 있으면 업데이트")
def main(url, username, api_token, env_file, space, parent, title, label, content_file, content, update):
    """
    Confluence에 페이지를 생성하는 CLI 도구
    
    스페이스, 부모 페이지, 페이지 타이틀, 레이블, 컨텐츠를 입력으로 받아 Confluence에 페이지를 생성합니다.
    
    환경 변수 설정 방법:
    1. .env 파일 사용: --env-file 옵션으로 .env 파일 경로 지정
    2. 시스템 환경 변수 사용: CONFLUENCE_USERNAME, CONFLUENCE_API_TOKEN 환경 변수 설정
    3. 명령줄 옵션 사용: --username, --api-token 옵션 사용
    
    .env 파일 예시:
    ```
    CONFLUENCE_USERNAME=your-email@example.com
    CONFLUENCE_API_TOKEN=your-api-token
    ```
    """
    # .env 파일 로드
    load_env_file(env_file)
    
    # 내용 확인
    if content_file and content:
        click.echo("오류: --content-file과 --content는 함께 사용할 수 없습니다.", err=True)
        sys.exit(1)
    
    if content_file:
        if not os.path.exists(content_file):
            click.echo(f"오류: 파일을 찾을 수 없습니다: {content_file}", err=True)
            sys.exit(1)
        
        with open(content_file, 'r', encoding='utf-8') as f:
            content = f.read()
    
    if not content:
        click.echo("오류: 페이지 내용이 필요합니다. --content 또는 --content-file 옵션을 사용하세요.", err=True)
        sys.exit(1)
    
    try:
        # Confluence 클라이언트 초기화
        client = ConfluenceClient(url, username, api_token)
        
        # 스페이스 키 조회
        space_key = client.get_space_key(space)
        if not space_key:
            click.echo(f"오류: '{space}' 스페이스를 찾을 수 없습니다.", err=True)
            sys.exit(1)
        
        # 부모 페이지 ID 조회
        parent_id = None
        if parent:
            parent_id = client.get_page_id(space_key, parent)
            if not parent_id:
                click.echo(f"오류: '{parent}' 부모 페이지를 찾을 수 없습니다.", err=True)
                sys.exit(1)
        
        # 기존 페이지 확인
        existing_page_id = client.get_page_id(space_key, title, parent)
        
        if existing_page_id and update:
            # 페이지 업데이트
            click.echo(f"기존 페이지 '{title}'을(를) 업데이트합니다...")
            page = client.update_page(existing_page_id, title, content, label)
            if page:
                click.echo(f"페이지가 성공적으로 업데이트되었습니다: {page['_links']['webui']}")
                return 0
            else:
                click.echo("페이지 업데이트에 실패했습니다.", err=True)
                return 1
        elif existing_page_id and not update:
            click.echo(f"오류: '{title}' 제목의 페이지가 이미 존재합니다. 업데이트하려면 --update 옵션을 사용하세요.", err=True)
            return 1
        else:
            # 새 페이지 생성
            click.echo(f"새 페이지 '{title}'을(를) 생성합니다...")
            page = client.create_page(space_key, title, content, parent_id, label)
            if page:
                click.echo(f"페이지가 성공적으로 생성되었습니다: {page['_links']['webui']}")
                return 0
            else:
                click.echo("페이지 생성에 실패했습니다.", err=True)
                return 1
    
    except Exception as e:
        click.echo(f"오류가 발생했습니다: {str(e)}", err=True)
        return 1

if __name__ == "__main__":
    main() 