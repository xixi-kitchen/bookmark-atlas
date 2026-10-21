# Contributing / 参与贡献

## English

Bookmark Atlas welcomes focused bug fixes, documentation improvements, and
reproducible reports. Start with an existing issue or explain the problem your
change solves. For a broad workflow, permission, or dependency change, describe
the design and privacy impact before implementation.

### Report a problem

Use the [issue forms](https://github.com/xixi-kitchen/bookmark-atlas/issues/new/choose).
Include the extension version, browser/version, operating system, installation
source (Chrome Web Store, unpacked test build, or another package), steps to
reproduce, and expected versus actual results. For sync problems, state whether
browser sync is enabled and whether the issue involves tabs, devices, or different
browser families. Use a small set of sample bookmarks when possible.

Issues and pull requests are public. Remove API keys, access tokens, account
details, private URLs, bookmark titles, and browsing history from screenshots and
logs. Do not attach an entire browser profile or personal canvas backup. If a key
has been exposed, revoke it with its provider; deleting the issue is insufficient.

### Make a change

1. Create a branch and keep the diff limited to one verifiable problem. Reuse
   existing utilities and patterns; avoid unrelated cleanup or new dependencies.
2. Run `npm ci`, then `npm run dev`. Test data-changing behavior in a separate
   browser profile using sample bookmarks and a backup you can restore.
3. For a functional fix, add a regression test that demonstrates the failure,
   then implement and verify the fix. Use proportionate checks for documentation
   and visual changes, including links and real rendering where relevant.
4. Run `npm run check` for code changes. If a change specifically affects another
   browser build, also run `npm run check:edge` or `npm run check:safari`. Report
   actual results and any checks you could not run; build success is not device
   or cross-device acceptance.
5. Open a pull request describing the problem, resulting behavior, validation,
   and material limitations. Update English and Chinese user-facing text and
   documentation together. Release changes follow the
   [release process](docs/release-process.md).

### Privacy and review

Keep storage local-first and preserve existing user data. Document changes to
permissions, sync payloads, credentials, external requests, or deletion behavior.
Never commit keys, browser profiles, personal backups, or private screenshots.
Optional AI must retain explicit consent and selected-metadata boundaries.

Keep Excalidraw's established canvas behavior and the distinction between Chrome
support, Edge candidates, and Safari feasibility builds. A reviewer should be
able to verify your change from its description and evidence without access to
your accounts or personal bookmarks.

## 中文

欢迎提交范围明确的修复、文档改进和可复现问题。先关联已有 Issue，或说明要解决的具体问题。
涉及较大的工作流、权限或依赖调整时，请先说明设计与隐私影响。

### 反馈问题

使用 [Issue 表单](https://github.com/xixi-kitchen/bookmark-atlas/issues/new/choose)，
提供扩展版本、浏览器与版本、操作系统、安装来源（Chrome 商店、未打包测试版或其他安装包）、
复现步骤、预期与实际结果。同步问题请说明是否开启浏览器同步，以及涉及同设备标签页、跨设备，
还是不同浏览器。尽量使用少量示例书签复现。

Issue 和 Pull Request 均公开。日志或截图中请移除 API Key、访问令牌、账号、私密网址、
书签标题和浏览历史；不要上传整个浏览器用户配置或个人画布备份。
若密钥已经泄露，请在服务商处撤销；仅删除 Issue 不足以恢复密钥安全。

### 提交改动

1. 创建分支，每次只解决一个可验证问题。复用现有工具与模式，避免无关清理或新增依赖。
2. 运行 `npm ci`、`npm run dev`。涉及数据变更时，在独立浏览器配置中使用示例书签及可恢复备份。
3. 功能修复先通过回归测试复现失败，再实现并验证。文档与视觉改动使用相称检查，
   包括链接和必要的实际渲染检查。
4. 代码改动运行 `npm run check`；影响其他浏览器构建时补跑 `npm run check:edge`
   或 `npm run check:safari`。如实报告结果及未能执行的检查，构建通过不等于真机或跨设备验收。
5. PR 说明具体问题、变更后行为、验证与限制。面向用户的中英文文案和文档同步维护；
   发布改动遵循[发布流程](docs/release-process.md)。

### 隐私与审查

保持本地优先，保留现有用户数据。涉及权限、同步内容、凭据、外部请求或数据删除时，说明变化。
禁止提交密钥、浏览器用户配置、个人备份或私密截图；可选 AI 保留明确同意与所选信息的发送边界。

保留 Excalidraw 原有画布能力，准确区分 Chrome 正式支持、Edge 候选与 Safari 可行性构建。
审查者应能通过 PR 说明和证据验证改动，无需访问你的账号或个人书签。
