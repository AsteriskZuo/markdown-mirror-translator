# AGENTS.md

## Purpose

This file defines repository-level rules for agents. It is not a product spec, roadmap, task list, or design document.

Keep product design, architecture, feature scope, and task plans in `docs/` or task-specific planning documents.

## Priority

Follow instructions in this order:

1. User's explicit instructions.
2. This `AGENTS.md`.
3. Applicable Superpower skills.
4. Default agent behavior.

Higher-priority instructions override lower-priority instructions.

## Superpower

Use Superpower as the primary workflow for sustained project iteration.

At the start of work, check whether relevant `superpowers:*` skills are available in the current agent runtime. A local checkout of Superpower is not enough; the current agent must be able to invoke the skills.

<SUPERPOWER-UNAVAILABLE>
If Superpower is unavailable or cannot be confirmed:

- Warn the user before proceeding.
- Say whether Superpower appears missing, or present locally but unavailable to the runtime.
- Recommend installing, enabling, or registering Superpower.
- State which Superpower workflows cannot be invoked.
- Continue with the closest manual equivalent unless the user asks to stop.
</SUPERPOWER-UNAVAILABLE>

Use the relevant Superpower when available, especially for brainstorming, planning, executing plans, debugging, TDD, verification, code review, branch finishing, worktrees, subagents, and skill writing.

## Hard Rules

- Preserve user work. Do not overwrite, revert, or delete unrelated changes.
- Do not expand scope without explicit agreement.
- Do not mix unrelated changes.
- Keep changes small, intentional, and reviewable.
- Clarify requirements when ambiguity affects correctness.
- State assumptions when they affect decisions.
- Follow existing project structure, conventions, and tools.
- Do not add dependencies, tools, or abstractions without clear justification.

## Planning

Write a concrete plan before substantial implementation.

Substantial implementation includes changes that affect behavior, multiple modules, public interfaces, data formats, configuration, dependencies, migration, compatibility, rollback, or unresolved design tradeoffs.

A plan must state the goal, constraints, non-goals, affected files or modules, verification method, and open questions.

Small, obvious fixes may proceed without a formal plan.

## Execution

- Work in isolated, reviewable steps.
- Prefer incremental edits over broad rewrites.
- Keep implementation aligned with current design documents.
- Update documentation when behavior, usage, or decisions change.
- Stop and report conflicts with user work or project rules.

## Verification

Every completed change requires the narrowest useful verification: type checks, linting, tests, manual verification, or documentation review.

If verification cannot be completed, say exactly what was not verified and why.

## Known Verification Constraints

This VS Code extension uses `vscode-test` for `npm test`. Run `npm test` with escalated permissions directly for baseline or verification because it may need network access and VS Code/Electron runtime startup. Prefer the narrow persistent approval prefix `["npm", "test"]`.

## Documentation

- Keep long-term agent rules in `AGENTS.md`.
- Keep product and architecture design in `docs/`.
- Keep task-specific plans separate from permanent rules.
- Archive decisions only when they affect future development.
- Do not use `AGENTS.md` for temporary plans, debug logs, or task history.

## Completion

At the end of meaningful work, summarize what changed, why it changed, how it was verified, and what remains unresolved.

Do not present assumptions, skipped verification, or follow-up work as completed decisions.
