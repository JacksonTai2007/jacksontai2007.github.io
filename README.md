# jacksontai2007.github.io

JacksonTai 的个人博客 —— 「青花」主题（钴蓝墨色 + 瓷白底），零构建、纯静态，用 Markdown 写文章。

## 特性

- 🔷 **青花主题**：钴蓝墨色配瓷白底（青花瓷与澳门葡式瓷砖路牌的蓝白）；深色是深墨蓝，致敬早年蓝底的十六进制编辑器；跟随系统并可手动切换
- 🔤 **零第三方请求**：正文用系统无衬线字体（苹方 / 微软雅黑），代码与汇编清单用自托管 JetBrains Mono latin 子集（31 KB，OFL 协议）
- 📝 用 Markdown 写文章，浏览器端渲染（[marked](https://marked.js.org/)，本地内置）
- 🏠 **首页**：个人简介 + 一张 IDA 风格的 ARM64 控制流图（绿 / 红 / 蓝边与反汇编器一致，可切换图形 / 文本视图，节点里的名字可点）→ 最近的文章（精选用荧光笔标记）+ 分类、标签侧栏
- 🔖 **Logo**：`<J_>` —— 平顶六边形拆成代码尖括号 `<` `>`，中间是 J 和光标；favicon、分享图同源
- 🔍 搜索 + 标签 + 分类三重筛选，**筛选状态写进 URL**（`?q=` / `?tag=` / `?category=`），可分享、可刷新
- 🗂️ 归档页按年份分组
- 📑 文章页自动生成目录（TOC）+ 滚动高亮、上一篇 / 下一篇
- 💡 代码块带语言标签 + 一键复制，语法高亮采用反汇编器配色，随深浅色联动
- ⌨️ **键盘快捷键**：`/` 搜索、`t` 切换主题、`g h/p/a/b` 跳转、`?` 打开快捷键面板、`Esc` 关闭
- 📊 阅读进度条、回到顶部、预估阅读时长、图片点击放大
- 🔎 **SEO**：每页 canonical + Open Graph + Twitter Card，首页 `Blog`、关于页 `ProfilePage`、文章页 `BlogPosting` 结构化数据，`robots.txt` + `sitemap.xml`
- ♿ 跳转链接、`aria-*` 标注、`:focus-visible` 焦点环、`prefers-reduced-motion` 与打印样式
- 📡 RSS 订阅（`feed.xml`）
- 🚫 404 页（会回显访客请求的路径；在任意层级的错误路径下，导航链接都指向站点根目录）
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
     "excerpt": "一句话摘要，显示在列表里。",
     "featured": true
   }
   ```

   > `id` 必须和文件名（去掉 `.md`）一致。文章按 `date` 倒序排列。
   > `featured` 可选，标记后文章标题旁会出现「精选」荧光笔标记。

3. 重新生成 RSS 与站点地图（每次加 / 改文章后跑一次）：

   ```bash
   node tools/generate-feeds.mjs
   ```

4. 提交并推送即可上线，首页 / 列表 / 归档 / 标签 / 分类 / 统计会自动更新，**无需改动代码**。

## 首页控制流图

首页右侧那张图是手写的 ARM64 清单（`index.html` 里的四个 `<pre class="node">`），地址按真实指令长度排列：每条指令 4 字节，`ADRL` 是伪指令，占 8 字节。连线由页面底部的脚本按节点位置自动绘制，改动节点内容后不用管连线。

- 绿线：条件成立时的跳转；红线：条件不成立时顺序执行；蓝线：无条件流向
- 只有被跳转指向的块才有 `loc_` 标签，顺序执行进入的块没有
- 窄屏默认显示文本视图（带地址的线性清单）；放不下图形时也会自动退回文本视图

## 键盘快捷键

| 按键 | 作用 |
| --- | --- |
| `/` | 聚焦搜索框（不在文章列表页时会先跳过去） |
| `t` | 切换深色 / 浅色 |
| `g` `h` | 首页 |
| `g` `p` | 文章列表 |
| `g` `a` | 归档 |
| `g` `b` | 关于 |
| `?` | 打开快捷键面板 |
| `Esc` | 关闭面板 / 取消输入 |

## 本地预览

仓库根目录下起一个静态服务器即可（不能用 `file://` 直接打开，否则 `fetch` 会被浏览器拦截）：

```bash
python3 -m http.server 8000
# 然后访问 http://127.0.0.1:8000
```

## 目录结构

```
index.html        首页（简介 + 控制流图 + 最近文章 + 分类 / 标签）
blog.html         全部文章（搜索 + 标签 / 分类筛选）
archive.html      按年份归档
about.html        关于
post.html         文章阅读页（?id=<文章id>）
404.html          404（回显请求路径）
robots.txt        搜索引擎抓取规则
posts/
  index.json      文章元数据清单
  *.md            文章正文（Markdown）
assets/
  css/blog.css            青花主题（CSS 变量驱动深浅色）
  css/highlight-theme.css 代码高亮配色（反汇编器配色，随站点联动）
  js/blog.js              公共逻辑（导航/主题/列表/搜索/快捷键/SEO 元信息）
  js/post.js              文章页渲染 + 目录 + 结构化数据
  js/enhance.js           文章增强（代码窗口/复制/进度/回顶/目录跟随/图片放大）
  js/marked.min.js        Markdown 渲染库（本地内置）
  js/highlight.min.js     语法高亮库（本地内置）
  fonts/                  JetBrains Mono latin 子集（woff2，用于代码与首页汇编清单）
tools/
  generate-feeds.mjs      生成 feed.xml + sitemap.xml
feed.xml / sitemap.xml    RSS 订阅源 / 站点地图（由脚本生成）
static/img/               avatar.jpg（头像）、logo.png（社交分享图 360px）、favicon.svg / favicon.ico / apple-touch-icon.png（Logo）
```

> 改动 `assets/` 下的 CSS / JS 后，记得同步各 HTML 里的 `?v=` 版本号，让浏览器拿到新文件。

## 第三方资源

- [JetBrains Mono](https://www.jetbrains.com/lp/mono/) —— SIL Open Font License 1.1
- [marked](https://marked.js.org/) —— MIT
- [highlight.js](https://highlightjs.org/) —— BSD-3-Clause
