import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';

import { createTheme, MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';

const theme = createTheme({
  primaryColor: 'ocean',
  defaultRadius: 'sm',
  colors: {
    ocean: [
      '#e8f4fa',
      '#d4eaf3',
      '#afd8e8',
      '#83c2d9',
      '#54a8c2',
      '#328eaa',
      '#217690',
      '#195f76',
      '#154e61',
      '#113f4f',
    ],
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light">
      <Notifications position="top-right" />
      <App />
    </MantineProvider>
  </React.StrictMode>
);