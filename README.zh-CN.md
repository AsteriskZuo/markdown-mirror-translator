# Markdown Mirror Translator

Markdown Mirror Translator 是一个 VS Code Markdown 源文档翻译插件。它会把当前 Markdown 文件翻译成可查看、可保存的 Markdown 源文本，并把原文和译文以 VS Code 原生分栏方式并排展示。

它不是 Markdown 预览渲染器，也不替代 VS Code 内置 Markdown Preview 或其他 Markdown 预览插件。它只负责翻译 Markdown 源文本、尽量保护 Markdown 结构、在右侧显示只读译文，并将译文保存成独立 `.md` 文件。

[English README](./README.md)

## 功能

- 通过命令面板或编辑器标题栏按钮翻译当前 Markdown 文件。
- 左侧保留原始 Markdown 文件，右侧打开只读译文 Markdown 文档。
- 支持纯译文 Markdown 和双语 Markdown 两种输出模式。
- 尽量保护 fenced code block、inline code、URL、frontmatter、HTML block 等 Markdown 结构。
- 可翻译标题、段落、列表项、引用块、表格行、链接文字和图片 alt 文本等内容。
- 默认使用 `google-free` 翻译 Provider，不需要 API Key。
- 基于 block hash 缓存译文，减少重复请求。
- 将译文保存为源文件同目录下的真实 Markdown 文件。
- 覆盖已有译文文件前会提示确认。

## 不做什么

- 不做 Markdown HTML 预览渲染。
- 不提供 webview 预览。
- 不提供 AI 翻译。
- 不做原文与译文编辑器滚动同步。
- 不做选区翻译。
- 不做文件夹或项目批量翻译。
- 不提供术语库。
- 不提供 Provider 切换 UI。
- 不监听源文档变更并自动重新翻译。
- 不允许直接编辑右侧只读虚拟译文文档。

## 命令

### `Markdown Mirror Translator: Translate Current File`

翻译当前活动的 Markdown 文档。

译文会在源文件旁边以只读虚拟 Markdown 文档打开。对同一个源文件再次执行该命令时，会刷新已有译文视图，不会重复打开多个译文编辑器。

### `Markdown Mirror Translator: Save Translated File`

将当前译文保存到源文件所在目录。

该命令可以从命令面板触发，也可以从右侧只读译文文档的编辑器标题栏触发。

## 设置

插件提供以下 VS Code settings：

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| `markdownMirrorTranslator.sourceLanguage` | `""` | 源语言代码。留空表示不限定源语言，由 Provider 接受任意源语言。 |
| `markdownMirrorTranslator.targetLanguage` | `"zh-CN"` | 目标语言代码。 |
| `markdownMirrorTranslator.bilingual` | `false` | `false` 显示纯译文 Markdown；`true` 显示原文和译文相邻排列的双语 Markdown。 |
| `markdownMirrorTranslator.translationUpdateMode` | `"manual"` | 翻译更新模式。目前实现 `manual`；`auto` 为预留值，当前仍按手动模式处理。 |

示例：

```json
{
  "markdownMirrorTranslator.sourceLanguage": "",
  "markdownMirrorTranslator.targetLanguage": "zh-CN",
  "markdownMirrorTranslator.bilingual": false,
  "markdownMirrorTranslator.translationUpdateMode": "manual"
}
```

## 使用方式

1. 在 VS Code 中打开一个 `.md` 文件。
2. 执行 `Markdown Mirror Translator: Translate Current File`。
3. 原始 Markdown 文件保留在左侧，右侧打开只读译文 Markdown 文档。
4. 查看右侧译文源文本。
5. 需要编辑或使用其他 Markdown 预览工具查看译文时，执行 `Markdown Mirror Translator: Save Translated File` 保存为真实文件。

如果翻译后继续修改源 Markdown 文件，需要手动再次执行 `Translate Current File`。插件不会在你输入时自动重新翻译。

## 输出模式

### 纯译文 Markdown

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

### 双语 Markdown

原文：

```markdown
# Hello

This is a document.
```

双语输出：

```markdown
# Hello

# 你好

This is a document.

这是一个文档。
```

双语模式采用块级相邻输出，不追求复杂排版，也不生成渲染预览布局。

## 保存译文文件

翻译结果最初保存在插件管理的只读虚拟文档中。用户如果需要编辑译文，或使用其他 Markdown 预览插件查看译文，应先保存成真实文件。

默认命名规则：

| 源文件 | 模式 | 保存文件 |
| --- | --- | --- |
| `README.md` | 纯译文 | `README.zh-CN.md` |
| `README.md` | 双语 | `README.bilingual.zh-CN.md` |

如果目标文件已经存在，插件会先提示确认，不会静默覆盖。

## Markdown 结构保护

插件会尽量避免翻译过程破坏 Markdown 语法。

默认保护：

- Fenced code block
- Inline code
- URL
- Markdown link URL
- Image URL
- Frontmatter block
- HTML block 和 inline HTML

尽量翻译：

- 标题文本
- 段落文本
- 列表项文本
- 引用块文本
- 表格行文本
- Markdown link label
- 图片 alt text

## 翻译 Provider

MVP 默认使用内部 `google-free` Provider。该 Provider 调用非官方 Google Translate endpoint，不需要 API Key。

Provider 被隔离在内部接口之后。后续可以增加其他 Provider，而不需要改动 Markdown parser、renderer、cache 或 scheduler。

## 错误处理

- 单个 block 翻译失败时，译文文档中保留该 block 的原文。
- 如果部分 block 翻译失败，翻译结束后会显示部分失败提示。
- 用户可以再次执行 `Translate Current File` 重试。
- 已成功翻译并命中缓存的 block 可在后续运行中复用。

## 相关工具

以下链接作为 Markdown 翻译与预览生态中的相关工具列出：

- [Bilingual Markdown Preview](https://marketplace.visualstudio.com/items?itemName=harryplusplus.bilingual-markdown-preview)
- [Markdown Preview Enhanced](https://marketplace.visualstudio.com/items?itemName=shd101wyy.markdown-preview-enhanced)
- [Immersive Translate](https://immersivetranslate.com/en/)

## 参与贡献

本文档是面向使用者的说明文档。开发环境配置、本地调试、测试和贡献流程请见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## License

MIT。
