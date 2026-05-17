# Markdown Mirror Translator 基本设计

## 1. 产品定位

Markdown Mirror Translator 是一个 VS Code Markdown 源文档对照翻译插件。

它不做 Markdown 渲染预览，也不替代已有 Markdown 预览插件。插件只负责把当前打开的 Markdown 源文件翻译成可查看、可保存的 Markdown 源文本，并以双栏方式展示原文与译文。

用户如果需要预览翻译结果，可以将译文保存成独立 Markdown 文件，再使用 VS Code 内置 Markdown Preview、Markdown Preview Enhanced 或其他成熟预览插件查看。

## 2. 一期目标

一期只实现最小可用闭环：

- 翻译当前打开的 Markdown 文件。
- 左侧保留原始 Markdown 源文档。
- 右侧打开只读的翻译结果文档。
- 支持右侧显示纯译文或双语 Markdown。
- 支持一键保存翻译后的文档到原始文档目录。
- 使用传统翻译接口作为默认翻译能力。
- 通过 VS Code settings 配置源语言、目标语言、是否双语、翻译更新模式。

## 3. 一期不做

- 不做 Markdown 翻译预览。
- 不做 AI 翻译。
- 不做左右页面关联滚动。
- 不做选区翻译。
- 不做项目级批量翻译。
- 不做术语库。
- 不做自定义翻译 Provider 配置。
- 不做复杂的翻译历史管理。
- 不监听原始 Markdown 文档变更并自动同步翻译。
- 不允许直接编辑右侧翻译结果文档。

## 4. 使用方式

### 4.1 命令面板

用户通过 VS Code 命令面板执行：

```text
Markdown Mirror Translator: Translate Current File
```

执行后，插件读取当前活动编辑器中的 Markdown 文档，翻译全文，并在右侧打开一个只读翻译结果文档。

该命令既可以执行首次翻译，也可以刷新已有译文。

### 4.2 编辑器标题栏按钮

在 Markdown 文件编辑器标题栏右侧工具区提供同一个按钮入口：

```text
Markdown Mirror Translator: Translate Current File
```

该按钮触发同一个翻译命令。**该按钮既可以执行翻译，也可以刷新翻译**。

用户不需要选中文本，也不需要悬停触发。

## 5. 核心交互流程

1. 用户打开一个 `.md` 文件。
2. 用户触发 `Markdown Mirror Translator: Translate Current File`。
3. 插件检查当前文件是否为 Markdown。
4. 插件读取全文内容。
5. 插件保护不应翻译的 Markdown 结构。
6. 插件调用传统翻译接口翻译可翻译文本。
7. 插件在右侧打开一个只读翻译结果文档。
8. 用户可查看右侧译文，但不能直接编辑。
9. 用户执行保存操作时，插件将译文保存到原始文档所在目录。

如果翻译后用户继续修改左侧原始 Markdown 文档，一期不会自动同步更新右侧译文。用户需要通过原翻译命令或编辑器标题栏右侧工具区按钮手动触发刷新。

手动更新可以避免用户频繁编辑文档时反复调用翻译接口，也可以避免编辑过程中 Markdown 代码块、表格或其他语法暂时不完整时生成错误译文。

如果用户需要编辑译文，需要先将翻译结果保存为真实 Markdown 文件，再编辑保存后的文件。

## 6. 双栏显示设计

一期使用 VS Code 原生 editor split 实现双栏：

- 左侧：原始 Markdown 文件。
- 右侧：只读翻译结果文档。

右侧文档语言模式设置为 Markdown，便于用户搜索和阅读。

插件不渲染 HTML，不内置 Webview 预览，不处理 Markdown preview 相关逻辑。

右侧翻译结果在翻译中和翻译后都不可编辑。右侧内容由插件内部状态生成，用户需要编辑时，应先保存为真实 Markdown 文件。

## 7. 翻译结果模式

通过 setting 控制右侧内容形式。

### 7.1 纯译文模式

原文：

```markdown
# Hello

This is a document.
```

译文：

```markdown
# 你好

这是一个文档。
```

### 7.2 双语模式

原文：

```markdown
# Hello

This is a document.
```

译文：

```markdown
# Hello

# 你好

This is a document.

这是一个文档。
```

双语模式一期采用块级相邻输出，不追求复杂排版。

## 8. Settings 设计

一期只提供必要配置：

```json
{
  "markdownMirrorTranslator.sourceLanguage": "",
  "markdownMirrorTranslator.targetLanguage": "zh-CN",
  "markdownMirrorTranslator.bilingual": false,
  "markdownMirrorTranslator.translationUpdateMode": "manual"
}
```

### 8.1 `markdownMirrorTranslator.sourceLanguage`

原始语言。

- 默认值：空字符串
- 含义：源语言不限定，可以翻译任意源语言内容
- 用户也可以指定一种源语言，例如 `en`、`ja`、`zh-CN`

### 8.2 `markdownMirrorTranslator.targetLanguage`

目标语言。

- 默认值：`zh-CN`
- 示例：`en`、`ja`、`ko`、`fr`、`de`

### 8.3 `markdownMirrorTranslator.bilingual`

是否输出双语 Markdown。

- 默认值：`false`
- `false`：右侧只显示译文
- `true`：右侧显示原文和译文

### 8.4 `markdownMirrorTranslator.translationUpdateMode`

翻译结果更新模式。

- 默认值：`manual`
- 可选值：`manual`、`auto`
- `manual`：用户通过原翻译命令或编辑器标题栏右侧工具区按钮手动触发时，才更新右侧译文
- `auto`：后续预留，表示原始 Markdown 文档变更后自动更新右侧译文

一期只实现 `manual`。如果用户将该配置设置为 `auto`，一期仍按 `manual` 处理，不监听原始 Markdown 文档变更。`auto` 后续需要结合防抖、语法不完整状态、代码块保护、接口调用频率和失败回退再设计。

## 9. 保存设计

右侧翻译结果是插件管理的只读文档。用户不能直接编辑或直接使用 VS Code 原生保存能力保存该虚拟文档，应使用插件提供的一键保存。

保存入口使用独立命令：

```text
Markdown Mirror Translator: Save Translated File
```

该命令保存当前翻译结果。一期在命令面板提供该命令，并在右侧只读译文文档的编辑器标题栏工具区提供同一个保存入口；不同入口触发同一个保存命令。

默认保存到原始文档所在目录。

命名规则：

- 纯译文：`README.md` -> `README.zh-CN.md`
- 双语文档：`README.md` -> `README.bilingual.zh-CN.md`

如果目标文件已存在，一期建议提示用户确认覆盖，不自动覆盖。

## 10. Markdown 结构保护

一期需要尽量保护 Markdown 结构，降低翻译破坏文档的概率。

默认不翻译：

- fenced code block
- inline code，例如 `` `xxx` ``
- URL
- Markdown link URL
- image URL
- frontmatter 整体
- HTML block 和 inline HTML 整体
- pipe table 分隔行和列结构

可以翻译：

- 标题文本
- 段落文本
- 列表项文本
- 引用块文本
- 表格行文本
- Markdown link label
- image alt text

## 11. 错误提示

一期简化交互反馈，只使用 VS Code 自带提示消息：

- 翻译成功时显示成功提示。
- 翻译失败时显示失败提示。
- 翻译超时时显示超时提示。
- 当前文件不是 Markdown 时给出提示。
- 当前文件为空时给出提示。

## 12. 技术模块划分

建议一期按以下模块拆分：

- `extension.ts`：插件激活、命令注册、菜单入口注册。
- `commands/translateCurrentFile.ts`：当前文件翻译主流程。
- `commands/saveTranslatedFile.ts`：保存翻译结果。
- `config.ts`：读取 VS Code settings。
- `document/translatedDocumentProvider.ts`：提供只读翻译结果文档。
- `translationSession.ts`：维护一次翻译会话的状态。
- `cache/translationCache.ts`：维护基于 block hash 的翻译缓存。
- `markdown/parser.ts`：切分 Markdown，并标记可翻译与不可翻译片段。
- `markdown/renderer.ts`：根据翻译片段生成纯译文或双语 Markdown。
- `translation/scheduler.ts`：翻译任务调度、缓存命中、并发控制和超长文本拆分。
- `translation/providers/googleFreeTranslator.ts`：Google 免费翻译接口适配，一期默认 Provider。
- `translation/providers/googleCloudTranslator.ts`：官方 Google Cloud Translation API 适配，后续扩展。
- `translation/providers/deeplTranslator.ts`：DeepL API 适配，后续扩展。
- `translation/types.ts`：翻译 Provider 接口类型。

其中 `translation/types.ts` 预留 Provider 接口，方便后续增加 AI 翻译，但一期不暴露 AI 能力。

## 13. 技术规则

### 13.1 只读翻译结果文档

右侧翻译结果使用 VS Code `TextDocumentContentProvider` 实现为只读 virtual document。

翻译结果文档不是普通可编辑文件。它的内容由插件内部翻译会话状态渲染生成。

virtual document 的 URI 应使用 `.md` 后缀，并确保语言模式为 Markdown。

同一个源文件重复翻译时，应复用同一个右侧 virtual document，不重复打开多个翻译结果文档。

由于 `TextDocumentContentProvider` 刷新时通常会重新提供整份内容，翻译结果刷新需要节流。多个 block 翻译结果在短时间内返回时，应合并刷新，默认刷新间隔建议为 400ms。

### 13.2 Block Model

插件内部将 Markdown 文档按照规则切分为 block，并维护 block model：

```ts
type MarkdownBlock = {
  id: number;
  type: string;
  sourceText: string;
  hash: string;
  translatedText?: string;
  state: "pending" | "translating" | "translated" | "failed" | "skipped";
};
```

右侧内容由 block model 渲染生成。翻译完成某个 block 后，更新 block model，并刷新只读翻译结果文档。

### 13.3 锚点规则

不能使用行号作为翻译锚点。

Markdown 翻译过程以 block 序号或 block id 作为稳定锚点。这样可以避免译文长度变化、换行变化导致的行号漂移问题。

### 13.4 初始占位

执行翻译命令后，右侧翻译结果文档应立即打开。

翻译完成前，右侧先使用原始 Markdown 内容作为占位。某个 block 翻译完成后，再用译文替换对应 block 的展示内容。

### 13.5 文档大小策略

一期按文档规模采用不同翻译策略：

- 小文档：小于或等于 20,000 字符。右侧立即打开原文占位，后台一次性完成全文翻译，再更新右侧内容。
- 大文档：大于 20,000 字符，且小于或等于 200,000 字符。右侧立即打开原文占位，后台按照 block 分批翻译，并逐步更新右侧内容。
- 超大文档：大于 200,000 字符。仍然按照 block 分批翻译，但需要提示用户文档较大，翻译可能需要较长时间。

文档大小阈值一期作为内部常量，不暴露为 VS Code setting。

大文档后续可以进一步支持基于可见阅读区域的优先翻译策略，例如优先翻译当前可见区域及前后 3 到 5 屏内容。

### 13.6 并发控制

大文档翻译需要限制并发，避免大量占用网络资源。

一期建议将翻译并发控制在 2 到 4 个请求之间。

### 13.7 重复翻译行为

同一个原始文件再次执行翻译命令时，一期采用覆盖策略。

在 `manual` 更新模式下，重复翻译只由原翻译命令或编辑器标题栏右侧工具区按钮触发，不由原始 Markdown 文档的编辑事件触发。再次触发时按覆盖策略刷新现有译文。

插件不做原始文档 diff，不分析哪些行被修改，也不保留旧 translation session 的显示状态。

重复执行流程：

1. 重新读取当前 Markdown 文档全文。
2. 重新按照 Markdown 规则分 block。
3. 重新计算每个可翻译 block 的 hash。
4. 废弃旧 translation session。
5. 使用新的 block model 覆盖刷新右侧只读翻译结果文档。
6. 对 cache 命中的 block 直接使用缓存译文。
7. 对 cache 未命中的 block 加入翻译队列。

### 13.8 Block Hash 缓存

为减少重复请求 Google 翻译接口，一期需要实现基于 block hash 的翻译缓存。

block hash 用于判断某个可翻译 block 是否已经翻译过。只要 block 内容、语言配置和解析规则不变，再次翻译时可以直接复用缓存译文。

缓存 key 至少包含：

```text
provider + sourceLanguage + targetLanguage + parserVersion + blockHash
```

其中：

- `provider`：翻译服务标识，一期为 Google Translate。
- `sourceLanguage`：源语言配置。
- `targetLanguage`：目标语言配置。
- `parserVersion`：Markdown 分块和占位规则版本。
- `blockHash`：可翻译 block 的规范化内容 hash。

缓存策略：

- 当前 VS Code 会话内使用 memory map。
- 跨重启缓存使用 VS Code `globalState` 或插件 `globalStorageUri`。
- TTL 建议为 30 天。
- 最大缓存条目建议为 5,000 到 10,000。
- 超出限制后按 LRU 或最旧访问时间清理。

缓存不需要暴露为 setting。一期作为内部优化实现。

### 13.9 Translator Provider 适配层

一期需要实现翻译 Provider 适配层，避免业务逻辑直接依赖某一个具体翻译接口。

建议接口形态：

```ts
type TranslateInput = {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
};

type TranslateResult = {
  text: string;
};

interface TranslatorProvider {
  id: string;
  maxTextLength: number;
  translate(input: TranslateInput): Promise<TranslateResult>;
}
```

Provider 只负责调用具体翻译服务并解析响应，不负责 Markdown block 拆分、不负责缓存、不负责并发调度。

超大 block 或超长文本的拆分逻辑放在翻译调度层，例如 `translation/scheduler.ts`。调度层根据当前 Provider 暴露的 `maxTextLength` 决定是否拆分文本。

这样后续如果某个 Provider 支持更长文本，只需要调整或新增 Provider 能力声明，不需要修改 Markdown parser 或 Provider 调用逻辑。

一期只启用一个默认 Provider：

```text
google-free
```

该 Provider 使用 Google Translate 的非官方免费接口，不需要用户配置 API Key。

后续可以在不改动 Markdown 分块、缓存和渲染逻辑的情况下增加：

- `google-cloud`：官方 Google Cloud Translation API，需要 API Key 或 OAuth。
- `openai`：AI 翻译 Provider。
- `deepl`：DeepL 翻译 Provider。
- `azure`：Azure Translator Provider。

一期不暴露 provider setting，不提供 Provider 切换 UI。Provider 适配层只作为内部架构设计。

后续如果开放 Provider 设置，可以扩展为：

```json
{
  "markdownMirrorTranslator.provider": "google-free"
}
```

### 13.10 Google 免费翻译接口

一期默认使用 Google Translate 的非官方免费接口，不使用官方 Google Cloud Translation API。

接口形式参考：

```text
https://translate.googleapis.com/translate_a/single
```

常用参数：

```text
client=gtx
sl=<sourceLanguage>
tl=<targetLanguage>
dt=t
q=<text>
```

参考插件 `harryplusplus/bilingual-markdown-preview` 也是直接调用该免费接口，没有使用官方 Google Cloud Translation API，也没有依赖第三方 Google 翻译 npm 库。

该接口与官方 Google Cloud Translation API 不兼容。官方接口需要 API Key 或 OAuth，路径、认证方式、请求体和返回结构都不同。因此必须通过 Translator Provider 适配层隔离差异。

### 13.11 失败处理

翻译失败不做复杂确认，不做局部重试 UI。

失败策略：

- 单个 block 翻译失败时，右侧保留该 block 的原始内容。
- 整体完成后，如果存在失败 block，通过 VS Code 提示消息告诉用户部分内容翻译失败。
- 用户可以自行再次执行翻译命令重试。
- 再次执行时仍然使用覆盖策略，并优先复用 cache 命中的 block。

## 14. 后续路线

二期或后续版本可以考虑：

- 左右滚动同步。
- 批量翻译文件夹。
- 术语表。
- AI 翻译 Provider。
- 自带 key 或付费服务。
- 翻译质量对比。
- 增量翻译。
- 自动更新翻译。
- 基于可见区域的翻译任务优先队列。

## 15. 一期成功标准

一期完成后，用户应该能做到：

1. 打开任意 Markdown 文件。
2. 执行一次命令。
3. 右侧立即打开只读翻译结果文档。
4. Markdown 主要结构没有被破坏。
5. 一键保存为独立 `.md` 文件。
6. 使用现有 Markdown 预览插件预览保存后的译文。
