# FenyiDic

支持义项级收藏、标签和复习的桌面分义词典。

## 词典数据

本仓库不包含任何第三方词典数据，也不会内置发布 MDX/MDD 文件。

首次使用时，需要在应用内导入你自己合法持有的词典文件：

- MDX：词条与释义数据
- MDD：可选，通常用于音频等资源

## 功能

- 导入本地 MDX/MDD 词典文件
- 搜索词条与义项
- 义项级收藏、归档和标签管理
- 阅读、听音、拼写、听写等复习模式
- 收藏数据导入

## 开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
npm run dist:mac
```

## 可选：从本地 MDX 生成数据库

```bash
MDX_PATH=/path/to/dictionary.mdx npm run db:build
```

## 许可

本项目是 source-available，不是开源软件。源码公开仅用于查看、个人非商业评估和反馈。

未经版权持有人书面许可，不得商用、再分发、发布修改版、发布安装包/二进制文件、提供托管服务、移除版权或品牌标识，也不得随项目分发任何第三方词典数据、MDX/MDD 文件、词典正文或音频资源。

完整条款见 [LICENSE](./LICENSE)。
