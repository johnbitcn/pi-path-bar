# Publishing to npm

This guide is for maintainers. It is not included in the npm package.

## One-time setup

1. Verify your npm account email.
2. Enable two-factor authentication (2FA) on your npm account.
3. Use the latest supported npm CLI.
4. Log in from your own terminal:

```sh
npm login --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/
```

Do not put passwords, tokens, recovery codes, or one-time codes in this repository, issue reports, or chat messages. Follow npm's interactive authentication prompts. For future automated releases, use npm trusted publishing instead of storing a long-lived token in CI.

## First release: 0.1.0

Run these commands from the repository root:

```sh
git status --short
npm ci --ignore-scripts
npm run check
npm test
npm view pi-path-bar name version --registry=https://registry.npmjs.org/
npm pack --dry-run
```

An npm `E404` response means no public package was found at that name. It is not a guarantee that npm will allow the name. If the name is unavailable, choose a scoped name you own and update the manifest, lockfile, docs, and install examples before publishing.

Review the pack file list. It should contain only:

- `package.json`
- `src/*.ts`
- `README.md` and `README.zh-CN.md`
- `LICENSE` and `THIRD_PARTY_NOTICES.md`

It must not contain `node_modules`, tests, Git metadata, personal configuration, tokens, or local session files. The extension is shipped as TypeScript source; Pi loads the entry from the `pi.extensions` manifest. Host-provided peer packages must not be bundled.

Commit and push the reviewed release changes before publishing. Ensure that the working tree is clean and that version `0.1.0` has not already been published:

```sh
npm view pi-path-bar@0.1.0 version --registry=https://registry.npmjs.org/
```

If that version exists, do not publish it again. Choose a new version instead.

Optional final dry run (runs the `prepublishOnly` checks, but does not upload the package):

```sh
npm publish --dry-run --access public
```

Publish only after reviewing the output:

```sh
npm publish --access public
```

The `prepublishOnly` script runs type checking and tests automatically. Complete npm's authentication/2FA prompts in your own terminal. A published name/version pair cannot be reused.

## Verify the release

```sh
npm view pi-path-bar@0.1.0 version dist.tarball --registry=https://registry.npmjs.org/
```

Test from a separate directory or with an isolated Pi agent directory. Avoid loading both the local/Git copy and the npm copy:

```sh
pi -e npm:pi-path-bar@0.1.0
```

Check compact paths, `/path-bar`, adding/editing/deleting aliases, Git state indicators, and light/dark theme changes. A permanent install uses:

```sh
pi install npm:pi-path-bar
```

After confirming the published package, tag the release:

```sh
git tag -a v0.1.0 -m "Release 0.1.0"
git push origin v0.1.0
```

## Later releases

Start with a clean working tree. Choose `patch`, `minor`, or `major` according to the change. This example updates the package and lockfile without creating a Git commit or tag:

```sh
npm version patch --no-git-tag-version
npm run check
npm test
npm pack --dry-run
```

Commit and push the version update, publish the new version, verify it, then tag the matching release commit. Use the actual version in verification and tag commands.

Users update managed extensions with:

```sh
pi update --extensions
```

Version-pinned installations stay pinned until their package specification is changed.

## License and privacy checks

- Keep `LICENSE` and all relevant upstream notices in the tarball.
- Review dependency and code provenance changes before each release.
- Review docs, packed sources, and repository history for private data. Editing the current README does not remove information from old commits.
- `package.json` must not contain `private: true`.
- Do not publish this package from an unreviewed worktree.

References: [npm public packages](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages), [npm 2FA](https://docs.npmjs.com/configuring-two-factor-authentication), [npm trusted publishing](https://docs.npmjs.com/trusted-publishers).
