# Bangumi 原生超合金组件技术调研

调研日期：2026-09-05。统计口径中的“年份”指作品本身的首发日期年份：动画/三次元为首播或上映年份，书籍为出版年份，音乐为发行年份，游戏为发售年份；不使用用户收藏记录日期。

## 结论

该需求可以由 Bangumi 原生超合金组件完成，包括登录用户查看自己的私有收藏。最稳健的无额外授权方案是：组件在 `bgm.tv` 页面上下文中，同源请求五个条目类型、五种收藏状态的收藏列表 HTML，逐页解析 `#browserItemList > li.item`；作品年份优先从条目内的 `p.info` 开头日期位提取，日期缺失归入“年份未知”。登录用户访问自己的收藏列表时，服务端会把私有收藏直接渲染进 HTML。

不需要为每个条目请求 subject API。官方收藏 API 的每条记录已经内嵌 `SlimSubject.date`，但读取私有收藏需要属于该用户的 Bearer access token；原生组件不会自动得到这个 token。列表 DOM 已包含完成年度统计所需的作品日期，适合作为默认链路。[收藏 API 定义](https://github.com/bangumi/api/blob/65d29cff2331e08c0110d30d515f7f1b6488f845/open-api/v0.yaml#L1064-L1114) [SlimSubject.date 定义](https://github.com/bangumi/api/blob/65d29cff2331e08c0110d30d515f7f1b6488f845/open-api/v0.yaml#L3719-L3758)

## 1. 超合金组件格式、运行环境、权限与安装

### 格式

组件在 Bangumi 开发者平台创建，应用类型选择“组件”；每个版本由独立的“脚本”（JavaScript）和“样式”（CSS）字段组成。保存版本后，开发者可在个人设置中启用；提交审核后才可供全站用户使用。开发者本人可随时编辑并使用最新未审核版本。[官方发布与开发步骤](https://bgm.tv/group/topic/345157) [开发者平台组件说明](https://bgm.tv/dev/app/388)

JavaScript 可带 UserScript Metadata 头，官方明确支持 `@include`、`@exclude`、`@match` 控制作用域，且 `@exclude` 优先级最高。适合本组件的作用域为：

```javascript
// ==UserScript==
// @name         收藏作品年份统计
// @namespace    tv.bgm.collection-year-stats
// @grant        none
// @match        https://bgm.tv/user/*
// @match        https://bgm.tv/anime/list/*
// @match        https://bgm.tv/book/list/*
// @match        https://bgm.tv/music/list/*
// @match        https://bgm.tv/game/list/*
// @match        https://bgm.tv/real/list/*
// ==/UserScript==
```

来源：[如何限定组件作用域](https://bgm.tv/group/topic/345291)。Bangumi 当前加载器会解析 metadata，按当前 URL 判断 `include`、`match`、`exclude`，再通过 `eval` 在一个仅包裹 `CHII_APP_ID` 与 `chiiApp` 的函数中执行组件源码；CSS 以 `<link rel="stylesheet">` 注入。可直接复核当前站点脚本包中的 `chiiLib.widget.loader` 与 `userscriptParser`：[Bangumi 主站脚本包 r771](https://bgm.tv/min/g=js?r771)。

### 运行环境与权限边界

组件运行在 Bangumi 页面环境中，可以访问当前 DOM、站点提供的 jQuery `$`、`chiiLib` 以及组件专属 `chiiApp.cloud_settings`。它不是 Tampermonkey 的隔离沙箱；metadata 中的 `@grant none` 也不会生成 `GM_*` API。官方组件示例直接使用 `$` 修改页面，官方个性化接口同样以 `$`、`chiiLib` 为基础。[已发布组件源码字段示例](https://bgm.tv/dev/app/388/gadget/253) [组件个性化面板接口](https://bgm.tv/group/topic/435098)

组件可用 `chiiApp.cloud_settings` 读写自己的云端设置；不同组件默认隔离，设置随组件启用状态存在，停用组件后会删除，且设置会随页面载入，因此只应存小型配置，不应缓存完整收藏数据。[组件设置云端存储](https://bgm.tv/group/topic/435662)

这类页面内脚本拥有与页面同源脚本相同的能力：同源请求会携带当前 `bgm.tv` 登录会话，跨源请求则受浏览器同源策略、CORS 和目标站策略约束。组件平台对含第三方脚本或 API 的组件会显示安全风险提示；本组件无需把收藏数据发送到第三方。[超合金组件格纳库](https://bgm.tv/dev/garage)

### 安装方式

开发者流程：进入[我的应用](https://bgm.tv/dev/app)创建“组件”类型应用，添加版本并填写 JavaScript/CSS，保存后前往[个人设置 - 超合金组件](https://bgm.tv/settings/gadgets)手动启用。普通用户从[组件格纳库](https://bgm.tv/dev/garage)选择组件后，在个人设置中启用。组件版本需审核后才能公开供全站用户使用。[官方组件使用指南](https://bgm.tv/group/topic/345157)

## 2. 私有收藏的可获取性与证据链

### 结论

登录用户访问自己的收藏列表时，私有收藏会进入页面 HTML DOM，原生组件可以读取；访问他人列表或未登录访问时，私有收藏由服务端过滤。因此私有收藏默认应走 `bgm.tv/{type}/list/{username}/{status}` 的同源 HTML 链路。

### 实际页面证据

在已登录的 `kazv` 账户中打开[自己的动画“看过”页](https://bgm.tv/anime/list/kazv/collect)，页面首屏包含 24 个 `#browserItemList > li.item`，这些条目在 `p.collectInfo` 中显示“自己可见”；分页链接给出末页 `?page=13`。单条结构中：

```html
<li id="item_405785" class="item odd clearit">
  <div class="inner">
    <h3><a href="/subject/405785" class="l">…</a></h3>
    <p class="info tip">12话 / 2024年4月4日 / …</p>
    <p class="collectInfo">
      <span class="tip_j">2026-9-4</span>
      <span class="tip_i">/</span>
      <span class="tip">自己可见</span>
    </p>
  </div>
</li>
```

这里 `p.info` 内的 `2024年4月4日` 是作品首播日期；`p.collectInfo .tip_j` 内的 `2026-9-4` 是收藏侧日期，年度作品统计不得使用后者。页面来源：[动画收藏列表](https://bgm.tv/anime/list/kazv/collect)。

同一登录会话下还实测了书籍、游戏、三次元列表：私有条目同样出现在 `#browserItemList` 中并标注“自己可见”。五类页面共用相同的条目容器与分页结构：[书籍](https://bgm.tv/book/list/kazv/collect) [游戏](https://bgm.tv/game/list/kazv/collect) [三次元](https://bgm.tv/real/list/kazv/collect)。

### 官方服务端证据

官方 API 服务端在列收藏时先解析目标用户和当前鉴权用户，然后以 `showPrivate = u.ID == v.ID` 决定是否展示私有数据；查询层仅在 `showPrivate == false` 时追加 `private = 0` 条件。这证明“只有收藏所有者本人可读私有收藏”的判断适用于所有 `SubjectType`，不是动画页面特例。[owner 判定](https://github.com/bangumi/server/blob/60fdc32daf1d717f8446bad75fd2c3dc44805642/web/handler/user/list_subject_collections.go#L35-L68) [私有过滤查询](https://github.com/bangumi/server/blob/60fdc32daf1d717f8446bad75fd2c3dc44805642/internal/collections/infra/mysql_repo.go#L420-L476)

官方 OpenAPI 对 `/v0/users/{username}/collections` 明确写明“查看私有收藏需要 access token”，该接口使用可选 Bearer 鉴权。[OpenAPI 收藏接口](https://github.com/bangumi/api/blob/65d29cff2331e08c0110d30d515f7f1b6488f845/open-api/v0.yaml#L1064-L1114)。未带 Bearer Token 请求同一用户、同一动画“看过”条件时，实测只返回公开收藏；页面 HTML 则在登录会话中包含私有记录。

## 3. 五类条目的收藏状态、URL 与分页

官方统一状态枚举为 `1 Wish`、`2 Done`、`3 Doing`、`4 OnHold`、`5 Dropped`；不同条目类型只改变中文动词，状态数值与 URL slug 相同。[官方状态枚举](https://github.com/bangumi/api/blob/65d29cff2331e08c0110d30d515f7f1b6488f845/open-api/v0.yaml#L2309-L2338) [服务端状态常量](https://github.com/bangumi/server/blob/60fdc32daf1d717f8446bad75fd2c3dc44805642/internal/collections/domain/collection/type.go#L17-L30)

| 类型 | API `subject_type` | Wish `/wish` | Done `/collect` | Doing `/do` | `/on_hold` | `/dropped` |
|---|---:|---|---|---|---|---|
| `anime` | 2 | 想看 | 看过 | 在看 | 搁置 | 抛弃 |
| `book` | 1 | 想读 | 读过 | 在读 | 搁置 | 抛弃 |
| `music` | 3 | 想听 | 听过 | 在听 | 搁置 | 抛弃 |
| `game` | 4 | 想玩 | 玩过 | 在玩 | 搁置 | 抛弃 |
| `real` | 6 | 想看 | 看过 | 在看 | 搁置 | 抛弃 |

条目类型数值来自官方定义，且不存在类型 5：[SubjectType](https://github.com/bangumi/api/blob/65d29cff2331e08c0110d30d515f7f1b6488f845/open-api/v0.yaml#L3806-L3835)。各中文状态和 URL 可在 Bangumi 页头的“我看 / 我读 / 我听 / 我玩”菜单直接复核：[动画](https://bgm.tv/anime/list/kazv/collect) [书籍](https://bgm.tv/book/list/kazv/collect) [音乐](https://bgm.tv/music/list/sai/collect) [游戏](https://bgm.tv/game/list/kazv/collect) [三次元](https://bgm.tv/real/list/kazv/collect)。

统一 URL 模板：

```text
概览：https://bgm.tv/{anime|book|music|game|real}/list/{username}
状态：https://bgm.tv/{type}/list/{username}/{wish|collect|do|on_hold|dropped}
分页：https://bgm.tv/{type}/list/{username}/{status}?page={n}
```

HTML 列表实测每页最多 24 条；分页区 `.page_inner` 包含页码、下一页和末页链接，末页链接可直接得出最大页数。页面排序参数会和分页参数并存，抓取时应基于 pathname 生成自己的 `?page=n`，避免继承用户当前的 `orderby`。来源：[实际动画分页](https://bgm.tv/anime/list/kazv/collect?page=2)。

API 分页采用 `limit`/`offset`，OpenAPI 默认 `limit=30`、最大 50、`offset` 默认 0；响应返回 `data`、`total`、`limit`、`offset`。[API 分页参数](https://github.com/bangumi/api/blob/65d29cff2331e08c0110d30d515f7f1b6488f845/open-api/v0.yaml#L2016-L2036)

## 4. 作品日期 DOM、真实格式与缺失表现

### DOM 位置

五类收藏页在“列表”视图下均把作品元数据放在每个 `li.item` 内的 `p.info`。该字段是 `/` 分隔的人类可读文本，不存在专门的日期元素或 `data-date` 属性。`li` 的 `id="item_{subjectId}"` 和标题链接 `/subject/{subjectId}` 可稳定取得条目 ID。[动画列表](https://bgm.tv/anime/list/kazv/collect) [书籍列表](https://bgm.tv/book/list/kazv/collect) [游戏列表](https://bgm.tv/game/list/kazv/collect)

实际位置和格式如下：

| 类型 | 日期位置 | 已观察到的真实格式 | 示例来源 |
|---|---|---|---|
| `anime` | 通常在开头话数后的第二段 | `2024年4月4日`、`1999年1月31日` | [动画列表](https://bgm.tv/anime/list/kazv/collect) |
| `book` | 无话数时为第一段；有话数时为第二段 | `2002-02-01`、`2021-10-04`、`2015-07-04(2015年08月号)` | [书籍列表](https://bgm.tv/book/list/kazv/collect) |
| `music` | 第一段 | `2016-09-28`、`2002-12-19` | [公开音乐列表](https://bgm.tv/music/list/sai/collect) |
| `game` | 第一段 | `2009-09-18`、`2020年3月11日`、`2015年7月30日（Android 日本）`、`2004-04-28(PC)`、`2022-02-10(iOS / Android)` | [游戏列表](https://bgm.tv/game/list/kazv/collect) |
| `real` | 通常在开头话数后的第二段 | `2022-06-03`、`2021-04-29` | [三次元列表](https://bgm.tv/real/list/kazv/collect) |

年度统计只需要年份，因此无需完整解析月日。推荐仅在 `p.info` 开头匹配日期，允许前置话数：

```javascript
const YEAR_AT_INFO_START = /^(?:\d+\s*话\s*\/\s*)?((?:18|19|20|21)\d{2})(?=[-年]|\b)/;
```

该匹配覆盖已观察到的 ISO、中文年月日和日期后平台括注；它不会误取作者、平台、公司存续区间等后续字段中的年份。不要对整个 `p.info` 搜索任意四位数，因为游戏平台/开发商说明中可能还有其他年份，例如同一行先出现作品发售年，后面再出现运营主体变更年份。[游戏列表实例](https://bgm.tv/game/list/kazv/collect)

### 日期缺失

日期缺失时，Bangumi 不渲染空日期占位符，`p.info` 仍保留其他字段。例如：

- 动画条目 `619013`：`1话 / 赤坂アカ（集英社ヤングジャンプコミックス刊）`，话数后直接进入作者字段。[条目](https://bgm.tv/subject/619013)
- 书籍条目 `388782`：`1话 / 遠田おと / 20`，话数后直接进入作者和页数字段。[条目](https://bgm.tv/subject/388782)

官方 subject API 对这两个条目均返回 `date: null`：[619013](https://api.bgm.tv/v0/subjects/619013) [388782](https://api.bgm.tv/v0/subjects/388782)。因此额外请求 subject API 不能补回这些日期；正确统计方式是单列“年份未知”，不从标题、作者信息或其他文本猜测年份。

### 是否需要请求 subject API

默认不需要。收藏列表 DOM 已提供作品日期，且同源 HTML 链路能够覆盖自己的私有收藏。只取年份时，上述开头正则足够处理已观察到的格式。

如果组件已经通过独立、合规的 OAuth 流程持有用户 access token，可以改用一次分页收藏 API：`GET https://api.bgm.tv/v0/users/{username}/collections?subject_type={type}&type={status}&limit=50&offset={offset}`。每条收藏记录内嵌 `subject: SlimSubject`，其 `date` 已规范为可空的 `YYYY-MM-DD`，无需再对每个 subject 发请求。[UserSubjectCollection.subject](https://github.com/bangumi/api/blob/65d29cff2331e08c0110d30d515f7f1b6488f845/open-api/v0.yaml#L3982-L4041) [SlimSubject.date](https://github.com/bangumi/api/blob/65d29cff2331e08c0110d30d515f7f1b6488f845/open-api/v0.yaml#L3719-L3758)

## 5. CSP、跨域与鉴权限制

### CSP 与脚本加载

对 `https://bgm.tv/anime/list/kazv/collect` 的 2026-09-05 实测响应未包含 `Content-Security-Policy` 响应头，页面也没有 CSP `<meta http-equiv>`；页面当时实际加载了非同源脚本。这说明当前主站不会因 CSP 阻止组件的常规 DOM 操作或同源请求。不过实现不应依赖第三方脚本，避免未来策略变化和隐私外传。复核页面：[动画收藏列表](https://bgm.tv/anime/list/kazv/collect)。

### 跨域

官方 API 服务端 CORS 配置允许任意 Origin，并允许 `Origin`、`Content-Type`、`Accept`、`Authorization` 请求头，因而组件可从 `bgm.tv` 调用 `api.bgm.tv` 并携带 Bearer Authorization。[官方 CORS 配置](https://github.com/bangumi/server/blob/60fdc32daf1d717f8446bad75fd2c3dc44805642/web/new.go#L104-L109)

对其他第三方域名的请求仍取决于对方 CORS；超合金组件没有 `GM_xmlhttpRequest` 之类绕过同源策略的特权。统计私有收藏不应经过第三方服务。

### 鉴权

`api.bgm.tv/v0` 使用 `Authorization: Bearer {access_token}`。官方鉴权中间件只读取该 Header；未提供 Header 时按匿名用户继续处理，不会把 `bgm.tv` 网页登录 Cookie 自动解释成 API 用户身份。[鉴权中间件](https://github.com/bangumi/server/blob/60fdc32daf1d717f8446bad75fd2c3dc44805642/web/handler/common/access_token.go#L31-L60) [OAuth 说明](https://github.com/bangumi/api/blob/65d29cff2331e08c0110d30d515f7f1b6488f845/docs-raw/How-to-Auth.md#L39-L116)

OAuth 授权码流程需要应用 ID、回调地址和服务端保管的 client secret；纯前端组件不适合内置 client secret。默认方案应利用页面自身的同源登录会话读取收藏 HTML，从而既支持私有收藏，又无需用户另配 token。[OAuth 授权流程](https://github.com/bangumi/api/blob/65d29cff2331e08c0110d30d515f7f1b6488f845/docs-raw/How-to-Auth.md#L39-L116)

## 6. 推荐的数据抓取策略

1. **识别页面与用户。** 从 pathname 解析当前 `{type}`、`{username}`；用页面头部的当前用户链接或主站已渲染的 `CHOBITS_USERNAME` 与目标用户名比较。只有两者相同，界面才宣称统计含私有收藏。
2. **生成固定任务集。** 类型为 `anime/book/music/game/real`，状态为 `wish/collect/do/on_hold/dropped`，共 25 条列表路径。用户主页展示全类型总览；某一类别页可以优先展示该类型，同时后台抓取其余类型供切换。
3. **同源拉取 HTML。** 使用站内 jQuery `$.ajax({ url, dataType: 'html' })` 或浏览器原生同源请求。当前页直接解析 `document`；其余页解析到脱离当前页面的 `Document`，不要执行返回 HTML 中的脚本。
4. **确定分页。** 请求第一页，读取 `.page_inner a[href*="page="]` 中最大的 `page`；没有分页器即只有一页。按页抓取，限制并发为 2–4，失败时指数退避重试 2 次。
5. **解析记录。** 选择 `#browserItemList > li.item`；从 `li.id` 或 `/subject/{id}` 取 subject ID，从 `p.info` 开头正则取作品年份。用 `{subjectType, status, subjectId}` 去重。
6. **处理未知日期。** 未匹配到开头日期的条目计入“年份未知”，保留数量与可展开的条目链接；不扫描整行其他年份，不从标题猜测。
7. **聚合后渲染。** 聚合键为 `{subjectType, status, workYear}`。只在内存中保存本次解析结果；云设置只存图表偏好、默认类型等小型配置。[云设置容量与生命周期说明](https://bgm.tv/group/topic/435662)
8. **保护隐私。** 不把收藏标题、评论、标签或聚合结果发送到第三方；不在控制台打印完整私有条目。所有统计在浏览器本地完成。
9. **容错。** DOM 解析器将选择器集中定义并做结构断言；任一页解析到 0 条但页面状态计数非 0 时，显示“数据读取失败”而不是静默当作 0。API 可用于公开数据或已具备 Bearer Token 的环境，但不是私有收藏默认链路。

## 7. 可直接交给实现的字段约定

```text
subjectType: anime | book | music | game | real
status:      wish | collect | do | on_hold | dropped
subjectId:   number                         // li#item_{id}
workYear:    number | null                  // 来自 p.info 开头；null 表示年份未知
private:     boolean                        // p.collectInfo 出现“自己可见”时为 true
```

图表统计维度使用 `workYear`；`p.collectInfo .tip_j` 的日期以及 API 的 `updated_at` 均不参与作品年份统计。官方还特别说明 API `updated_at` 不代表收藏时间，且部分收藏信息修改不会更新该值。[updated_at 警告](https://github.com/bangumi/api/blob/65d29cff2331e08c0110d30d515f7f1b6488f845/open-api/v0.yaml#L4031-L4036)
