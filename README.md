# jacksontai2007.github.io

JacksonTai 的个人博客 —— 极简黑白风，零构建、纯静态，用 Markdown 写文章。

## 特性

- 🎨 极简黑白主题，深 / 浅色一键切换（跟随系统）
- 📝 用 Markdown 写文章，浏览器端渲染（[marked](https://marked.js.org/)，本地内置）
- 🗂️ 首页最新文章 / 全部文章列表 / 按年归档 / 关于页
- 🔍 标签筛选 + 标题/摘要/标签全文搜索
- 📑 文章页自动生成目录（TOC）、上一篇 / 下一篇导航
- ⚡ 无需任何构建工具，GitHub Pages 直接托管

## 怎么发新文章

1. 在 `posts/` 下新建 Markdown 文件，例如 `posts/my-post.md`。
2. 在 `posts/index.json` 的 `posts` 数组里加一条记录：

   ```json
   {
     "id": "my-post",
     "title": "我的新文章",
     "date": "2026-06-02",
     "category": "随笔",
     "tags": ["标签A", "标签B"],
     "excerpt": "一句话摘要，显示在列表里。"
   }
   ```

   > `id` 必须和文件名（去掉 `.md`）一致。文章按 `date` 倒序排列。

3. 提交并推送即可上线，首页 / 列表 / 归档 / 标签会自动更新，**无需改动代码**。

## 本地预览

仓库根目录下起一个静态服务器即可（不能用 `file://` 直接打开，否则 `fetch` 会被浏览器拦截）：

```bash
python3 -m http.server 8000
# 然后访问 http://127.0.0.1:8000
```

## 目录结构

```
index.html        首页（简介 + 最新文章）
blog.html         全部文章（搜索 + 标签筛选）
archive.html      按年份归档
about.html        关于
post.html         文章阅读页（?id=<文章id>）
posts/
  index.json      文章元数据清单
  *.md            文章正文（Markdown）
assets/
  css/blog.css    主题样式（CSS 变量驱动深浅色）
  js/blog.js      公共逻辑（导航/主题/列表/搜索）
  js/post.js      文章页渲染 + 目录
  js/marked.min.js  Markdown 渲染库（本地内置）
static/img/       头像 logo.png、favicon
```
