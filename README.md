# Fenyidic

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
