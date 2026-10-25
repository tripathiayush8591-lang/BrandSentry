import { createContext, useContext } from 'react';

// Presentation scope only. Never an identity, session, role or permission.
export const DemoContext = createContext(false);
export const useDemoMode = () => useContext(DemoContext);
