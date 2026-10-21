# Release process / 发布流程

维护者可在明确授权的一次发布范围内，将准备、验证、送审、GitHub 和官网更新交由代理执行。
账号持有人负责必要的身份验证、合约与政策决定，以及最终真实体验验收。
本流程不代表对未来版本的持续自动发布授权。

## 发布身份与状态

- Chrome 商店条目：[Bookmark Atlas](https://chromewebstore.google.com/detail/bookmark-atlas/bkdplfepaegfdabniedlkaodllnmnbfl)，
  item ID：`bkdplfepaegfdabniedlkaodllnmnbfl`。
- 正式源码与 Release：[`xixi-kitchen/bookmark-atlas`](https://github.com/xixi-kitchen/bookmark-atlas)。
- 官网：[xixi-kitchen.github.io/bookmark-atlas](https://xixi-kitchen.github.io/bookmark-atlas/)。
- 发布状态依次为：候选准备 → 已送审 → 审核通过待发布（如选择延期发布）→ 商店已发布
  → GitHub 与官网回读完成。只能按已观察到的证据推进状态。
- 商店审核通过并实际发布前，GitHub 仅准备草稿，不发布该版本的稳定 Release 或将其设为 Latest。
  保留之前正式版本、标签、安装包和校验文件。

版本日期是正式安装包的冻结日期，不是商店批准日期。例如 v0.9.6 在 2026-10-21 冻结，
即使几天后审核通过，也不为修改日期而重建同一个包。送审和实际发布时间记录在渠道状态中，批准时间及「通过待发布」的后台证据记录在当次发布归档中。

`docs/release-status.json` 记录官网渠道状态：`storeVersion` 是已确认公开的商店版本，
`candidateVersion` 是本次候选；`stage`、`preparedAt`、`submittedAt`、`publishedAt`
分别保存阶段和对应日期。尚未发生的日期保持 `null`，不得把冻结日期抄作商店发布日期。
按实际证据更新后运行 `npm run docs:release`，由 `scripts/generate-public-releases.mjs`
生成 `docs/changelog.html` 并更新首页中英状态。不要只手改生成页或只改 README。
若后台已经批准但仍延期发布，公开渠道的 `stage` 继续保持 `submitted`，含义是候选尚未公开上架；它不是精确的审核子状态。批准时间与延期原因保留在发布归档，只有实际公开后才改为 `published`。

## 每次发布的证据

发布负责人保留以下记录，避免混淆构建和渠道状态：

| 记录 | 内容 |
| --- | --- |
| 发布范围 | 用户授权、版本、真实体验验收、已知限制 |
| 源码 | 独立发布副本、冻结 commit、锁文件、差异审查 |
| 安装包 | 文件名、字节数、SHA-256、包内 manifest 版本、构建与校验输出 |
| 审查 | 独立审查结论、问题处理与未完成项 |
| 商店 | 正确 item ID、上传版本、审核状态、送审和实际发布时间、公开商店回读 |
| GitHub | 标签指向、Release URL/状态、资产摘要、公开下载回验 |
| 官网 | 部署 commit、部署结果、公开安装/指南/更新/隐私/支持链接及页面回读 |

内部记录不随公开发布上传。源码公开前排除个人数据、浏览器用户配置、凭据、测试产物和内部会话档案。

## 执行清单

1. **确认验收与范围。** 用户确认当前改动的真实体验，负责人列明未解决限制。
   自动化测试、浏览器模拟或构建通过不能替代真实体验验收。
2. **冻结版本及文案。** 对齐 `package.json`、锁文件、构建 manifest、
   `src/onboarding/releaseNotes.json`、`CHANGELOG.md` 和 `docs/releases/vX.Y.Z.md`。
   应用、官网及 GitHub 使用一致的中英文说明；候选和商店稳定版分开描述。
   版本介绍按以下顺序写：版本与冻结日期、用户可见变化、如何开始使用、数据/权限/费用影响、
   已知限制与迁移。小更新保持轻提示，大功能引导需显式配置；不编造已上线状态。
   更新渠道状态后运行 `npm run docs:release`，核对中英输出。
3. **验证并打包。** 在干净、独立的发布副本中使用冻结的锁文件运行：

   ```bash
   npm ci --ignore-scripts
   npm exec -- wxt prepare
   npm run check
   npm run zip:chrome
   ```

   锁文件使用 npm 官方下载地址并保留完整性校验。`--ignore-scripts` 禁止安装阶段自动运行依赖脚本，再明确运行 WXT 的配置准备命令；不要使用 `--legacy-peer-deps` 跳过测试库需要的 peer 依赖。上游旧 React peer 范围可能产生警告，不能把警告当作测试通过，仍须检查完整验证结果。

   读取输出确认测试、类型检查、构建及 manifest/release 检查通过。
   检查 ZIP 中的 `manifest.json`、版本与权限，确认没有测试书签、密钥或私密截图。
   使用实际生成的文件名，例如 v0.9.6：

   ```bash
   unzip -t output/bookmark-atlas-0.9.6-chrome.zip
   unzip -p output/bookmark-atlas-0.9.6-chrome.zip manifest.json
   shasum -a 256 output/bookmark-atlas-0.9.6-chrome.zip
   ```

   生成同名 `.sha256` 文件，内容为 SHA-256、两个空格和 ZIP 的文件名（不带本机目录）。
   记录字节数与构建源码 commit，并在发布说明中固定源码身份。
   冻结后不替换该版本制品；若需改动源码或安装包，重新验证并明确生成新的候选身份。
   已上传商店的包需要修正时使用更高版本号。
4. **独立审查。** 由未执行实现的审查者检查差异、权限、隐私、版本和制品身份，
   同时核对说明是否准确。解决阻塞问题后，负责人冻结源码及 ZIP/SHA-256。
   后续官网状态更新可以使用独立文档提交，不移动冻结源码标签。
5. **上传正确商店条目并送审。** 核对开发者账号、发布者和上述 item ID，
   在既有条目上传冻结 ZIP。核对包版本、隐私披露、权限说明、测试说明与分发选项，
   然后提交审核，记录是否选择审核后自动发布或延期发布。
   上传成功、校验成功、提交审核都不等于 Google 审核通过。
   如界面出现身份验证或新的合约/政策决定，保留已完成工作，只交接该项。
   记录送审时间，更新渠道状态及生成页，公开商店版本仍保留上一稳定版。
6. **回读审核和实际发布。** 观察审核结果；若延期发布，在已授权范围内完成发布。
   读取公开商店版本与更新时间，确认目标版本确实可供安装；有条件时验证安装后的版本。
   只有后台审核通过、公开商店仍未更新时，状态仍为待发布/待传播，不宣布完成。
7. **完成 GitHub 正式发布。** 将 `vX.Y.Z` 附注标签指向冻结的构建源码 commit，
   不凭当前分支名称猜测目标。先准备 Release 草稿及双语说明，附上同一份冻结 ZIP
   和 `.sha256`，确认资产完整后发布正式版。
   发布后回读标签 commit、`draft=false`、`prerelease=false` 与 Latest 目标；
   不覆盖旧标签或旧安装包。GitHub 自动生成的源码压缩包不能替代扩展安装 ZIP。
8. **下载回验。** 从公开 Release 地址重新下载 ZIP 和 `.sha256`，放在新的验证目录，
   不执行下载内容。进入该目录后运行：

   ```bash
   shasum -a 256 -c bookmark-atlas-0.9.6-chrome.zip.sha256
   unzip -t bookmark-atlas-0.9.6-chrome.zip
   ```

   两项均通过，且摘要等于送审包，才记录资产闭环。
9. **更新官网及 README。** 根据实际商店状态更新 `docs/release-status.json`、运行
   `npm run docs:release`，同步 README 稳定版描述和正式 Release 链接；触发既有部署并等候结果。
   回读公开官网的版本、安装、指南、更新、隐私、支持链接，以及桌面和窄屏显示。
   本地文件正确不等于公网部署已生效。
10. **归档并交接。** 保存授权、验收、检查、源码、摘要、商店与 GitHub 状态、部署回读及恢复材料。
    分别报告已完成事项和仍需身份验证/Google 审核的事项，留下可继续接续的位置。
    送审后若要稍后自动跟进，须取得明确的提醒/监控授权，再使用产品提供的自动化机制。

## 代理可以做什么

| 执行者 | 责任 |
| --- | --- |
| 代理 / 发布负责人 | 版本、双语说明、构建测试、打包校验、独立审查协调；在已授权账号中上传送审、草稿及正式 Release、官网部署和公开回读；记录证据。 |
| 账号持有人 | 必要的 passkey、双重验证或 CAPTCHA；决定新合约、新政策声明、费用或超出本次范围的权限变化；最终真实体验验收。 |
| Google | 商店审核和平台分发；本地测试、代理或 CI 均不能替代其批准。 |

普通发布可以由代理在一次明确授权后持续代办，无需让使用者重复手工跑上述清单。
必要身份验证完成后，代理从已有证据继续，不重新打包或重做已完成步骤。
授权一次发布不代表允许未来所有发布，也不允许自动接受新的条款。

未来可单独配置官方 Chrome Web Store API 与 CI，进一步自动化上传、提交及状态检查。
API 仍要求正确账号授权、商店声明与审核，不能绕过双重验证或 Google 审核。
将凭据保存在适当的凭据存储或 CI secret 中，不提交到仓库、Issue、日志或发布附件。
本流程文档本身不建立 OAuth、上传凭据或创建定时自动化。
官方能力与前置条件见 [Chrome Web Store API](https://developer.chrome.com/docs/webstore/using-api)。

## 以后可以这样发起

> 请发布已验收的 vX.Y.Z。按 docs/release-process.md 完成验证、冻结安装包、
> 提交 Chrome 审核并准备 GitHub 草稿；确认商店实际上线后再完成正式 Release、
> 官网更新与下载回验。遇到必须由我完成的身份验证、合约或政策决定时，保留进度并说明具体入口。
> 不改动既有正式包，不把送审当成上线。

如果希望审核期间自动跟进，请另外明确要求监控频率或允许后续跟进；没有这一授权时，
负责人记录待审核状态与接续指令，不默认为持续后台工作。

## 失败、暂停与修复

- 检查、打包或摘要不一致：停止上传，保留日志并修复，重新验证后冻结新的候选；
  不用一个文件名掩盖不同制品。
- 审核拒绝或要求补充：保存平台原文，处理具体原因。提交后的包需要修改时递增版本再送审，
  不用旧版本号上传新代码。
- 发布后发现功能问题：保存用户数据与旧正式资产，暂停进一步推广/更新并发布新的修复版本。
  不通过删除用户存储、旧标签或历史 Release 来“回滚”，也不建议为回退卸载扩展。
  扩展回到旧代码也必须使用平台接受的更高版本号并重新审核。
- 官网部署失败：保留准确的稳定版状态，修复部署后回读，不改变已经冻结的安装包。
- 账号或凭据不可用：继续完成本地验证、草稿文案及恢复材料，交接所需认证；
  不索取用户将秘密粘贴进聊天或仓库。
- Git 历史存在意外差异：保留现场，使用独立副本核查。不得通过 force push、远程 reset
  或移动既有正式标签恢复状态。

## Official references / 官方依据

商店的提交、审核与延期发布状态以
[Chrome Web Store 发布说明](https://developer.chrome.com/docs/webstore/publish)及实际后台为准。
GitHub 草稿、标签与资产操作参照
[GitHub Release 管理](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)。

The release owner verifies the accepted scope, freezes source and package identity,
submits the exact ZIP to the existing Chrome item, and records review separately
from actual publication. After store publication is observed, publish the matching
GitHub release, verify public downloads, update the website, and retain evidence.
Account-holder authentication and new agreement or policy decisions remain human
steps. One release authorization does not authorize future unattended releases.
