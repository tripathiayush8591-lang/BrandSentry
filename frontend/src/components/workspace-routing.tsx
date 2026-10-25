import { demoDestination } from './workspace-destination';
import { Link as RouterLink, NavLink as RouterNavLink, type LinkProps, type NavLinkProps } from 'react-router-dom';
import { useDemoMode } from '../features/preview/demo-context';

export function Link(props: LinkProps) {
  const demo = useDemoMode();
  return <RouterLink {...props} to={demoDestination(props.to, demo)} />;
}
export function NavLink(props: NavLinkProps) {
  const demo = useDemoMode();
  return <RouterNavLink {...props} to={demoDestination(props.to, demo)} />;
}
