---
name: git-commiter
description: Create a Git commit when the user asks to commit changes, including "commit this", "commit the staged changes", or "commit and push".
---

# Commit Git changes

1. Proceed on a request to commit or a direct invocation to commit. Follow repository rules and the user's scope. Leave the index and history untouched for review, message-drafting, or Git questions.
2. Follow the [local commit procedure](references/local-commit.md). Before staging, verify the active worktree and branch. Pause if HEAD is detached, the scope is unclear, or the index contains unrelated changes.
3. If the user requests a push, use the [push procedure](references/push.md) to resolve the remote and branch before staging. Pause if the destination is unclear.
4. Stage only the requested changes. Stop on validation failures or suspected secrets. Commit with hooks enabled and verify the result. Push the verified commit only if requested. Tag, amend, or rewrite history only with separate explicit authorization.
5. Report the commit hash, subject, checks run, any remaining changes, and the push outcome if requested.
