import { describe, expect, it } from 'vitest';
import { AIError, parseOrganizationPlan, prepareOrganizationRequest, validateOrganizationPlan } from './plan';

const plan = { groups: [{ title: 'Development', items: [{ id: 'one', presentation: 'compact', description: 'A note' }] }] };

describe('organization plan validation', () => {
  it('accepts a subset and reconstructs only allowed fields without changing source', () => {
    expect(validateOrganizationPlan(plan, ['one', 'two'])).toEqual(plan);
    expect(validateOrganizationPlan(plan, ['one', 'two'])).not.toBe(plan);
    expect(parseOrganizationPlan(JSON.stringify(plan), ['one'])).toEqual(plan);
  });

  it.each([
    null,
    { groups: [] },
    { groups: [{ title: '', items: [{ id: 'one' }] }] },
    { groups: [{ title: 'x'.repeat(81), items: [{ id: 'one' }] }] },
    { groups: [{ title: 'x', items: [] }] },
    { groups: [{ title: 'x', items: [{ id: 'other' }] }] },
    { groups: [{ title: 'x', items: [{ id: 'one' }, { id: 'one' }] }] },
    { groups: [{ title: 'x', items: [{ id: 'one', presentation: 'giant' }] }] },
    { groups: [{ title: 'x', items: [{ id: 'one', description: '🍒'.repeat(141) }] }] },
    { groups: [{ title: 'x', items: [{ id: 'one', description: null }] }] },
    { groups: [{ title: 'x', items: [{ id: 'one', url: 'https://untrusted.test/' }] }] },
    { groups: [{ title: 'x', items: [{ id: 'one' }], code: 'alert(1)' }] },
    { ...plan, code: 'alert(1)' },
    { groups: [{ title: 'x', items: [{ id: 'one' }] }, { title: 'y', items: [{ id: 'one' }] }] },
    { groups: Array.from({ length: 21 }, (_, index) => ({ title: 'x', items: [{ id: String(index) }] })) },
  ])('rejects unsafe or invalid output %#', (value) => {
    expect(() => validateOrganizationPlan(value, ['one'])).toThrowError(new AIError('invalid_plan'));
  });

  it('counts Unicode characters, permits an empty note to clear it, and treats script as text', () => {
    const output = { groups: [{ title: '🍒'.repeat(80), items: [{ id: 'one', description: '🍒'.repeat(140) }, { id: 'two', description: '' }, { id: 'three', description: '<script>alert(1)</script>' }] }] };
    expect(validateOrganizationPlan(output, ['one', 'two', 'three'])).toEqual(output);
  });

  it('rejects duplicate input scope and too many targets', () => {
    expect(() => validateOrganizationPlan(plan, ['one', 'one'])).toThrow('invalid_plan');
    expect(() => validateOrganizationPlan(plan, Array.from({ length: 201 }, (_, id) => String(id)))).toThrow('invalid_plan');
  });

  it.each(['```json\n{}\n```', 'Here is your plan: {}', '{} {}', 'not JSON'])('rejects non-single JSON content %s', (content) => {
    expect(() => parseOrganizationPlan(content, ['one'])).toThrow('invalid_plan');
  });
});

describe('selected metadata boundary', () => {
  it('drops caller-only full URL, path, history and secret fields', () => {
    const item = { id: 'one', title: 'A', domain: 'example.test', description: 'Note', url: 'https://example.test/secret?token=private#secret', path: '/private', history: ['secret'], apiKey: 'secret' };
    expect(prepareOrganizationRequest({ items: [item], instruction: 'Group' })).toEqual({ items: [{ id: 'one', title: 'A', domain: 'example.test', description: 'Note' }], instruction: 'Group' });
  });

  it.each(['https://example.test', 'example.test/path', 'example.test?key=a', 'user@example.test', 'example.test:443', 'example.test#private'])('rejects a non-domain value %s', (domain) => {
    expect(() => prepareOrganizationRequest({ items: [{ id: 'one', title: 'A', domain }], instruction: 'Group' })).toThrow('invalid_request');
  });

  it('rejects empty instructions, duplicate targets and overlong input', () => {
    const item = { id: 'one', title: 'A', domain: '' };
    for (const request of [
      { items: [item], instruction: '' },
      { items: [item, item], instruction: 'Group' },
      { items: [], instruction: 'Group' },
      { items: [item], instruction: 'x'.repeat(2001) },
      { items: [{ ...item, description: 'x'.repeat(141) }], instruction: 'Group' },
    ]) expect(() => prepareOrganizationRequest(request)).toThrow('invalid_request');
  });
});
