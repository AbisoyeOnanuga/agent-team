# Approval contract

Owner: the person holding the phone. Backup: the same person at the desk.

A gate that nobody answers stays pending. Silence never proceeds.

Stop parks the task (`PARKED`) and releases file locks so the worker does not start it again. A failed step is marked `FAILED` for the same reason.

| Action | Routine default | Phone can change it |
| --- | --- | --- |
| read_repo | act and log | no |
| edit_locked_files | act and log | no, use the Watch preset to hold edits |
| format_lint | act and log | no, use the Watch preset |
| run_tests | act and notify | no, use the Watch preset |
| git_commit | approve before | yes, to act and notify |
| delete_files | approve before | yes, to act and notify |
| install_deps | approve before | yes, to act and notify |
| mark_done | approve before | no |
| git_push | never | no |
| edit_outside_lock | never | no |
| touch_env_or_secrets | never | no |

Presets:

- Watch: only reading the repo is automatic.
- Routine: the table above.
- Open: same as Routine, and commits run with a notice.

Each gate stores the action, why it was proposed, the blast radius (including a diff stat), and what happens if it is refused.

Push is not a Proceed button. It stays at the desk.
