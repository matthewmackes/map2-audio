# MAP2 Repository History Rewrite Notice

Rewrite window: `{{rewrite_window}}`
Primary branch: `{{branch_name}}`

## Why this is happening

The MAP2 source repository is carrying tracked build/dependency artifacts that materially inflate clone size and CI checkout time. We are rewriting history to remove the known bloat scope:

`{{rewrite_scope}}`

## Remotes affected

- GitHub `origin`: `{{origin_url}}`
- GitLab `gitlab`: `{{gitlab_url}}`

## Operator notes

- During the rewrite window, freeze new pushes to `{{branch_name}}`
- The rewrite helper prepared for the window is: `{{rewrite_helper}}`
- Expect both remotes to receive force-pushed rewritten history

## Required collaborator action after the window

Preferred recovery path:

```bash
git clone {{origin_url}}
```

If a collaborator must keep an existing checkout, they need to hard-reset and prune with full awareness that local divergent history will be discarded:

```bash
git fetch origin
git checkout {{branch_name}}
git reset --hard origin/{{branch_name}}
git clean -fd
git remote prune origin
git gc --prune=now
```

## Resume condition

Do not resume normal pushes until the rewrite owner confirms:

- both remotes were force-pushed successfully
- fresh clone/checkout tests passed
- old history references can be discarded
