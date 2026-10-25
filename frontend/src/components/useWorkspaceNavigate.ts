import { useNavigate as useRouterNavigate } from 'react-router-dom';
import { useDemoMode } from '../features/preview/demo-context';
import { demoDestination } from './workspace-destination';

export function useNavigate() {
  const navigate = useRouterNavigate();
  const demo = useDemoMode();
  return ((to, options) => typeof to === 'number' ? navigate(to) : navigate(demoDestination(to, demo), options)) as ReturnType<typeof useRouterNavigate>;
}
