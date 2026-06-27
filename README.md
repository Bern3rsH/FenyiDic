# FenyiDic

[简体中文](./README.md) | [English](./README_EN.md)

FenyiDic 是一款面向英语学习的支持 macOS 的桌面分义词典，把查词、义项整理、辅助精读和长期复习放在同一个工作流中。

它不只记录“这个单词”，而是帮助你保存真正需要学习的具体义项，并通过标签决定之后要用阅读、听力、口语、拼写还是听写来复习。

[下载最新版本](https://github.com/Bern3rsH/FenyiDic/releases/latest)

![FenyiDic 首页](./docs/images/home.png)

## 核心功能

### 分义查词

- 按词条查看英文释义、中文释义和例句
- 支持英文、中文、双语三种释义显示模式
- 支持英音、美音播放与自动发音
- 可收藏具体义项，也可直接收藏整个词条
- 可为词条和义项添加标签、笔记或归档状态

![FenyiDic 分义查词](./docs/images/sense-lookup.png)

### 我的词库

- 分开管理词条、义项及其他学习条目
- 按标签、收藏和归档状态筛选内容
- 支持批量收藏、归档、添加标签、删除标签和清理笔记
- 使用分页浏览较大的个人词库
- 支持导入普通 CSV 或 FenyiDic 导出的完整数据
- 导出的 CSV 同时保留通用字段和 Anki 可用的 `front`、`back`、`tags` 等字段

![FenyiDic 我的词库](./docs/images/personal-library.png)

### 标签驱动复习

FenyiDic 使用 FSRS 安排复习进度，并允许为不同标签指定不同的复习方式：

- 阅读理解
- 听力理解
- 口语检测
- 拼写检测
- 听写检测

例如，可以把“听不懂”标签设置为听力理解，把“不会拼”标签设置为拼写检测。同一个词条或义项可以根据学习问题进入不同的复习任务。

![FenyiDic 标签驱动复习](./docs/images/tag-driven-review.png)

### 辅助精读

- 粘贴英文文章并按步骤完成辅助精读
- 在原文中标记生词并直接查词
- 从词典中选择与上下文对应的具体义项
- 集中整理文章中遇到的单词和语法问题
- 批量收藏或添加标签，将阅读结果纳入后续复习

![FenyiDic 辅助精读](./docs/images/guided-intensive-reading.png)

### 中英文界面

应用界面支持简体中文和 English，并会根据当前界面语言展示对应的软件更新内容。

## 推荐使用流程

1. 首次启动时导入词典文件。
2. 搜索单词并定位真正需要学习的义项。
3. 收藏义项，添加描述学习问题的标签。
4. 在设置中为标签选择复习模式。
5. 通过复习窗口完成到期任务。
6. 阅读文章时使用辅助精读，把上下文中的新内容继续加入个人词库。

## 下载安装

当前发布流程提供 macOS Apple Silicon 和 Intel 版本：

- [GitHub Releases](https://github.com/Bern3rsH/FenyiDic/releases/latest)

> **安装提示：** 首次安装 FenyiDic 以及后续安装新版本后，都需要前往“系统设置 > 隐私与安全性”，点击“仍要打开”（Open Anyway），然后重新打开 FenyiDic。

如果通过浏览器下载后 macOS 提示应用已损坏、无法验证开发者，或点击后只显示 Dock 图标没有窗口，请先将 FenyiDic 拖入“应用程序”，再在终端执行：

```bash
sudo /usr/bin/xattr -dr com.apple.quarantine "/Applications/FenyiDic.app"
```

然后重新打开 FenyiDic。

## 词典数据

本仓库和应用安装包不包含任何第三方词典数据，也不会随软件分发 MDX/MDD 文件。

目前应用导入流程适配指定的牛津双解词典文件：

- MDX：必需，包含词条与释义数据
- MDD：可选，包含发音等资源

词典文件需要由用户自行合法获取。应用内提供以下下载入口：

- [Google Drive](https://drive.google.com/file/d/1R9DM3QP9mBaLhnQ2bCrCUp_UJdLgp90l/view?usp=sharing)
- [百度网盘](https://pan.baidu.com/s/1vVwRSmCW9QLrc5wipwitGw?pwd=nzuf)

## 本地开发

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
npm run dist:mac
```

从本地 MDX 生成数据库：

```bash
MDX_PATH=/path/to/dictionary.mdx npm run db:build
```

## 许可

本项目是 source-available，不是开源软件。源码公开仅用于查看、个人非商业评估和反馈。

未经版权持有人书面许可，不得商用、再分发、发布修改版、发布安装包或二进制文件、提供托管服务、移除版权或品牌标识，也不得随项目分发任何第三方词典数据、MDX/MDD 文件、词典正文或音频资源。

完整条款见 [LICENSE](./LICENSE)。
