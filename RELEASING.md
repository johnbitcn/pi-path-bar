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

Start by reviewing the working tree. Choose a new version according to the change. Update the manifest and lockfile without creating a commit or tag:

```sh
npm version minor --no-git-tag-version
npm view pi-path-bar versions --json --registry=https://registry.npmjs.org/
npm ci
npm run check
npm test
npm pack --dry-run
```

Use `patch`, `minor`, `major`, or an explicit version as appropriate. Confirm that the exact target version has not already been published. A staged version also occupies its name/version pair; inspect pending versions on npm before retrying a failed or interrupted staging run.

Stop if installation, type checking, tests, or package review fails. The package must contain only:

- `package.json`
- `src/*.ts`
- `README.md` and `README.zh-CN.md`
- `LICENSE` and `THIRD_PARTY_NOTICES.md`

It must not contain dependencies, tests, workflows, Git metadata, personal configuration, tokens, or local session files. Host-provided peer packages must not be bundled. Keep all relevant license notices. Review packed sources and repository history for private data; editing the current README does not remove old commits.

## Commit, push, and stage

Only after authorization to commit, push, and start the release:

1. Commit the reviewed changes and version update.
2. Push the commit to `main`.
3. Run `.github/workflows/publish.yml` for that commit:

   ```sh
   gh workflow run publish.yml --ref main
   gh run list --workflow publish.yml --limit 5
   gh run view <run-id> --log
   ```

4. Confirm that the run's commit SHA matches the reviewed commit. The workflow checks the version, runs `npm ci`, type checking, tests, and `npm pack --dry-run`, then runs `npm stage publish`.
5. Record the commit SHA, version, workflow run URL, and returned stage ID. The staging output is also saved in the run summary.
6. Stop. Report **staged, waiting for manual approval**, not **published**.

The workflow is manually triggered and only runs on `main`. Do not trigger it repeatedly for the same version if a previous run may already have staged the package. A failed log retrieval is not evidence that staging failed.

## Manual review and approval

The maintainer reviews the pending package on the npm website and approves it with 2FA. The maintainer may instead run the following from their own authenticated terminal:

```sh
npm stage view <stage-id>
npm stage download <stage-id>
npm stage approve <stage-id>
```

Agents and GitHub Actions must not execute approval. If review finds a problem, the maintainer rejects the stage, fixes the problem, and stages again. Never approve just to unblock automation.

## Verify after approval

Only after the maintainer approves, confirm the public package name and exact version:

```sh
npm view pi-path-bar@<version> name version dist.tarball --registry=https://registry.npmjs.org/
```

Only then report **published**. Test from a separate directory or an isolated Pi agent directory. Avoid loading both local/Git and npm copies:

```sh
pi -e npm:pi-path-bar@<version>
```

Check compact paths, aliases, Git indicators, both clock formats, idle clock refresh, `/path-bar`, and light/dark themes. Tag the matching release commit only after confirming the public package.

Users update managed extensions with:

```sh
pi update --extensions
```

Version-pinned installations stay pinned until their package specification is changed.

## References

- [Staged publishing](https://docs.npmjs.com/staged-publishing)
- [npm stage CLI](https://docs.npmjs.com/cli/v11/commands/npm-stage)
- [Trusted publishing](https://docs.npmjs.com/trusted-publishers)
