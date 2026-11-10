import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function withProject(scoped: boolean, test: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'atlas-release-target-'));
  try {
    mkdirSync(join(root, 'scripts/lib'), { recursive: true });
    cpSync(resolve('scripts/verify-release.mjs'), join(root, 'scripts/verify-release.mjs'));
    cpSync(resolve('scripts/lib/validate-release-notes.mjs'), join(root, 'scripts/lib/validate-release-notes.mjs'));
    mkdirSync(join(root, 'src/onboarding'), { recursive: true });
    mkdirSync(join(root, 'docs/releases'), { recursive: true });
    const text = { en: 'Example', 'zh-CN': '示例' };
    writeFileSync(join(root, 'src/onboarding/releaseNotes.json'), JSON.stringify([{
      version: '1.2.3', date: '2026-10-26', ...(scoped ? { browsers: ['edge'] } : {}),
      title: text, summary: text, sections: [{ type: 'added', items: [{ title: text, description: text }] }],
      gettingStarted: [text], notices: [text], education: { level: 'notes', chapters: [] },
    }]));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '1.2.3' }));
    writeFileSync(join(root, 'CHANGELOG.md'), '## v1.2.3');
    writeFileSync(join(root, 'docs/releases/v1.2.3.md'), '# v1.2.3\n## English\n## 中文');
    test(root);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

const verify = (root: string, browser?: string) => spawnSync(process.execPath,
  [join(root, 'scripts/verify-release.mjs'), ...(browser ? [browser] : [])], { encoding: 'utf8' });

describe('release metadata target guard', () => {
  it('rejects Edge-only notes from both explicit and default Chrome release checks', () => withProject(true, (root) => {
    for (const browser of ['chrome', undefined]) {
      const result = verify(root, browser);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/chrome|scope/i);
    }
  }));
  it('accepts the intended Edge target', () => withProject(true, (root) => {
    const result = verify(root, 'edge');
    expect(result.status, result.stderr).toBe(0);
  }));
  it('retains legacy browser-neutral release notes', () => withProject(false, (root) => {
    const result = verify(root);
    expect(result.status, result.stderr).toBe(0);
  }));
});
