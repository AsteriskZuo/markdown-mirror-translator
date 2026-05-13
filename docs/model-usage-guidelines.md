# Model Usage Guidelines

This project is a VS Code extension for translating Markdown documents and showing the original and translated content in a side-by-side view.

Use this document to decide when to spend on stronger reasoning models during development, and when to switch to more cost-effective models for routine work.

## Recommended Split

Use GPT-5.5 high for early design, architecture, and complex multi-file implementation work.

Use GPT-5.4 high for smaller, well-scoped follow-up tasks after the main architecture is stable.

The practical rule is simple: if the task requires deciding the shape of the system, coordinating several modules, or preserving long-term maintainability, use GPT-5.5 high. If the task is already clearly defined and localized, use GPT-5.4 high.

## Use GPT-5.5 High For

- Designing the extension architecture and module boundaries.
- Choosing the core translation flow from Markdown input to translated output.
- Designing the side-by-side Webview experience and its state synchronization model.
- Defining translation provider abstractions, configuration shape, and error handling.
- Planning Markdown parsing, segmentation, caching, incremental translation, and retry behavior.
- Implementing the first end-to-end version across extension commands, services, Webview, and tests.
- Debugging failures that span multiple modules or require several rounds of investigation.
- Refactoring core abstractions when the current structure blocks future features.

GPT-5.5 high is most useful when the work depends on reasoning quality, tool use, and keeping a consistent plan across many files.

## Use GPT-5.4 High For

- Fixing a specific command registration bug.
- Adjusting Webview layout, styling, or copy.
- Adding or renaming a configuration option.
- Improving a single Markdown parsing or segmentation function.
- Adding focused unit tests for an existing behavior.
- Updating README, changelog, marketplace text, or examples.
- Addressing TypeScript, lint, or packaging issues with clear error messages.
- Making small behavior changes after the architecture is already known.

GPT-5.4 high is the better default once the task can be described in one or two concrete sentences and the expected files are obvious.

## Project-Specific Guidance

For this extension, the expensive reasoning budget is best spent on these decisions:

- How Markdown is parsed and split into translation units.
- How translated segments map back to the source document.
- How the Webview keeps the original and translated panes aligned.
- How translation providers are isolated from VS Code-specific code.
- How failures, cancellation, rate limits, and partial results are represented.
- How state is cached so repeated translation does not waste API calls.
- How tests verify behavior without depending on real translation providers.

After these decisions are documented and implemented, most daily work should use GPT-5.4 high unless the task crosses several of these boundaries.

## Escalation Rule

Start with GPT-5.4 high for maintenance work. Switch back to GPT-5.5 high when any of the following happens:

- The fix affects several modules and the correct boundary is unclear.
- The model needs to inspect and modify many files in one pass.
- A bug survives one or two focused repair attempts.
- The change affects translation correctness, caching, or Webview synchronization.
- The task requires redesigning an abstraction rather than editing an implementation detail.

This keeps cost under control while still using stronger reasoning where it changes the outcome.
