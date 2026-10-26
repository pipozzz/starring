# starring-cli changelog

## 0.2.0 — 2026-10-26

- `--co-authored`: also count commits where your email is in a `Co-authored-by:` trailer (pairing, mob sessions, GitHub co-authors and squash merges). Each commit still counts once, and the summary shows authored vs co-authored. Needs git 2.22+. Thanks [@3liAf](https://github.com/3liAf) (#92, #95).
- `-v, --version` prints the version.
- README: which email to pass for GitHub's noreply co-author trailers.

## 0.1.0 — 2026-10-20

- First release: `starring scan` counts your commits in local repos and writes `starring-activity.json` (dates and counts only) for the Starring editor.
