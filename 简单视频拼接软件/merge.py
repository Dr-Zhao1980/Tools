import sys
import os
import subprocess
from PyQt5.QtWidgets import QApplication, QWidget, QVBoxLayout, QPushButton, QListWidget, QFileDialog, QMessageBox
# 直接调用 moviepy 附带的 ffmpeg 核心，免去配置环境变量的烦恼！
import imageio_ffmpeg

class FastVideoMergerApp(QWidget):
    def __init__(self):
        super().__init__()
        self.video_paths = []
        self.initUI()

    def initUI(self):
        self.setWindowTitle('极简闪电视频拼接工具 (无损版)')
        self.resize(400, 300)
        self.setAcceptDrops(True)

        layout = QVBoxLayout()

        self.list_widget = QListWidget()
        layout.addWidget(self.list_widget)

        self.btn_import = QPushButton('点击导入视频 (或直接拖入)')
        self.btn_import.clicked.connect(self.import_videos)
        layout.addWidget(self.btn_import)

        self.btn_merge = QPushButton('⚡ 秒速无损合并')
        self.btn_merge.clicked.connect(self.merge_videos)
        layout.addWidget(self.btn_merge)

        self.setLayout(layout)

    def dragEnterEvent(self, event):
        if event.mimeData().hasUrls():
            event.accept()
        else:
            event.ignore()

    def dropEvent(self, event):
        for url in event.mimeData().urls():
            file_path = url.toLocalFile()
            if file_path.lower().endswith(('.mp4', '.avi', '.mov', '.mkv')):
                self.add_video(file_path)

    def import_videos(self):
        files, _ = QFileDialog.getOpenFileNames(
            self,
            "选择视频",
            "",
            "Video Files (*.mp4 *.avi *.mov *.mkv)"
        )
        for f in files:
            self.add_video(f)

    def add_video(self, path):
        if path not in self.video_paths:
            self.video_paths.append(path)
            self.list_widget.addItem(os.path.basename(path))

    def merge_videos(self):
        if len(self.video_paths) < 2:
            QMessageBox.warning(self, "提示", "请至少添加两个视频进行合并！")
            return

        self.btn_merge.setText("合并中，马上就好...")
        self.btn_merge.setEnabled(False)
        QApplication.processEvents()

        try:
            # 1. 确定输出路径
            first_video = self.video_paths[0]
            dir_name = os.path.dirname(first_video)
            base_name, ext = os.path.splitext(os.path.basename(first_video))
            output_path = os.path.join(dir_name, f"{base_name}_merged{ext}")
            
            # FFmpeg 拼接需要一个记录了所有视频路径的临时文本文档
            list_file_path = os.path.join(dir_name, "ffmpeg_temp_list.txt")

            # 2. 生成拼接列表文件（FFmpeg 对 Windows 路径的反斜杠敏感，需转换为正斜杠）
            with open(list_file_path, 'w', encoding='utf-8') as f:
                for vp in self.video_paths:
                    safe_path = vp.replace('\\', '/')
                    f.write(f"file '{safe_path}'\n")

            # 3. 获取隐藏的 FFmpeg 程序路径
            ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
            
            # 构建命令行指令
            cmd = [
                ffmpeg_exe,
                '-y',                  # 如果有同名文件直接覆盖
                '-f', 'concat',        # 使用 concat（拼接）协议
                '-safe', '0',          # 解除对绝对路径的安全限制
                '-i', list_file_path,  # 读取我们刚生成的文本文档
                '-c', 'copy',          # ⭐️ 核心魔法指令：直接复制音视频流，不重新编码！
                output_path            # 输出路径
            ]

            # 隐藏 Windows 下运行命令行时可能弹出的黑框
            startupinfo = None
            if os.name == 'nt':
                startupinfo = subprocess.STARTUPINFO()
                startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW

            # 4. 执行合并指令
            subprocess.run(cmd, check=True, startupinfo=startupinfo)

            # 5. 打扫战场：删除临时生成的文本文档
            if os.path.exists(list_file_path):
                os.remove(list_file_path)

            QMessageBox.information(self, "成功", f"无损合并完成！\n保存在: {output_path}")

        except Exception as e:
            QMessageBox.critical(self, "错误", f"合并过程中发生错误:\n{str(e)}")

        finally:
            self.btn_merge.setText("⚡ 秒速无损合并")
            self.btn_merge.setEnabled(True)

if __name__ == '__main__':
    app = QApplication(sys.argv)
    ex = FastVideoMergerApp()
    ex.show()
    sys.exit(app.exec_())