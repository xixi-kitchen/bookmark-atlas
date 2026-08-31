import { YOUTUBE_CLIENT_IDENTITY } from './WebEmbed';

const YOUTUBE_IDENTITY_RULE_ID = 912_401;

export async function ensureYoutubeEmbedIdentityRule() {
  const api = globalThis.chrome?.declarativeNetRequest;
  const extensionId = globalThis.chrome?.runtime?.id;
  if (!api?.updateDynamicRules || !extensionId) return;

  const rule = {
    id: YOUTUBE_IDENTITY_RULE_ID,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        { header: 'Referer', operation: 'set', value: YOUTUBE_CLIENT_IDENTITY },
      ],
    },
    condition: {
      urlFilter: '|https://www.youtube.com/embed',
      initiatorDomains: [extensionId],
      requestDomains: ['www.youtube.com'],
      resourceTypes: ['sub_frame'],
    },
  } as chrome.declarativeNetRequest.Rule;

  try {
    await api.updateDynamicRules({
      removeRuleIds: [YOUTUBE_IDENTITY_RULE_ID],
      addRules: [rule],
    });
  } catch (error) {
    console.warn('Unable to install the YouTube embed identity rule.', error);
  }
}
