# starring-cli

Count the commits **you** authored in local git repositories (client work, a company GitLab, private repos) and add them to your [Starring](https://starring.dev) profile.

```bash
npx starring-cli scan ~/work ~/clients -e me@agency.com -e me@client.com --check-public
```

[![npm](https://img.shields.io/npm/v/starring-cli)](https://www.npmjs.com/package/starring-cli) There are no dependencies, and it needs Node 20+ and `git`. Prefer to read the code first? It's three small files. You can also run it from a clone: `node cli/starring.mjs scan …`.

This writes `starring-activity.json`. To use it, open the editor, choose **Start from → Import YAML / JSON Resume / scan…** and drop the file in. Your profile gets:

- commits per year, marked as imported: all as private work, or — with `--check-public` — split into public and private repos,
- platforms such as "GitLab (self-hosted)" with repo and commit counts,
- a real heatmap: commits per day instead of a generated pattern.

## What leaves your machine

Nothing, unless you ask. The scan runs locally and makes no network requests — except with `--check-public`, which asks GitHub, GitLab.com and Codeberg one question per repo hosted there: *is this repo public?* Those hosts already know the repo's name, and nothing about your commits is sent. Repos on any other server are never contacted and count as private. The output file contains only **dates and counts**: no code, commit messages, repo names, paths or emails. Self-hosted servers are listed as kinds ("GitLab (self-hosted)") unless you pass `--reveal-hosts`. Open the file and check before importing.

## Options

| Option | |
| --- | --- |
| `-e, --email <addr>` | Your commit email. Repeat it for each address you've used. Default: `git config user.email` |
| `--check-public` | Count commits in public repos as public work. Asks GitHub, GitLab.com and Codeberg which repos are public (one request per repo). Unauthenticated GitHub allows 60 requests an hour; set `GITHUB_TOKEN` (any token, no scopes needed — with the GitHub CLI: `GITHUB_TOKEN=$(gh auth token) npx starring-cli scan … --check-public`) for 5,000 an hour. If a host runs out of requests, the scan stops without writing anything and tells you when to try again |
| `--co-authored` | Also count commits where your email appears in `Co-authored-by:` trailers (requires git 2.22+) |
| `--since <date>` | Only count commits after a date, e.g. `2015-01-01` |
| `--exclude <host>` | Skip repos hosted on this host, e.g. `github.com` when the GitHub importer already counts your public work |
| `--depth <n>` | How deep to look for repos (default 6). `node_modules`, `vendor`, build folders and hidden folders are skipped |
| `-o, --out <file>` | Output file (default `starring-activity.json`, `-` for stdout) |
| `--reveal-hosts` | Name self-hosted servers instead of anonymising them |
| `-q, --quiet` | Don't list repos while scanning |

> **Tip for GitHub users:** when someone adds you as a co-author on GitHub, or a squash merge credits a PR's other committers, the `Co-authored-by:` trailer usually holds your private noreply address (e.g. `12345+username@users.noreply.github.com`). Pass it with `-e` so those commits match:
> ```bash
> npx starring-cli scan ~/work -e me@company.com -e 12345+username@users.noreply.github.com --co-authored
> ```

Commits are counted across all branches, excluding merges. They're de-duplicated by hash, so forks and several clones of the same repo count once.

Without `--check-public` every scanned commit counts as private work, which is wrong for your public repos — and the GitHub importer may count those commits too. With it, public repos count as public, and the editor takes the larger of the scan's and GitHub's public numbers instead of adding them up.

Requires Node 20+ and `git` (2.22+ for `--co-authored`). No dependencies.
