import type { LearningChapter, LearningStep } from './learningState';
import type { LearningTarget } from './driverTargets';

export type LearningLanguage = 'en' | 'zh-CN';
type Lesson = { title: string; body: string; note: string; target?: LearningTarget };

const en: Record<LearningStep, Lesson> = {
  welcome: { title: 'Turn your favorite bookmarks into a canvas', body: 'Add a few bookmarks, then move, organize and open them yourself. Basics takes about 2–3 minutes. AI can wait.', note: 'Nothing imports automatically or moves your browser bookmark folders.' },
  import: { title: 'Add a favorite bookmark first', body: 'Open Import bookmarks and choose a few websites you use every day. Click a bookmark to add it, or import a folder when you choose.', note: 'This step completes only after a card is added and saved. Your browser bookmarks stay in their original folders.', target: 'import' },
  open: { title: 'Click its icon to open the website', body: 'Click a bookmark’s website icon to open a new tab. Come back here to continue organizing.', note: 'Dragging a card moves it; clicking its website icon opens it.', target: 'bookmark-open' },
  move: { title: 'Bring related bookmarks together', body: 'Drag a bookmark card to a new position on the canvas.', note: 'Only a move you make and save counts toward this lesson.', target: 'bookmark' },
  select: { title: 'Select a few bookmarks together', body: 'Drag a selection box from an empty part of the canvas to select at least two bookmarks.', note: 'Begin on empty space so you do not accidentally open a website. Add another bookmark if there is only one card.', target: 'bookmark' },
  presentation: { title: 'Choose a display that suits you', body: 'In the selection toolbar, try Icon, Compact or Detailed. Detailed cards can show a description and shortened URL.', note: 'This changes only your selected cards; it does not reset the canvas.', target: 'presentation-option' },
  layout: { title: 'Preview the layout before deciding', body: 'With a few bookmarks selected, open Layout preview to see their suggested positions.', note: 'The dashed preview has not changed your saved layout.', target: 'layout-preview' },
  'layout-apply': { title: 'Keep the layout only if you like it', body: 'Review the preview. Apply it when you are happy, or cancel and try again.', note: 'After applying, you can still undo the change. Cancelling does not complete this step.', target: 'preview-apply' },
  'basics-done': { title: 'Now make this canvas your own', body: 'You know how to add, open and organize bookmarks. Replay any chapter from Settings → Learning guide.', note: 'Ordinary updates will not restart completed basics.' },
  capture: { title: 'Save a useful webpage as you find it', body: 'On a webpage, click the Bookmark Atlas icon in your browser toolbar, then Add to canvas.', note: 'Uncheck “Open canvas after adding” to stay on that page and organize later. If the icon is hidden, find Bookmark Atlas in the browser’s Extensions menu.' },
  'ai-start': { title: 'Let AI help organize these cards', body: 'Select the bookmarks you want to organize, then open AI organizer. Try the offline demo first or configure your own model service.', note: 'AI is optional. You can add, organize and open bookmarks without an API key.', target: 'ai-open' },
  'ai-settings': { title: 'Connect your own AI service', body: 'Enter the endpoint and API key supplied by your provider, then choose a model. You can enter its ID manually if a model list is unavailable.', note: 'A model list does not prove a model works. Testing may cost money. Only Save locally stores the configuration; the encrypted key stays on this device.', target: 'ai-settings' },
  'ai-request': { title: 'Say how you want to organize', body: 'First select bookmarks by dragging a box from empty canvas space, then click AI organizer. For example: “Group by learning, work and entertainment; use compact cards.” Review the data to be sent, give consent, then generate a preview.', note: 'The selected titles, domains, notes, card IDs and your instruction are sent. Full URLs, browsing history and other tabs are not sent.', target: 'ai-organizer' },
  'ai-preview': { title: 'These are suggestions, not changes yet', body: 'Review groups, card styles and descriptions. Apply if you like the result, or cancel and try another instruction.', note: 'You can undo after applying. AI does not rearrange native browser bookmarks; descriptions are not verified webpage summaries.', target: 'preview-apply' },
  'ai-done': { title: 'You decide what stays on your canvas', body: 'You have reviewed and applied an AI suggestion. You can undo changes or return to any lesson from Settings.', note: 'Future requests still require your chosen service and explicit consent.' },
};

const zh: Record<LearningStep, Lesson> = {
  welcome: { title: '把常用书签，变成你的画布', body: '添加几条书签，亲手移动、整理并打开它们。基础体验约 2–3 分钟，AI 可以稍后再学。', note: '不会自动导入全部书签，也不会移动浏览器书签文件夹。' },
  import: { title: '先放一条常用书签', body: '点击「导入书签」，找到你想放到画布上的网页。点一条就能添加，也可以按需导入一个文件夹，不必一次加入全部。', note: '添加并保存成功后才完成这一步。添加的是画布卡片，原来的书签和文件夹位置不变。', target: 'import' },
  open: { title: '点图标，打开网站', body: '单击书签的网站图标，会在新标签页打开。试一试，回来后我们接着整理。', note: '想移动卡片时，拖动卡片即可。点击打开和拖动是两种操作。', target: 'bookmark-open' },
  move: { title: '把相关书签放到一起', body: '先拖动一张卡片，把它放到你想要的位置。', note: '只有你亲手移动并保存后，才完成这一步。', target: 'bookmark' },
  select: { title: '从空白处，框选几张书签', body: '从画布空白处拖出选框，选中至少两张书签，接着一起整理。', note: '框选请从空白处开始，避免误点网站图标。画布上只有一张时，可以再添加一条书签。', target: 'bookmark' },
  presentation: { title: '选择适合你的显示方式', body: '在出现的工具条里试试「图标」「简洁」「详细」。详细卡片还能显示简介和缩略网址。', note: '这次只改变选中的卡片，不会重置整张画布。', target: 'presentation-option' },
  layout: { title: '先看看排布，再决定', body: '选中几张书签后，点击「排布预览」查看新位置。', note: '虚线只是预览，现在还没有修改原来的排布。', target: 'layout-preview' },
  'layout-apply': { title: '满意，再应用到画布', body: '检查预览中的新位置。满意再应用，不满意可以取消，再试一次。', note: '应用后也能撤销；取消预览不会完成这一步。', target: 'preview-apply' },
  'basics-done': { title: '现在，开始整理你自己的画布', body: '你已经知道怎么添加、打开和整理书签。想再练一次，可以到「设置→使用指南」选择任意章节。', note: '已完成的基础教学不会因普通版本更新而重新弹出。' },
  capture: { title: '看到好网页，随手收进来', body: '在网页上点击浏览器工具栏里的 Bookmark Atlas 图标，再点「添加到画布」。', note: '取消「添加后打开画布」，就能留在当前页面，之后再集中整理。找不到图标时，可在浏览器的扩展程序菜单里找到 Bookmark Atlas。' },
  'ai-start': { title: '让 AI 帮你整理这几张', body: '选中要整理的书签，再点击「AI 整理」。你可以先看演示，也可以配置自己的模型服务。', note: 'AI 是可选功能。没有 Key，也不影响添加、整理和打开书签。', target: 'ai-open' },
  'ai-settings': { title: '连接你自己的 AI 服务', body: '填入服务商提供的接口地址和 API Key，再选择模型。拉取不到模型时，也可以手动输入。', note: '拉取列表不代表模型可用。测试可能收费；点击「保存到本机」才会保存，Key 本机加密，不参与同步。', target: 'ai-settings' },
  'ai-request': { title: '先说清楚，你想怎么整理', body: '先从画布空白处框选书签，再点击工具条里的「AI 整理」。例如：「按学习、工作、娱乐分组，使用简洁卡片。」核对将发送的数据，确认后再生成。', note: '仅发送选中卡片的标题、域名、备注、ID 和你的要求。不会发送完整网址、历史或其他标签页。', target: 'ai-organizer' },
  'ai-preview': { title: '这是建议，还没有改动画布', body: '检查分组、卡片样式和简介。满意再点「应用」，不满意可以取消或换个要求重试。', note: '应用后可撤销。AI 不会重排浏览器原生书签；简介也不等于已核实的网页摘要。', target: 'preview-apply' },
  'ai-done': { title: '画布怎么整理，由你决定', body: '你已经审阅并应用了一次 AI 建议。应用后仍可撤销，也可以随时从设置重看教学。', note: '之后的请求仍需你选择的服务和明确同意。' },
};

export function getLearningLesson(step: LearningStep, language: LearningLanguage): Lesson {
  return (language === 'zh-CN' ? zh : en)[step];
}

export function getLearningLabels(language: LearningLanguage) {
  const chinese = language === 'zh-CN';
  return {
    guide: chinese ? '使用指南' : 'Learning guide', close: chinese ? '关闭引导' : 'Close learning guide',
    start: chinese ? '开始动手体验' : 'Start hands-on basics', explore: chinese ? '我自己探索' : 'Explore on my own',
    pause: chinese ? '暂时退出' : 'Pause learning', resume: chinese ? '继续学习' : 'Resume learning',
    paused: chinese ? '想学的时候，再回来' : 'Come back whenever you want',
    pausedBody: chinese ? '教学已暂停，进度已保留。可以继续，也可以选择任意章节重新体验。' : 'Learning is paused and your progress is kept. Resume or replay any chapter.',
    import: chinese ? '导入书签' : 'Import bookmarks', configure: chinese ? '配置 AI 服务' : 'Configure AI service',
    addBookmark: chinese ? '再添加一条书签' : 'Add another bookmark',
    locate: chinese ? '定位画布书签' : 'Locate canvas bookmarks',
    previewLayout: chinese ? '重新预览排布' : 'Preview the layout again',
    organizer: chinese ? '打开 AI 整理' : 'Open AI organizer', demo: chinese ? '先看效果演示' : 'See the offline demo first',
    continue: chinese ? '继续使用画布' : 'Continue using the canvas',
    waiting: chinese ? '等待你完成真实操作' : 'Waiting for your action',
    chapters: chinese ? '选择章节，随时重看' : 'Choose a chapter to replay',
    missing: chinese ? '当前未找到可高亮的入口。可按上方说明操作，或关闭其他面板后重试；进度不会跳过。' : 'The target is not visible yet. Follow the instructions above or close other panels and retry. Your progress will not skip ahead.',
    retry: chinese ? '重新定位入口' : 'Find the target again',
    checklist: chinese ? '学习清单' : 'Learning checklist',
    chapterNames: (chinese ? { basics: '基础体验', capture: '随手收藏网页', ai: 'AI 整理（可选）' } : { basics: 'Hands-on basics', capture: 'Capture a webpage', ai: 'AI organization (optional)' }) as Record<LearningChapter, string>,
    firstTime: chinese ? '第一次使用' : 'Your first canvas',
    captureBrowser: chinese ? '浏览器工具栏 · Bookmark Atlas → 添加到画布' : 'Browser toolbar · Bookmark Atlas → Add to canvas',
  };
}

export function getLearningRecovery(step: LearningStep, language: LearningLanguage): string {
  const chinese = language === 'zh-CN';
  if (step === 'ai-start' || step === 'ai-request') return chinese
    ? '先导入书签，再从画布空白处框选要整理的卡片，点击工具条里的「AI 整理」。如果已有书签，请先将它们移到可见区域再框选；当前学习进度会保留。'
    : 'Import bookmarks first, then drag a selection box from empty canvas space around the cards and click AI organizer in the selection toolbar. If you already have bookmarks, bring them into view and select them. Your learning progress is kept.';
  if (step === 'presentation' || step === 'layout') return chinese
    ? '从空白处重新框选至少两张书签，工具条就会重新出现。接着再选择显示方式或打开排布预览；当前学习进度会保留。'
    : 'Reselect at least two bookmarks from empty canvas space to show the toolbar again. Then choose a display or open Layout preview. Your learning progress is kept.';
  if (step === 'layout-apply') return chinese
    ? '未保存的排布预览已不在当前画布（例如刷新后）。先从空白处重新框选至少两张书签，再点击「重新预览排布」重建预览。重新预览和取消都不会完成此步。'
    : 'The unsaved layout preview is no longer available, for example after a refresh. Reselect at least two bookmarks from empty canvas space, then preview the layout again. Rebuilding or cancelling a preview does not complete this step.';
  if (step === 'ai-preview') return chinese
    ? 'AI 预览未保留，可能已取消或因刷新而清除。请重新选择要整理的书签，打开 AI 整理，核对数据范围并同意后再生成。打开面板不会发送请求或完成此步。'
    : 'The AI preview was not retained; it may have been cancelled or cleared by a refresh. Select the bookmarks again, open AI organizer, review the data and give consent before generating another preview. Opening the organizer does not send a request or complete this step.';
  if (step === 'open' || step === 'move' || step === 'select') return chinese
    ? '当前视野内没有可高亮的书签。可以点击「定位画布书签」找到现有卡片；需要更多卡片时，可先添加书签。定位不会完成此步。'
    : 'No bookmark can be highlighted in the current view. Locate existing canvas bookmarks, or add bookmarks if you need more cards. Locating cards does not complete this step.';
  return getLearningLabels(language).missing;
}
