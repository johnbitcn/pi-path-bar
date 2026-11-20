# Staged publishing to npm

This guide is for maintainers. It is not included in the npm package.

GitHub Actions only stages packages. A maintainer must review and approve each staged version with 2FA before it becomes public. Do not use direct publishing, npm tokens, or another workflow to bypass approval.

## One-time setup

1. Verify your npm account email and enable two-factor authentication (2FA).
2. In the npm package settings, configure a GitHub Actions Trusted Publisher:
   - Owner: `johnbitcn`
   - Repository: `pi-path-bar`
   - Workflow filename: `publish.yml`
   - Environment name: leave blank. This workflow does not use a GitHub Environment.
3. Allow staged publishing. Leave **Allow npm publish** unchecked. Leave **Allow npm dist-tag** unchecked unless separate dist-tag management is required.
4. Use GitHub-hosted runners and OIDC (`id-token: write`). Do not configure `NPM_TOKEN` or other publishing credentials in the workflow.

The workflow uses Node.js 24 and npm CLI 11.15.0. Staged publishing requires npm CLI 11.15.0 or newer.

Do not put passwords, tokens, recovery codes, or one-time codes in the repository, issue reports, or chat messages.

## Prepare a release

Pi displays new `CHANGELOG.md` entries on startup after an update. Follow the README's user-facing style: keep entries brief, in plain English, and limited to what users need to know. Put implementation details in `docs/`.

1. Review the working tree and the changes since the last published version. Propose an exact version, explain why it fits, and show the complete proposed `CHANGELOG.md` entry in the conversation. Wait for the maintainer to confirm both. Do not edit any release version files or `CHANGELOG.md` before that confirmation.
2. Check the public versions with `npm view pi-path-bar versions --json --registry=https://registry.npmjs.org/`. Also check **Staged Packages** on npm (or use `npm stage list pi-path-bar` from an authenticated maintainer terminal). A staged version reserves the same name/version pair as a published version. If pending status cannot be verified, ask the maintainer to check before staging or retrying.
3. Run `npm version <version> --no-git-tag-version` using the confirmed version. Add the confirmed `## [<version>]` entry at the top of `CHANGELOG.md`. Keep the manifest, lockfile, and changelog version in sync. Then run:

   ```sh
   npm ci
   npm run check
   npm test
   npm pack --dry-run
   ```

Stop if installation, type checking, tests, or package review fails. The package must contain only:

- `package.json`
- `src/*.ts`
- `assets/` (preview images)
- `CHANGELOG.md`
- `README.md` and `README.zh-CN.md`
- `LICENSE` and `THIRD_PARTY_NOTICES.md`

It must not contain dependencies, tests, workflows, Git metadata, personal configuration, tokens, or local session files. Host-provided peer packages must not be bundled. Keep all relevant license notices. Review packed sources and repository history for private data; editing the current README does not remove old commits.

## Commit, push, and stage

Only after authorization to commit, push, and start the release. Confirmation of the version and changelog does not grant this authorization.

1. Commit the reviewed changes and version update.
2. Push the commit to `main`.
3. Run `.github/workflows/publish.yml` for that commit:

   ```sh
   gh workflow run publish.yml --ref main
   gh run list --workflow publish.yml --limit 5
   gh run view <run-id> --log
   ```

4. Confirm that the run's commit SHA matches the reviewed commit. The workflow checks the version, runs `npm ci`, type checking, tests, and `npm pack --dry-run`, then runs `npm stage publish`.
5. Require a successful workflow run and a stage ID for the expected version. Record the commit SHA, version, workflow run URL, and stage ID. The staging output is also saved in the run summary.
6. Stop. Report **staged, waiting for manual approval**, not **published**.

The workflow is manually triggered and only runs on `main`. If the result or stage ID is missing, check the pending version on npm before retrying. A failed log retrieval is not evidence that staging failed.

## Manual review and approval

The maintainer reviews the pending package on the npm website and approves it with 2FA. The maintainer may instead run the following from their own authenticated terminal:

```sh
npm stage view <stage-id>
npm stage download <stage-id>
npm stage approve <stage-id>
```

Only the maintainer may approve or reject a staged package. If review finds a problem, reject the stage, fix the problem, and stage again. Never approve just to unblock automation.

## Verify after approval

Only after the maintainer approves, confirm the public package name and exact version. For a normal release targeting `latest`, confirm that tag points to the approved version:

```sh
npm view pi-path-bar@<version> name version dist.tarball --registry=https://registry.npmjs.org/
npm view pi-path-bar dist-tags.latest --registry=https://registry.npmjs.org/
```

Only then report **published**. Use an isolated Pi agent directory to test the npm package without loading another copy:

```sh
review_dir="$(mktemp -d)"
PI_CODING_AGENT_DIR="$review_dir" pi --no-session --no-extensions -e "npm:pi-path-bar@<version>"
```

In fullscreen mode, check `/path-bar`, paths and aliases, Git indicators, both clock formats and idle refresh, and light/dark themes. In Minimal mode, narrow and widen the terminal to check model name truncation and restoration. Enter reading mode and check that `Esc` restores the editor and draft. Tag the matching release commit only after confirming the public package.

Users update managed extensions with:

```sh
pi update --extensions
```

Version-pinned installations stay pinned until their package specification is changed.

## References

- [Staged publishing](https://docs.npmjs.com/staged-publishing)
- [npm stage CLI](https://docs.npmjs.com/cli/v11/commands/npm-stage)
- [Trusted publishing](https://docs.npmjs.com/trusted-publishers)
