# Third-party notices

pi-path-bar is licensed under the MIT License. The following notices apply to upstream material referenced or adapted by this project. They do not imply endorsement.

## Pi

- Project: https://github.com/earendil-works/pi
- License source: https://github.com/earendil-works/pi/blob/main/LICENSE
- Material: extension settings UI patterns and footer display/usage formatting logic in `src/settings.ts` and `src/index.ts`.
- The Pi host supplies `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui`. Their package contents are not bundled in this npm package.

```text
MIT License

Copyright (c) 2025 Mario Zechner

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Tide

- Project: https://github.com/IlanCosman/tide
- License source: https://github.com/IlanCosman/tide/blob/v6/LICENSE.md
- Material: Git status notation and operation detection logic adapted from `_tide_item_git.fish` in `src/git.ts`. The TypeScript implementation uses porcelain v2 and handles all unmerged states.
- Tide is not bundled or required at runtime.

# MIT License

Copyright © `2020` `Ilan Cosman`

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Fonts and icons

The extension uses Unicode characters, including Nerd Font icon code points. No font files, icon images, or other font assets are bundled. Users supply their terminal font separately.
