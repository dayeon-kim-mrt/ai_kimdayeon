import sys
import os
import threading
from PyQt5.QtWidgets import (
    QApplication, QMainWindow, QPushButton, QMessageBox, QVBoxLayout, QWidget,
    QFileDialog, QProgressBar, QLabel, QHBoxLayout
)
from PyQt5.QtCore import pyqtSignal, QObject, Qt
from pathlib import Path

from app.commons.transcriber import Transcriber

class ProgressSignals(QObject):
    """진행 상황을 보고하기 위한 시그널 클래스"""
    progress = pyqtSignal(int, str)
    finished = pyqtSignal(bool, str)

class SimpleApp(QMainWindow):
    def __init__(self):
        super().__init__()
        self.transcriber = Transcriber()
        self.signals = ProgressSignals()
        self.signals.progress.connect(self.update_progress)
        self.signals.finished.connect(self.transcription_finished)
        self.init_ui()
        
    def init_ui(self):
        self.setWindowTitle("오디오 자막 변환기")
        self.setGeometry(300, 300, 500, 200)
        
        # 중앙 위젯 생성
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        
        # 메인 레이아웃 설정
        main_layout = QVBoxLayout(central_widget)
        
        # 버튼 생성
        self.button = QPushButton("오디오 파일 선택", self)
        self.button.clicked.connect(self.select_audio_file)
        
        # 상태 레이블
        self.status_label = QLabel("오디오 파일을 선택하세요")
        self.status_label.setAlignment(Qt.AlignCenter)
        
        # 진행 상황 표시줄
        self.progress_bar = QProgressBar()
        self.progress_bar.setRange(0, 100)
        self.progress_bar.setValue(0)
        
        # 레이아웃에 위젯 추가
        main_layout.addWidget(self.button)
        main_layout.addWidget(self.status_label)
        main_layout.addWidget(self.progress_bar)
        
    def select_audio_file(self):
        """오디오 파일 선택 대화상자를 표시합니다."""
        file_path, _ = QFileDialog.getOpenFileName(
            self, "오디오 파일 선택", "", 
            "오디오 파일 (*.mp3 *.wav *.m4a *.flac *.ogg);;모든 파일 (*.*)"
        )
        
        if file_path:
            self.process_audio_file(file_path)
    
    def process_audio_file(self, audio_path):
        """오디오 파일 처리를 시작합니다."""
        self.button.setEnabled(False)
        self.status_label.setText(f"파일 처리 중: {os.path.basename(audio_path)}")
        self.progress_bar.setValue(0)
        
        # 출력 파일 경로 선택
        output_path, _ = QFileDialog.getSaveFileName(
            self, "자막 파일 저장", 
            os.path.splitext(audio_path)[0] + ".srt",
            "자막 파일 (*.srt)"
        )
        
        if not output_path:
            self.button.setEnabled(True)
            self.status_label.setText("작업이 취소되었습니다")
            return
        
        # 별도의 스레드에서 변환 작업 실행
        threading.Thread(
            target=self.run_transcription,
            args=(audio_path, output_path),
            daemon=True
        ).start()
    
    def run_transcription(self, audio_path, output_path):
        """별도의 스레드에서 실행되는 변환 작업"""
        try:
            # 진행 상황 콜백 함수 설정
            def progress_callback(percent, message):
                self.signals.progress.emit(percent, message)
            
            # Transcriber 인스턴스 생성 및 변환 실행
            transcriber = Transcriber(progress_callback)
            success = transcriber.transcribe(audio_path, output_path)
            
            # 완료 시그널 발생
            self.signals.finished.emit(success, output_path if success else "")
            
        except Exception as e:
            self.signals.finished.emit(False, str(e))
    
    def update_progress(self, percent, message):
        """진행 상황 업데이트"""
        if percent < 0:  # 오류 발생
            self.progress_bar.setValue(0)
            self.status_label.setText(f"오류: {message}")
        else:
            self.progress_bar.setValue(percent)
            self.status_label.setText(message)
    
    def transcription_finished(self, success, output_path):
        """변환 작업 완료 처리"""
        self.button.setEnabled(True)
        
        if success:
            self.status_label.setText(f"변환 완료: {os.path.basename(output_path)}")
            QMessageBox.information(
                self, 
                "변환 완료", 
                f"자막 파일이 성공적으로 생성되었습니다:\n{output_path}"
            )
        else:
            self.status_label.setText(f"변환 실패: {output_path}")
            QMessageBox.critical(
                self, 
                "변환 실패", 
                f"자막 생성 중 오류가 발생했습니다:\n{output_path}"
            )

def main():
    app = QApplication(sys.argv)
    window = SimpleApp()
    window.show()
    sys.exit(app.exec_())

if __name__ == "__main__":
    main() 