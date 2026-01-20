---
description: "gitmoji_tag"
---

Generate structured Git Tag/Release notes based on the provided version number and list of commits/changes.

## Format
```
<Version>: <Summary Title>

✨ New Features (Features)

- <Module/Scope Name>:
  - <Description> (<commit_hash>).
  - <Description> (<commit_hash>).

🐛 Bug Fixes (Bug Fixes)

- <Description> (<commit_hash>).

💥 Breaking Changes (BREAKING CHANGES)

- <Description> (<commit_hash>). <Impact Analysis>.
```

## Versioning Specifications

Follow the Semantic Versioning standard (`v<Major>.<Minor>.<Patch>`) for the version number:

1.  **Major (v**`X`**.0.0)**:
    - **Meaning**: Major release with incompatible API changes.
    - **Trigger**: Increment this digit when the release contains **💥 Breaking Changes**.

2.  **Minor (v1.**`X`**.0)**:
    - **Meaning**: New functionality added in a backward-compatible manner.
    - **Trigger**: Increment this digit when the release contains **✨ New Features** (but no breaking changes).

3.  **Patch (v1.0.**`X`**)**:
    - **Meaning**: Backward-compatible bug fixes or minor adjustments.
    - **Trigger**: Increment this digit when the release contains only **🐛 Bug Fixes** or maintenance tasks.

## Category Selection Rules

**✨ New Features (Features):**
- Commits starting with `feat`, `new`, `add`.
- Significant improvements or new capabilities.
- **Grouping Rule**: If multiple features belong to the same specific module (e.g., "Chat", "Auth", "UI"), group them under a sub-header.

**🐛 Bug Fixes (Bug Fixes):**
- Commits starting with `fix`, `bug`, `resolve`, `patch`.
- Corrections to existing behavior.

**💥 Breaking Changes (BREAKING CHANGES):**
- Commits labeled `BREAKING CHANGE` or involving removal of features/permissions.
- Major refactoring that requires user intervention.

## Writing Requirements

1.  **Header**: `<Version>` should be provided by the user. `<Summary Title>` should be a concise summary (under 60 chars) of the most important changes in this release.
2.  **Description**:
    - Start with a **past tense verb** (e.g., Implemented, Added, Fixed, Resolved, Removed).
    - Be clear and professional.
    - If a commit hash is provided in the input, append it at the end in parentheses, e.g., `(abc1234)`.
3.  **Grouping**: Heavily prefer grouping features by module to enhance readability.
4.  **Impact Note**: For breaking changes, explicitly state why it is breaking or what it affects.


## Action Instructions

Analyze the commit history from the **latest Git tag** to the **current HEAD** (equivalent to `git log $(git describe --tags --abbrev=0)..HEAD`) and perform the following actions:

1.  **Analyze & Categorize**:
    -   Read the commit messages and group them into "New Features", "Bug Fixes", or "Breaking Changes".
    -   Identify specific modules/scopes for grouping features.

2.  **Determine Version**:
    -   Identify the previous version number from the git tags.
    -   **Propose the next version number** strictly following the "Versioning Specifications" based on the analysis of the changes (e.g., if you see a breaking change, bump Major; if only features, bump Minor).

3.  **Generate Content**:
    -   Draft the release notes in English following the **Format** defined above.
    -   Ensure the `<Summary Title>` is catchy and summarizes the essence of this release.

4.  **Output**:
    -   Create or overwrite a file named `tag_commit_message.md` in the root directory with the generated content.