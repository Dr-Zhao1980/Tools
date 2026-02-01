# 工具集合仓库 🛠️

这是一个收录各种实用工具的仓库，包含从不同渠道获取的各类系统工具和我自己写的一些实用程序。

## 📁 工具目录

### 🌐 网络工具

#### 360网络急救箱
- **描述**: 360公司出品的网络诊断和修复工具
- **功能**: 
  - 网络连接诊断
  - 网络配置修复
  - 网络流量监控
  - 系统网络优化
- **位置**: `360网络急救箱/`
- **主要文件**:
  - `._cache_360网络急救箱.exe` - 主程序
  - 各种DLL文件提供网络诊断功能
  - 配置文件和数据文件
- **支持系统**: Windows
- **风险等级**: 低

### 🛡️ 系统安全工具

#### 禁用Windows Defender
- **描述**: 一键禁用和卸载Windows Defender的工具
- **功能**: 
  - 快速禁用Windows Defender
  - 完全卸载Windows Defender组件
- **位置**: `禁用WindowsDefinder/`
- **主要文件**:
  - `一键禁用卸载Windows Defender1.1.exe` - 主程序
- **支持系统**: Windows
- **风险等级**: 高

### 🌐 浏览器增强脚本

#### 油猴脚本（Tampermonkey/Greasemonkey）
- **描述**: 跨平台浏览器用户脚本集合
- **位置**: `油猴脚本/`
- **支持系统**: Windows, Linux, macOS
- **风险等级**: 低-中

**包含脚本:**

1. **AI-Sidebar(fix).user.js** - AI对话目录增强
   - 为 ChatGPT 和 Gemini 提供右侧目录导航
   - 支持搜索、快捷键、拖拽调整等功能
   - 适配网站: chatgpt.com, gemini.google.com

2. **12306抢票脚本**
   - `稳定版抢票.user.js` - 保守策略，稳定性优先
   - `激进版抢票.user.js` - 激进策略，速度优先
   - 适配网站: 12306.cn
   - ⚠️ 使用风险: 中（请遵守12306使用规则）

## 🚀 使用说明

### Windows系统使用步骤
1. 选择需要的工具目录
2. 以管理员权限运行相应的可执行文件
3. 按照工具界面提示进行操作

### 🐧 Linux系统使用说明

#### 可在Linux上使用的工具

**油猴脚本（Tampermonkey/Greasemonkey脚本）**

本仓库中的所有浏览器脚本均可在Linux系统上正常使用，包括：
- `AI-Sidebar(fix).user.js` - AI对话目录增强脚本
- `12306/稳定版抢票.user.js` - 12306抢票脚本（稳定版）
- `12306/激进版抢票.user.js` - 12306抢票脚本（激进版）

**Linux上的安装步骤：**

1. **安装浏览器**（选择任一）:
   - Firefox: `sudo apt install firefox` (Debian/Ubuntu)
   - Chrome/Chromium: `sudo apt install chromium-browser`
   - 或使用系统自带的浏览器

2. **安装脚本管理器扩展**:
   - **Tampermonkey**: 
     - Firefox: 访问 [Firefox 扩展商店](https://addons.mozilla.org/firefox/addon/tampermonkey/)
     - Chrome/Chromium: 访问 [Chrome 网上应用店](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
   - **Greasemonkey** (仅Firefox): 
     - 访问 [Firefox 扩展商店](https://addons.mozilla.org/firefox/addon/greasemonkey/)

3. **安装用户脚本**:
   ```bash
   # 克隆本仓库
   git clone https://github.com/Dr-Zhao1980/Tools.git
   cd Tools/油猴脚本
   
   # 在浏览器中打开脚本文件，Tampermonkey会自动识别并提示安装
   # 或者直接拖拽.user.js文件到浏览器窗口
   ```

4. **使用脚本**:
   - AI-Sidebar脚本: 访问 chatgpt.com 或 gemini.google.com 即可自动启用
   - 12306抢票脚本: 登录 12306.cn 后自动启用增强功能

#### 不支持Linux的工具

以下工具为Windows专用程序（.exe可执行文件），无法直接在Linux上运行：
- **360网络急救箱** - Windows网络诊断工具
- **禁用Windows Defender** - Windows系统安全工具

**Linux替代方案：**

如果您需要类似功能，可以使用以下Linux原生工具：

1. **网络诊断工具**（替代360网络急救箱）:
   ```bash
   # 网络连接诊断
   ping google.com
   traceroute google.com
   
   # 网络配置查看
   ip addr show
   ifconfig
   
   # 网络流量监控
   sudo apt install nethogs   # 进程网络监控
   sudo apt install iftop      # 网络流量监控
   sudo apt install nload      # 实时流量监控
   
   # DNS诊断
   nslookup google.com
   dig google.com
   ```

2. **系统安全管理**（替代Windows Defender）:
   ```bash
   # Linux防病毒软件
   sudo apt install clamav            # ClamAV防病毒
   sudo apt install rkhunter          # Rootkit检测
   sudo apt install chkrootkit        # Rootkit扫描
   
   # 防火墙管理
   sudo ufw status                    # UFW防火墙状态
   sudo ufw enable                    # 启用防火墙
   sudo systemctl status firewalld    # FirewallD状态
   ```

#### 在Linux上运行Windows程序（高级）

如果您确实需要运行Windows程序，可以尝试以下方案：

1. **Wine** - Windows应用兼容层:
   ```bash
   # 安装Wine
   sudo apt install wine winetricks
   
   # 运行Windows程序
   wine program.exe
   ```
   ⚠️ 注意: Wine对系统级工具支持有限，不推荐用于本仓库的Windows工具

2. **虚拟机** - 完整的Windows环境:
   - VirtualBox: `sudo apt install virtualbox`
   - QEMU/KVM: `sudo apt install qemu-kvm virt-manager`
   
   在虚拟机中安装Windows系统后可正常使用所有Windows工具

### ⚠️ 重要提醒
- **管理员权限**: 大部分Windows工具需要管理员权限才能正常运行
- **系统兼容性**: 请确认工具与您的操作系统版本兼容
- **备份重要数据**: 使用系统修改类工具前，建议备份重要数据
- **杀毒软件**: 某些工具可能被杀毒软件误报，请根据实际情况判断
- **Linux用户**: 浏览器脚本可直接使用，系统工具建议使用Linux原生替代方案

## 📋 工具分类

| 分类 | 工具名称 | 主要功能 | 支持系统 | 风险等级 |
|------|----------|----------|----------|----------|
| 网络诊断 | 360网络急救箱 | 网络问题诊断修复 | Windows | 低 |
| 系统安全 | 禁用Windows Defender | 系统安全组件管理 | Windows | 高 |
| 浏览器增强 | AI-Sidebar脚本 | AI对话目录增强 | 全平台 | 低 |
| 浏览器增强 | 12306抢票脚本 | 火车票自动抢票 | 全平台 | 中 |

## 🔄 更新日志

- **初始版本**: 添加360网络急救箱和Windows Defender禁用工具

## 📞 支持与反馈

如果您在使用过程中遇到问题或有新的工具推荐，欢迎提出反馈。

## ⚖️ 免责声明

1. 本仓库收录的工具来源于网络，仅供学习和研究使用
2. 使用这些工具可能存在一定风险，请用户自行承担使用后果
3. 建议在虚拟机或测试环境中先行测试
4. 请遵守相关法律法规，不要用于非法用途

## 📝 许可证

本仓库内容仅供个人学习使用，请勿用于商业用途。各工具的版权归原作者所有。

---

**最后更新**: 2025年
**维护者**: Dr.Zhao
