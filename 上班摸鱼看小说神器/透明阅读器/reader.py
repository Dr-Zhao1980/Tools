import tkinter as tk
from tkinter import filedialog, messagebox

class StealthReader:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title(" ")
        self.root.overrideredirect(True) # 无边框模式
        self.alpha_value = 0.3  # 初始化透明度
        self.root.attributes('-alpha', self.alpha_value)
        self.root.attributes('-topmost', True) # 始终置顶
        self.root.configure(bg='#2d2d2d')

        # === 核心变量初始化 (解决 Pylance 警告) ===
        # 在这里明确定义为 None，后续使用前必须检查
        self.search_frame = None  
        self.search_entry = None
        self.text_box = None
        
        # 初始打开按钮
        self.open_button = tk.Button(self.root, text="打开文件", command=self.open_file,
                                     bg='#2d2d2d', fg='white', borderwidth=0)
        self.open_button.pack(padx=50, pady=50)

        # 窗口拖动相关变量
        self.x = 0
        self.y = 0

        # === 全局事件绑定 ===
        self.root.bind('<Escape>', lambda e: self.root.destroy()) # ESC 退出
        self.root.bind('<Left>', self.decrease_alpha)    # 左箭头：变透明
        self.root.bind('<Right>', self.increase_alpha)   # 右箭头：变实心
        
        # 绑定 Ctrl+F (兼容 Windows/Linux 大小写)
        self.root.bind('<Control-f>', self.toggle_search_bar)
        self.root.bind('<Control-F>', self.toggle_search_bar)

    def decrease_alpha(self, event):
        """降低透明度"""
        self.alpha_value = max(0.1, self.alpha_value - 0.05)
        self.root.attributes('-alpha', self.alpha_value)

    def increase_alpha(self, event):
        """增加透明度"""
        self.alpha_value = min(1.0, self.alpha_value + 0.05)
        self.root.attributes('-alpha', self.alpha_value)

    def open_file(self):
        """打开文件并加载内容"""
        file_path = filedialog.askopenfilename(filetypes=[("Text files", "*.txt")])
        if not file_path:
            return

        # 销毁旧的按钮
        if self.open_button:
            self.open_button.destroy()

        # 创建文本显示框
        self.text_box = tk.Text(self.root, wrap=tk.WORD, bg='#2d2d2d', fg='white',
                                insertbackground='white', padx=10, pady=10,
                                borderwidth=0, selectbackground='#3d3d3d')
        self.text_box.pack(fill=tk.BOTH, expand=True)

        # 健壮性增强：使用 try-except 防止读取坏文件导致崩溃
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            self.text_box.insert(tk.END, content)
        except Exception as e:
            messagebox.showerror("错误", f"无法读取文件：\n{e}")
            return

        # 绑定文本框内的滚动
        self.root.bind('<Up>', lambda e: self.text_box.yview_scroll(-1, "units") if self.text_box else None)
        self.root.bind('<Down>', lambda e: self.text_box.yview_scroll(1, "units") if self.text_box else None)

        # 绑定窗口拖动 (点击文本区域也能拖动)
        self.text_box.bind('<ButtonPress-1>', self.start_move)
        self.text_box.bind('<B1-Motion>', self.on_move)

        # 创建调整大小的手柄 (右下角)
        self.resize_handle = tk.Canvas(self.root, width=10, height=10, bg='#2d2d2d',
                                       highlightthickness=0, cursor='sizing')
        self.resize_handle.place(relx=1.0, rely=1.0, anchor='se')
        self.resize_handle.bind('<ButtonPress-1>', self.start_resize)
        self.resize_handle.bind('<B1-Motion>', self.on_resize)
        
        # 初始化搜索栏组件
        self.setup_search_bar()

    def setup_search_bar(self):
        """初始化搜索栏组件 (默认隐藏)"""
        self.search_frame = tk.Frame(self.root, bg='#1f1f1f')
        
        self.search_entry = tk.Entry(self.search_frame, bg='#3c3c3c', fg='white',
                                     insertbackground='white', borderwidth=0, width=20)
        self.search_entry.pack(side=tk.LEFT, padx=(5, 2), pady=5)
        self.search_entry.bind('<Return>', self.search_chapter) # 回车搜索
        
        search_button = tk.Button(self.search_frame, text="跳转",
                                  command=lambda: self.search_chapter(None),
                                  bg='#4a4a4a', fg='white', borderwidth=0)
        search_button.pack(side=tk.LEFT, padx=(0, 5), pady=5)

    def toggle_search_bar(self, event):
        """显示/隐藏搜索栏"""
        # 健壮性检查：如果变量是 None (文件还没打开)，直接返回，不执行后续操作
        if self.search_frame is None or self.text_box is None or self.search_entry is None:
            return
            
        if self.search_frame.winfo_ismapped():
            self.search_frame.pack_forget()
            self.text_box.focus_set()
        else:
            self.search_frame.pack(side=tk.TOP, fill=tk.X, before=self.text_box)
            self.search_entry.focus_set() # 修复：这里现在是安全的，因为上面检查了 None

    def search_chapter(self, event):
        """执行搜索逻辑"""
        # 健壮性检查：确保组件都存在
        if self.search_entry is None or self.text_box is None:
            return

        query = self.search_entry.get()
        if not query:
            return

        # 清除旧高亮
        self.text_box.tag_remove('highlight', '1.0', tk.END)

        # 搜索文本
        pos = self.text_box.search(query, '1.0', stopindex=tk.END, nocase=True)
        
        if pos:
            # 计算结束位置并高亮
            end_pos = f"{pos}+{len(query)}c"
            self.text_box.tag_add('highlight', pos, end_pos)
            self.text_box.tag_config('highlight', background='#5c5c5c', foreground='white')
            
            # 跳转并显示
            self.text_box.mark_set(tk.INSERT, pos)
            self.text_box.see(tk.INSERT)
            
            # 搜索成功后清空输入框，准备下一次
            self.search_entry.delete(0, tk.END)
            # 隐藏搜索栏 (可选，看个人喜好，这里保持显示方便继续搜)
        else:
            # 没找到时的反馈
            self.search_entry.delete(0, tk.END)
            self.search_entry.insert(0, "未找到内容")

    # === 窗口控制逻辑 ===
    
    def start_move(self, event):
        self.x = event.x_root
        self.y = event.y_root

    def on_move(self, event):
        deltax = event.x_root - self.x
        deltay = event.y_root - self.y
        x = self.root.winfo_x() + deltax
        y = self.root.winfo_y() + deltay
        self.root.geometry(f"+{x}+{y}")
        self.x = event.x_root
        self.y = event.y_root

    def start_resize(self, event):
        self.start_width = self.root.winfo_width()
        self.start_height = self.root.winfo_height()
        self.start_x = event.x_root
        self.start_y = event.y_root

    def on_resize(self, event):
        new_width = self.start_width + (event.x_root - self.start_x)
        new_height = self.start_height + (event.y_root - self.start_y)
        self.root.geometry(f"{max(new_width, 100)}x{max(new_height, 50)}")

    def run(self):
        self.root.mainloop()

if __name__ == "__main__":
    reader = StealthReader()
    reader.run()