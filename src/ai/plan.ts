import { isBookmarkPresentation, type BookmarkPresentation } from '../excalidraw/bookmarkDisplay';

export const MAX_ORGANIZATION_ITEMS = 200;
export const MAX_ORGANIZATION_GROUPS = 20;
export const MAX_ORGANIZATION_RESPONSE_BYTES = 256 * 1024;

export type AIErrorCode = 'invalid_config' | 'invalid_request' | 'missing_key'
  | 'permission_required' | 'permission_unavailable' | 'storage_unavailable'
  | 'cancelled' | 'timeout' | 'network' | 'unauthorized' | 'rate_limited'
  | 'http_error' | 'response_too_large' | 'invalid_response' | 'invalid_plan';

/** Never carries provider response text, request content, or credentials. */
export class AIError extends Error {
  constructor(public readonly code: AIErrorCode) {
    super(code);
    this.name = 'AIError';
  }
}

export interface OrganizationItem {
  id: string;
  title: string;
  domain: string;
  description?: string;
}

export interface OrganizationRequest {
  items: OrganizationItem[];
  instruction: string;
}

export interface OrganizationPlanItem {
  id: string;
  presentation?: BookmarkPresentation;
  description?: string;
}

export interface OrganizationPlan {
  groups: { title: string; items: OrganizationPlanItem[] }[];
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function onlyKeys(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).every((key) => keys.includes(key));
}

function boundedString(value: unknown, limit: number, allowEmpty = false): value is string {
  return typeof value === 'string' && (allowEmpty || value.trim().length > 0)
    && Array.from(value).length <= limit;
}

/** Strictly reconstruct the permitted data shape; no model output is executable. */
export function validateOrganizationPlan(value: unknown, allowedIds: readonly string[]): OrganizationPlan {
  const fail = (): never => { throw new AIError('invalid_plan'); };
  if (allowedIds.length === 0 || allowedIds.length > MAX_ORGANIZATION_ITEMS
    || new Set(allowedIds).size !== allowedIds.length) return fail();
  if (!record(value) || !onlyKeys(value, ['groups']) || !Array.isArray(value.groups)
    || value.groups.length === 0 || value.groups.length > MAX_ORGANIZATION_GROUPS) return fail();
  const allowed = new Set(allowedIds);
  const seen = new Set<string>();
  const groups = value.groups.map((group) => {
    if (!record(group) || !onlyKeys(group, ['title', 'items']) || !boundedString(group.title, 80)
      || !Array.isArray(group.items) || group.items.length === 0) return fail();
    const title = group.title;
    const items = group.items.map((item): OrganizationPlanItem => {
      if (!record(item) || !onlyKeys(item, ['id', 'presentation', 'description'])
        || typeof item.id !== 'string' || !allowed.has(item.id) || seen.has(item.id)
        || ('presentation' in item && !isBookmarkPresentation(item.presentation))
        || ('description' in item && !boundedString(item.description, 140, true))) return fail();
      seen.add(item.id);
      return {
        id: item.id,
        ...(isBookmarkPresentation(item.presentation) ? { presentation: item.presentation } : {}),
        ...(typeof item.description === 'string' ? { description: item.description } : {}),
      };
    });
    return { title, items };
  });
  return { groups };
}

/** The adapter requires a single JSON object, not prose or executable code fences. */
export function parseOrganizationPlan(content: string, allowedIds: readonly string[]): OrganizationPlan {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new AIError('invalid_plan');
  }
  return validateOrganizationPlan(value, allowedIds);
}

/** Whitelist selected metadata even if the caller's objects contain full URLs. */
export function prepareOrganizationRequest(request: OrganizationRequest): OrganizationRequest {
  const fail = (): never => { throw new AIError('invalid_request'); };
  if (!request || !Array.isArray(request.items) || request.items.length === 0
    || request.items.length > MAX_ORGANIZATION_ITEMS || !boundedString(request.instruction, 2000)) return fail();
  const seen = new Set<string>();
  const items = request.items.map((item) => {
    if (!item || !boundedString(item.id, 128) || seen.has(item.id)
      || !boundedString(item.title, 1000, true) || !boundedString(item.domain, 253, true)
      || (item.description !== undefined && !boundedString(item.description, 140, true))) return fail();
    // Only a hostname is permitted, never a path, query, fragment, port, or user info.
    if (item.domain && !/^[\p{L}\p{N}._-]+$/u.test(item.domain)) return fail();
    seen.add(item.id);
    return {
      id: item.id,
      title: item.title,
      domain: item.domain,
      ...(item.description !== undefined ? { description: item.description } : {}),
    };
  });
  return { items, instruction: request.instruction };
}
