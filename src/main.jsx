import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
// Boot the offline sync worker. Importing scorer.js registers its
// per-type handlers as a side effect; startSyncWorker installs the
// online/offline listeners and the periodic drain timer.
import './offline/scorer';
import { startSyncWorker } from './offline/sync';
startSyncWorker();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
