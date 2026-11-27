# Local commit procedure

Run Git through the runner's shell tool and honor any repository-required command wrapper.

1. Identify the checkout from the session directory with `git rev-parse --show-toplevel`. Run all subsequent Git commands in that worktree. Check the branch with `git symbolic-ref --quiet --short HEAD`. If HEAD is detached, leave the checkout unchanged and ask which branch to use before staging. Leave merge, rebase, or cherry-pick resolution to an explicit request.
2. Inspect `git status --short`, `git diff`, `git diff --cached`, and recent subjects with `git log -8 --format=%s` when history exists. Read relevant untracked files. Report an empty working tree and index when there is nothing to commit. If the intended scope is unclear or unrelated staged changes would enter the commit, ask before changing the index.
3. Stage whole files with explicit paths, such as `git add -- path/to/file`. For mixed files, stage only the requested hunks with patch staging or a reviewed patch applied to the index. Preserve unrelated changes in the working tree and index.
4. Review the full staged diff, run `git diff --cached --check`, and run applicable repository checks. Stop if validation fails or the staged diff appears to contain secrets.
5. Use the user's message if supplied. Otherwise, follow the repository's commit style. If no clear convention exists, use a short imperative subject such as `Add worktree checks before committing`. Add a body only when it explains why the change was made or records a consequence the subject cannot capture.
6. Run `git commit` with configured hooks enabled. If a hook blocks it, report the output and address the cause only within the authorized scope.
7. Verify the result with `git log -1 --format="%H %s"` and `git status --short` in the same worktree.
