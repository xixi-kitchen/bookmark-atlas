# Bookmark Atlas v{{VERSION}} Cross-device Sync Test

## 中文安装说明

这是仅用于跨设备同步验收的开发测试版。包内使用固定的公开测试密钥，确保不同设备加载后获得相同的扩展 ID。

固定测试扩展 ID：`{{TEST_EXTENSION_ID}}`

Manifest 中的公开密钥不是账号凭据；测试包不包含私钥。

### 在两台设备上安装

1. 两台设备登录同一个 Chrome 账号并开启 Chrome 同步。
2. 打开 `chrome://extensions`。
3. 暂时停用 Chrome 商店版 Bookmark Atlas，但不要卸载。
4. 开启“开发者模式”。
5. 将本 ZIP 解压到一个正常可见的文件夹。
6. 点击“加载已解压的扩展程序”，选择其中包含 `manifest.json` 的文件夹。
7. 确认两台设备都显示版本 `{{VERSION}}`，扩展 ID 都是 `{{TEST_EXTENSION_ID}}`。

如果两个 ID 不一致，请停止测试；这种情况下两台设备不会共享同一份 `chrome.storage.sync` 数据。

### 验收顺序

1. **正常同步：** A 添加带时间的文字并等待“画布已同步”；B 不刷新，最多等待五分钟。应自动出现且不弹冲突框。再从 B 向 A 反向测试。
2. **视图隔离：** A 只缩放、移动视口、打开侧边栏或切换工具。B 的视图不能移动，两端都不能出现冲突提示。
3. **重新打开：** 关闭 B 的插件页；A 修改并同步；重新打开 B。B 应直接加载新画布，不刷新、不弹冲突框。
4. **真实分叉：** 两端基线一致后都断网；A 添加 `A OFFLINE`，B 添加 `B OFFLINE`；先恢复 A，待其同步后再恢复 B。至少一端应出现一次真正的冲突选择；选择后两端最终一致，弹窗不再重复。

第一次请使用不含图片附件的小画布。图片和二进制附件本来就只保存在添加它们的设备上。

## English instructions

This is a development-only build. It uses a fixed public test key so every device receives the same extension ID.

Fixed test extension ID: `{{TEST_EXTENSION_ID}}`

The public manifest key is not a credential. This package contains no private key.

## Install on both devices

1. Sign in to Chrome with the same account and enable Chrome Sync on both devices.
2. Open `chrome://extensions`.
3. Temporarily disable the Chrome Web Store version of Bookmark Atlas. Do not uninstall it.
4. Enable Developer mode.
5. Extract this ZIP into a visible folder.
6. Select **Load unpacked** and choose the extracted folder containing `manifest.json`.
7. Confirm both devices show version `{{VERSION}}` and extension ID `{{TEST_EXTENSION_ID}}`.

If the IDs differ, stop: the test is invalid and the devices will not share `chrome.storage.sync`.

## Acceptance sequence

### Normal A to B update

1. On device A, add a small text element with a unique timestamp.
2. Wait until A reports that the canvas is synced.
3. Keep device B open without refreshing and wait up to five minutes.
4. Pass: B receives the element automatically and shows no conflict prompt.

Repeat in the opposite direction.

### Local viewport

On A, zoom, pan, open a sidebar, and change drawing tools without editing an element.

Pass: B does not move its viewport and neither device reports a canvas conflict.

### Reopen

1. Close the Bookmark Atlas tab on B.
2. Edit and sync a small element on A.
3. Open a new tab on B.

Pass: B opens with the new canvas without manual refresh or a conflict prompt.

### Real offline branch

1. Start with the same synced canvas on both devices.
2. Disconnect both devices from the network.
3. Add `A OFFLINE` on A and `B OFFLINE` on B.
4. Reconnect A and let it sync, then reconnect B.

Pass: at least one device shows one real conflict choice. After choosing a version, both devices converge and the same prompt does not return.

Use a small test canvas without image attachments for the first run. Images and binary attachments intentionally remain local to the device where they were added.
