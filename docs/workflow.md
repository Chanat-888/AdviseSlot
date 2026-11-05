# How we work (git, GitHub, review)

Team workflow for AdviseSlot. Both of us (and our AI agents) follow it.
Source: course spec `group_work_specs_v1.pdf` section 5.3 plus our own choices.

## Team

| Name | GitHub |
|---|---|
| Chanat Dachkhumhang (Pan) | @Chanat-888 |
| Jeerasak Phisawong (Snooker) | @ShitheadQuin |

Both take part in specs, tests, code, review and deployment. No fixed roles.
Each of us reviews and merges the other's PRs.

## Branches

```
main              releases only
 └─ sprint-N      integration branch for sprint N (now sprint-1)
     ├─ docs/<topic>
     ├─ feat/<topic>
     ├─ fix/<topic>
     └─ chore/<topic>
```

- Cut every work branch from the current `sprint-N`.
- Each work branch goes into `sprint-N` through a PR reviewed by the teammate.
- One release PR `sprint-N` → `main` at the end of the sprint.
- Never commit directly to `main` or `sprint-N`. A one-line doc fix still gets
  a branch and a PR. `sprint-1` is protected and needs 1 approval.
- Stacked PR (base = another work branch) is OK. Say so in the description and
  retarget it to `sprint-N` once its parent merges.
- Before merge, update the branch from `sprint-N` (merge, no force-push on a
  shared branch) and make sure tests/CI pass.

## Spec before code

Contracts (SRS/SDS sections, API/UI contract, planned tests) are committed and
reviewed before the implementation PR for that feature. The commit history must
show this order. New team decisions go in `docs/decisions.md` as the next `D-xx`.

## Issues and the project board

Every piece of work has a GitHub Issue, assigned to whoever does it (both people
for pair work). Board: "AdviseSlot Sprints". Move the Issue's card when its state
changes:

| Trigger | Card |
|---|---|
| Issue created | Backlog |
| Requirements read and understood | Specified |
| Branch created, work begins | Started |
| PR opened and linked to the Issue | PR Review |
| Changes requested / tests fail | Fixing |
| Fixes pushed and threads answered | PR Review |
| Reviewer merged (then close the Issue by hand) | Done |

**Linking a PR to its Issue:** `Closes #N` does NOT link when the PR's base is
`sprint-N` (not the default branch). Link it from the PR sidebar
(Development → gear → pick the Issue), or with `link_pr` below. Still write
`Closes #N` in the body for readers. Merging into `sprint-N` does not close the
Issue, so close it by hand.

## Opening a PR

1. Push the branch, open the PR with base `sprint-N`, reviewer = teammate,
   assignee = you.
2. Description: what changed, why, how to test, `Closes #N`, and any D-xx/FR-xx
   it touches.
3. Link the Issue (Development panel or `link_pr`) and check the PR sidebar shows it.
4. Move the card to PR Review.

## Review and merge

- **The reviewer merges, never the author.** Snooker merges Pan's PRs; Pan
  merges Snooker's PRs. Merging is part of the reviewer's integration evidence.
- Reviewer: run the branch (README steps, tests), then leave specific comments.
  Approve only what you ran and read.
- Author: reply to every comment (what changed, or why not), push fixes to the
  same branch (the PR updates itself), resolve a thread only after replying and
  fixing.

## Commits

- Plain English, prefix `docs:`, `feat:`, `fix:`, `chore:`, `test:`.
- Cite decision or requirement IDs where relevant, e.g. `docs: record D-25 (Postgres in Docker)`.
- No real secrets in commits. Config goes in `.env.example`.

## AI agents

AI agents may draft code, docs and reviews; the person who commits is
responsible for its correctness. Agents do not merge PRs and do not post to
GitHub (PRs, reviews, comments) without the person reading the text first.

## Command-line helpers (optional)

`gh` equivalents of the Development panel link and the board move:

```bash
link_pr() { gh api graphql -f query='mutation($is:ID!,$pr:[ID!]!){addCloseIssueReferences(input:{issueId:$is,pullRequestIds:$pr}){clientMutationId}}' -f is="$(gh issue view $2 --json id --jq .id)" -f 'pr[]='"$(gh pr view $1 --json id --jq .id)"; }
pr_linked() { gh api graphql -f query='query($n:Int!){repository(owner:"Chanat-888",name:"AdviseSlot"){pullRequest(number:$n){timelineItems(itemTypes:[CONNECTED_EVENT],first:10){nodes{... on ConnectedEvent{subject{... on Issue{number}}}}}}}}' -F n=$1 --jq '[.data.repository.pullRequest.timelineItems.nodes[].subject.number]|tostring'; }
move_card() {
  local item opt
  item=$(gh project item-list 2 --owner Chanat-888 --limit 100 --format json --jq ".items[]|select(.content.number==$1)|.id")
  case "$2" in Backlog) opt=b80ad70d;; Specified) opt=04181445;; Started) opt=87b0660f;;
    "PR Review") opt=ec7b1464;; Fixing) opt=2c348a7e;; Done) opt=477ecd02;; esac
  gh project item-edit --id "$item" --project-id PVT_kwHOCwvtGc4BpJr1 --field-id PVTSSF_lAHOCwvtGc4BpJr1zhnmk7A --single-select-option-id "$opt"
}
```

Usage: `link_pr <pr#> <issue#>`, `pr_linked <pr#>` (prints `[]` if not linked),
`move_card <issue#> "PR Review"`.
