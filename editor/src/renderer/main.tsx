import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installMockApi } from './utils/mockApi';
import './styles.css';

installMockApi();

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
