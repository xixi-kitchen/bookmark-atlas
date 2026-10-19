import { t } from '../i18n';
import { AIError } from './plan';

/** Show stable local messages, never provider errors that may echo credentials or metadata. */
export function aiErrorMessage(cause: unknown): string {
  const code = cause instanceof AIError ? cause.code : 'network';
  return code === 'unauthorized' || code === 'missing_key' ? t('aiErrorKey')
    : code === 'permission_required' || code === 'permission_unavailable' ? t('aiErrorPermission')
      : code === 'invalid_config' ? t('aiErrorConfig')
        : code === 'invalid_plan' || code === 'invalid_response' || code === 'response_too_large' ? t('aiErrorPlan')
          : code === 'timeout' ? t('aiErrorTimeout')
            : code === 'rate_limited' ? t('aiErrorRateLimit')
              : code === 'storage_unavailable' ? t('aiErrorStorage') : t('aiErrorRequest');
}
