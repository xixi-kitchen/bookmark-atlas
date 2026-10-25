export interface ProjectSupportConfig {
  enabled: boolean;
  pageUrl: string;
  wechatQrUrl: string;
  alipayQrUrl: string;
}

/** Throws for malformed values, unsupported fields, and unsafe destinations. */
export function parseProjectSupportConfig(input: unknown): ProjectSupportConfig;

/** Only en and zh-CN are supported; invalid/disabled input returns null. */
export function getProjectSupportUrl(input: unknown, locale?: string): string | null;
