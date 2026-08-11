import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {FoundationSessionProvider} from './foundation/auth/FoundationSessionContext.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FoundationSessionProvider>
      <App />
    </FoundationSessionProvider>
  </StrictMode>,
);
