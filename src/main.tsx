import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Điểm khởi đầu của giao diện: gắn ứng dụng React vào thẻ <div id="root"> trong index.html.

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
