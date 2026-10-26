# starring-cli

Count the commits **you** authored in local git repositories (client work, a company GitLab, private repos) and add them to your [Starring](https://starring.dev) profile.

```bash
npx starring-cli scan ~/work ~/clients -e me@agency.com -e me@client.com --exclude github.com
```

[![npm](https://img.shields.io/npm/v/starring-cli)](https://www.npmjs.com/package/starring-cli) There are no dependencies, and it needs Node 20+ and `git`. Prefer to read the code first? It's two small files. You can also run it from a clone: `node cli/starring.mjs scan …`.

This writes `starring-activity.json`. To use it, open the editor, choose **Start from → Import YAML / JSON Resume / scan…** and drop the file in. Your profile gets:

- private commits per year, marked as imported,
- platforms such as "GitLab (self-hosted)" with repo and commit counts,
- a real heatmap: commits per day instead of a generated pattern.

## What leaves your machine

Nothing. The scan runs locally and makes no network requests. The output file contains only **dates and counts**: no code, commit messages, repo names, paths or emails. Self-hosted servers are listed as kinds ("GitLab (self-hosted)") unless you pass `--reveal-hosts`. Open the file and check before importing.

## Options

| Option | |
| --- | --- |
| `-e, --email <addr>` | Your commit email. Repeat it for each address you've used. Default: `git config user.email` |
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

Requires Node 20+ and `git` (2.22+ for `--co-authored`). No dependencies.
