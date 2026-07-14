---
name: Never git checkout a divergent branch in the live workspace
description: Why switching the Replit workspace's actual working tree to an unrelated-history branch is dangerous, even though it looks recoverable.
---

Running `git checkout -B <branch> origin/<other-branch>` directly in the live Replit workspace (not a separate clone) to inspect or compare a remote branch with a completely different top-level file layout desyncs Replit's artifact/workflow registry. Files that are untracked on the new branch remain physically on disk (git checkout doesn't delete untracked files), so `ls artifacts/` still looks fine — but the platform's own artifact registry and `.replit` workflow config get treated as removed, and `listArtifacts()` returns empty even after checking back out to the original branch, because tracked config files (`.replit-artifact/artifact.toml` etc.) briefly reflected the other branch's (absent) definitions.

**Why:** the registry watches the working tree's tracked files, not just "does the directory exist" — a branch swap that temporarily removes/changes those tracked config files can desync the registry even after you switch back and the files are byte-identical again.

**How to apply:** never inspect or diff a remote/divergent branch by checking it out into the live workspace. Use `git fetch` + `git diff <local> origin/<branch>` (no checkout), or `git show <branch>:<path>` / `git ls-tree` to read specific files/paths without moving HEAD. If registry desync does happen anyway (artifacts vanish, workflows report "doesn't exist in config" after checkout+checkout-back), recovery is to re-touch one artifact's toml through `verifyAndReplaceArtifactToml` (write an identical temp copy and replace) — this one call re-registered all three artifacts and their workflows in one shot, not just the one it targeted.
