import { BookOpen, Github, MessageSquare } from 'lucide-react';
import { getUiLanguage } from '../i18n';
import './CommunityLinks.css';

export function CommunityLinks() {
  const chinese = getUiLanguage() === 'zh-CN';

  return (
    <nav className="community-links" aria-label={chinese ? '社区与在线帮助' : 'Community and online help'}>
      <a className="settings-menu__action community-links__link"
        href={`https://xixi-kitchen.github.io/bookmark-atlas/${chinese ? 'zh/' : ''}guide.html#embeds`}
        target="_blank" rel="noopener noreferrer">
        <BookOpen size={16} aria-hidden="true" />
        <span>{chinese ? '网页嵌入教程' : 'Web embed guide'}</span>
      </a>
      <a className="settings-menu__action community-links__link"
        href="https://github.com/xixi-kitchen/bookmark-atlas" target="_blank" rel="noopener noreferrer">
        <Github size={16} aria-hidden="true" />
        <span>{chinese ? '在 GitHub 收藏' : 'Star on GitHub'}</span>
      </a>
      <a className="settings-menu__action community-links__link"
        href="https://github.com/xixi-kitchen/bookmark-atlas/issues/new/choose" target="_blank" rel="noopener noreferrer">
        <MessageSquare size={16} aria-hidden="true" />
        <span>{chinese ? '反馈问题 / 申请网站适配' : 'Report an issue / request site support'}</span>
      </a>
      <p className="community-links__hint">{chinese
        ? '已适配 B站和 YouTube。其他网站可提交网址申请适配；并非所有网站都能嵌入。'
        : 'Bilibili and YouTube are adapted. Submit a URL to request another site; site restrictions may still apply.'}</p>
    </nav>
  );
}
