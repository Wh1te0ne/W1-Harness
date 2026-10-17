---
kind: upgrade-guide
description: W1 workspace storage version 3 prevents older single-directory readers from pruning project membership.
---
# W1 project folders

English | [中文](guide.zh.md)

## Change

W1 projects can link multiple source folders and choose a primary folder. Their IDs and Session ownership stay stable when folders change. The workspace storage unit moves from version 2 to version 3. Older W1 builds reject this version; Session logs keep their existing format. Original DSH data is unaffected.

## Migration

1. Quit W1 from its application menu. Start the development app through [Start-W1.ps1](../../../../scripts/w1/Start-W1.ps1).
2. The launcher backs up %USERPROFILE%/.w1-harness/storages/workspace.json under %USERPROFILE%/.w1-harness-backups/projects-v3-<timestamp>/workspace-v2.json, then assigns the previous directory as each project's primary folder. Project and Session IDs, ordering and pin/archive state are retained.
3. Open Edit project from a project row menu. Confirm the old directory is primary and previous Sessions remain visible. Repeated launches leave migrated data unchanged.
4. To return to an older W1 build, quit W1, save the current workspace.json separately, and restore the v2 backup to that exact W1 file. This restores project metadata to the backup time; later project edits are not retained. Do not restore or overwrite Session logs, credentials or original DSH files.
