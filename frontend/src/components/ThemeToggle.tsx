import { useTheme } from '../context/theme-context';

/** Original CSS landscape; decoration never supplies the control's accessible name. */
export function ThemeToggle() {
  const { isDark, theme, toggleTheme, setTheme } = useTheme();

  return (
    <div className="theme-control">
      <button
        type="button"
        onClick={toggleTheme}
        role="switch"
        aria-checked={isDark}
        aria-label="Dark mode"
        className="theme-landscape"
        title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      >
        <span className="theme-scenery" aria-hidden="true">
          <span className="theme-stars"><i /><i /><i /></span>
          <span className="theme-cloud theme-cloud-far" />
          <span className="theme-cloud theme-cloud-near" />
          <span className="theme-orb"><span className="theme-crater" /></span>
        </span>
      </button>
      <button
        type="button"
        className="theme-system"
        aria-label="Use system theme"
        aria-pressed={theme === 'system'}
        onClick={() => setTheme('system')}
        title="Follow your device appearance"
      >Auto</button>
    </div>
  );
}
