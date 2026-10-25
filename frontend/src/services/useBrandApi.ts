import { brandApi } from './brand-api';
import { demoApi } from '../features/preview/demo-api';
import { useDemoMode } from '../features/preview/demo-context';

export function useBrandApi() {
  return useDemoMode() ? demoApi : brandApi;
}
