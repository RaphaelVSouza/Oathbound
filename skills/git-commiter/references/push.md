# Push procedure

Use this procedure only when the user requests a push.

1. Before staging, resolve a single remote and destination branch. Use the user's explicit destination where provided. For anything unspecified, inspect the branch's configured push destination, including any push remote or refspec that takes precedence over the upstream. If a remote or branch is missing or ambiguous, ask before staging. A missing upstream can be resolved by an explicit destination or an unambiguous push configuration.
2. After verifying the commit, push that commit to the resolved branch with an explicit refspec, such as `git push <remote> <verified-commit>:refs/heads/<branch>`. Follow repository push rules and report a rejection with the local commit hash.
