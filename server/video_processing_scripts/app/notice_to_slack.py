#!/usr/bin/env python3
"""
Confluence 페이지 링크를 받아 AI 세션 녹화본 공유 공지글을 작성하고 슬랙 DM을 보내는 스크립트
"""

import os
import sys
import click
import json
import requests
from typing import List, Dict, Any, Optional
from pathlib import Path
from dotenv import load_dotenv

from langchain_anthropic import ChatAnthropic
from langchain.prompts import ChatPromptTemplate
from langchain.schema import StrOutputParser

class SlackClient:
    """Slack API 클라이언트 클래스"""
    
    def __init__(self, token=None):
        """
        Slack API 클라이언트 초기화
        
        Args:
            token: Slack API 토큰
        """
        self.token = token or os.environ.get('SLACK_API_TOKEN')
        
        if not self.token:
            raise ValueError("Slack API 토큰이 필요합니다. "
                            "--slack-token 옵션을 사용하거나 "
                            "SLACK_API_TOKEN 환경 변수를 설정하세요.")
        
        self.headers = {
            'Content-Type': 'application/json; charset=utf-8',
            'Authorization': f'Bearer {self.token}'
        }
    
    def find_user_by_name(self, username: str) -> Optional[str]:
        """
        사용자 이름으로 Slack 사용자 ID를 찾습니다.
        
        Args:
            username: 찾을 사용자 이름 (예: '이동훈')
            
        Returns:
            사용자 ID 또는 None (찾지 못한 경우)
        """
        url = "https://slack.com/api/users.list"
        
        response = requests.get(url, headers=self.headers)
        
        if response.status_code == 200:
            data = response.json()
            if data['ok']:
                for user in data['members']:
                    # 실명 또는 표시 이름에서 사용자 찾기
                    real_name = user.get('real_name', '').lower()
                    display_name = user.get('profile', {}).get('display_name', '').lower()
                    
                    if username.lower() in real_name or username.lower() in display_name:
                        return user['id']
        
        return None
    
    def send_direct_message(self, user_id: str, message: str) -> bool:
        """
        사용자에게 다이렉트 메시지를 보냅니다.
        
        Args:
            user_id: 메시지를 받을 사용자 ID
            message: 보낼 메시지 내용
            
        Returns:
            성공 여부
        """
        url = "https://slack.com/api/chat.postMessage"
        
        payload = {
            'channel': user_id,
            'text': message,
            'as_user': True
        }
        
        response = requests.post(url, headers=self.headers, json=payload)
        
        if response.status_code == 200:
            data = response.json()
            return data['ok']
        
        return False

def generate_notice(confluence_links: List[str], related_links: List[str]) -> str:
    """
    AI 세션 녹화본 공유 공지글을 생성합니다.
    
    Args:
        confluence_links: Confluence 페이지 링크 목록
        related_links: 관련 문서 링크 목록
        
    Returns:
        생성된 공지글
    """
    # 테스트 모드 확인
    if os.environ.get("ANTHROPIC_API_KEY") == "test-anthropic-api-key" or not os.environ.get("ANTHROPIC_API_KEY"):
        # 테스트 모드: 샘플 공지글 반환
        click.echo("테스트 모드: 샘플 공지글을 생성합니다.")
        
        confluence_links_str = "\n".join([f"- {link}" for link in confluence_links])
        related_links_str = "\n".join([f"- {link}" for link in related_links]) if related_links else "없음"
        
        return f"""# 모두의 AI 세션 녹화본 공유

안녕하세요, 팀원 여러분!

최근 진행된 AI 세션의 녹화본을 공유드립니다. 이번 세션에서는 최신 AI 기술 동향과 실제 업무에 적용할 수 있는 다양한 방법들을 다루었습니다. 녹화본을 통해 세션에 참여하지 못했거나 다시 복습하고 싶은 내용을 확인하실 수 있습니다.

## 녹화본 링크
{confluence_links_str}

## 관련 문서
{related_links_str}

세션 내용에 대해 궁금한 점이나 추가 질문이 있으시면 언제든지 문의해 주세요. 함께 배우고 성장하는 기회가 되길 바랍니다!

감사합니다.
"""
    
    # Anthropic Claude 모델 초기화
    model = ChatAnthropic(model="claude-3-sonnet-20240229", temperature=0.7)
    
    # 프롬프트 템플릿 생성
    prompt = ChatPromptTemplate.from_messages([
        ("system", """
        당신은 회사 내부 공지사항을 작성하는 전문가입니다. 
        AI 세션 녹화본 공유에 대한 공지글을 작성해주세요.
        
        다음 가이드라인을 따라주세요:
        1. 공지글은 친근하고 전문적인 톤으로 작성해주세요.
        2. 공지글에는 AI 세션의 중요성과 녹화본을 통해 얻을 수 있는 가치를 간략히 설명해주세요.
        3. 제공된 Confluence 페이지 링크와 관련 문서 링크를 포함해주세요.
        4. 공지글은 3-4 문단 정도로 간결하게 작성해주세요.
        5. 마지막에는 질문이나 피드백이 있으면 언제든 문의해달라는 문구를 추가해주세요.
        
        공지글 형식:
        - 제목: "모두의 AI 세션 녹화본 공유"
        - 본문: 세션 소개, 녹화본 가치, 링크 안내, 문의 방법
        """),
        ("human", f"""
        다음 정보를 사용하여 AI 세션 녹화본 공유 공지글을 작성해주세요:
        
        Confluence 페이지 링크:
        {json.dumps(confluence_links, indent=2, ensure_ascii=False)}
        
        관련 문서 링크:
        {json.dumps(related_links, indent=2, ensure_ascii=False)}
        """)
    ])
    
    # 체인 구성 및 실행
    chain = prompt | model | StrOutputParser()
    result = chain.invoke({})
    
    return result

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
@click.option("--confluence-links", "-c", multiple=True, help="Confluence 페이지 링크 (여러 개 지정 가능)")
@click.option("--related-links", "-r", multiple=True, help="관련 문서 링크 (여러 개 지정 가능)")
@click.option("--recipient", default="이동훈", help="슬랙 DM을 받을 사용자 이름 (기본값: 이동훈)")
@click.option("--slack-token", help="Slack API 토큰 (기본값: SLACK_API_TOKEN 환경 변수)")
@click.option("--anthropic-api-key", help="Anthropic API 키 (기본값: ANTHROPIC_API_KEY 환경 변수)")
@click.option("--env-file", help=".env 파일 경로 (환경 변수를 로드할 파일)")
@click.option("--dry-run", is_flag=True, help="실제로 메시지를 보내지 않고 미리보기만 표시")
@click.option("--test-mode", is_flag=True, help="테스트 모드: API 호출 없이 샘플 공지글 생성")
def main(confluence_links, related_links, recipient, slack_token, anthropic_api_key, env_file, dry_run, test_mode):
    """
    Confluence 페이지 링크를 받아 AI 세션 녹화본 공유 공지글을 작성하고 슬랙 DM을 보냅니다.
    
    예시:
    
    \b
    poetry run notice-to-slack \\
        --confluence-links "https://myrealtrip.atlassian.net/wiki/spaces/AL/pages/4139942192/AI" \\
        --related-links "https://lilys.ai" \\
        --recipient "이동훈"
    """
    # .env 파일 로드
    load_env_file(env_file)
    
    # API 키 설정
    if anthropic_api_key:
        os.environ["ANTHROPIC_API_KEY"] = anthropic_api_key
    
    # 테스트 모드 설정
    if test_mode:
        os.environ["ANTHROPIC_API_KEY"] = "test-anthropic-api-key"
        click.echo("테스트 모드가 활성화되었습니다.")
    
    # 필수 환경 변수 확인
    if not os.environ.get("ANTHROPIC_API_KEY") and not test_mode:
        click.echo("경고: Anthropic API 키가 설정되지 않았습니다. 테스트 모드로 실행합니다.", err=True)
        os.environ["ANTHROPIC_API_KEY"] = "test-anthropic-api-key"
    
    # 링크 확인
    if not confluence_links:
        click.echo("오류: 최소한 하나의 Confluence 페이지 링크가 필요합니다.", err=True)
        sys.exit(1)
    
    try:
        # 공지글 생성
        click.echo("AI 세션 녹화본 공유 공지글을 생성하는 중...")
        notice = generate_notice(list(confluence_links), list(related_links))
        
        # 공지글 출력
        click.echo("\n=== 생성된 공지글 ===\n")
        click.echo(notice)
        click.echo("\n====================\n")
        
        if dry_run:
            click.echo("Dry run 모드: 실제로 메시지를 보내지 않습니다.")
            return 0
        
        if test_mode:
            click.echo("테스트 모드: 실제로 메시지를 보내지 않습니다.")
            return 0
        
        # Slack 클라이언트 초기화
        try:
            slack_client = SlackClient(slack_token)
        except ValueError as e:
            click.echo(f"오류: {str(e)}", err=True)
            sys.exit(1)
        
        # 사용자 ID 찾기
        click.echo(f"'{recipient}' 사용자를 찾는 중...")
        user_id = slack_client.find_user_by_name(recipient)
        
        if not user_id:
            click.echo(f"오류: '{recipient}' 사용자를 찾을 수 없습니다.", err=True)
            sys.exit(1)
        
        # 메시지 보내기
        click.echo(f"'{recipient}' 사용자에게 DM을 보내는 중...")
        success = slack_client.send_direct_message(user_id, notice)
        
        if success:
            click.echo("메시지가 성공적으로 전송되었습니다.")
            return 0
        else:
            click.echo("메시지 전송에 실패했습니다.", err=True)
            return 1
    
    except Exception as e:
        click.echo(f"오류가 발생했습니다: {str(e)}", err=True)
        return 1

if __name__ == "__main__":
    main() 