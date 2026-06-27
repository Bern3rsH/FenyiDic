# Release Notes

每次发布前，在当前 `package.json` 版本号对应的小节下面填写本次更新内容。
发布流程会读取对应版本的小节正文，并写入 GitHub Release，App 检查更新时会展示这段内容。

## v1.0.0

- 功能：基本功能开发完成，初始版本手动发布

## v1.0.1

- 功能：发布上线功能开发

## v1.0.2

- 修复：某些单词在搜索结果中重复显示

## v1.0.3

- 功能：支持版本更新时列出本次更新内容
- 修复：更新安装失败时不再直接关闭应用，并提示 macOS 自动更新的签名要求

## v1.0.4

- 功能：支持安装时在系统设置中显示 Open Anyway 的安全提示

## v1.0.5

- 修复：在检查更新的弹窗中文案格式渲染错误
- 功能：因为没有付费证书，修改应用内直接下载更新的功能，改为打开 GitHub Release 页面让用户手动下载更新包

## v1.0.6

- 功能：阅读设置增加可选择双语或单语释义
- 功能：丰富批量处理功能
- 功能：设置关闭窗口快捷键
- 功能：接入 Sentry 进行错误上报
- 功能：接入 PostHog 进行用户事件上报

## v1.0.7

- 功能：增加对于 Intel 芯片的支持

## v1.1.0

- 功能：首次进入优化下载字典引导
- 功能：更新页面提示每次更新都需要去设置里面点击仍要打开
- 功能：首次加入 App 的 logo

## v1.1.1

- 功能：更新 App 图标
- 功能：把 fenyidic 改成 FenyiDic
- 修复：复习卡片到最后一张时打开弹窗，点击关闭
- 修复：修复搜索结果中可能会出现 the THE 在正确单词之前的问题

## v1.1.2

- 功能：阅读功能支持文本自动分段
- 功能：阅读功能已标记的单词样式优化
- 功能：阅读功能第一步过后，文本只读
- 功能：阅读功能支持对于单词维度进行收藏等操作
- 功能：阅读功能只有关闭窗口 才保存一次到历史记录
- 功能：阅读功能查词的时候,点击空白处,取消光标聚焦

## v1.1.3

- 功能：优化了导出功能，使得导出的文件更易于导入 Anki 使用
- 功能：优化了导入功能，支持本软件导出的文件进行导入，方便数据迁移
- 功能：批量管理功能进行 UI 优化
- 功能：我的列表页面增加了分页功能，提升了加载性能

## v1.2.0

### 中文

- 功能：增加了对于英文的支持，用户可以选择使用英文界面
- 功能：增加了全局启动 Loading
- 优化：优化了词典下载入口，增加百度网盘的下载链接

### English

- Feature: Added support for English interface, allowing users to switch to English mode
- Feature: Added global loading indicator during app startup
- Improvement: Improved dictionary download entry with additional Baidu NetDisk download links

## v1.2.1

### 中文

- 优化：优化了更新提示的文案，增加了更新内容的展示
- 优化：优化了 README，介绍产品功能并支持中英文两种语言
- 功能：添加了软件打开时检查软件更新的功能

### English

- Improvement: Optimized the update prompt copy, added display of update content
- Improvement: Optimized the README to introduce product features and support both Chinese and English languages
- Feature: Added a feature to check for software updates when the app is opened

## v1.2.2

### 中文

- 优化：优化了 README 中对于安装需要打开安全设置的说明

### English

- Improvement: Optimized the README explanation for opening security settings during installation

## v1.2.3

### 中文

- 修复：修复了阅读过程中查词，左侧标记词内容不刷新的问题
- 功能：支持在阅读过程中，手动输入单词释义
- 功能：手动输入单词释义支持英文释义输入
- 功能：导入 mdx 文件的时候增加防呆设计，如果非支持 mdx 文件，阻止导入

### English

- Bug Fix: Fixed the issue where the left marked word content would not refresh during word lookup in the reading process
- Feature: Added support for manually entering word definitions during the reading process
- Feature: Manual word definition input now supports English definitions
- Feature: Added a safeguard when importing mdx files to prevent importing unsupported file types

## v1.2.4

### 中文

- 修复：修复 App 启动时因为签名等问题导致的卡住无法打开的问题

### English

- Bug Fix: Fixed the issue where the app would get stuck and fail to open due to signing issues during startup

## v1.2.5

### 中文

- 修复：继续修复 App 启动时因为签名等问题导致的卡住无法打开的问题

### English

- Bug Fix: Continued to fix the issue where the app would get stuck and fail to open due to signing issues during startup

## v1.2.6

### 中文

- 修复：关闭 ad-hoc 签名包中的 hardened runtime，恢复 macOS 设置中“仍要打开”的安装路径

### English

- Bug Fix: Disabled hardened runtime for ad-hoc signed builds to restore the macOS Open Anyway installation path
