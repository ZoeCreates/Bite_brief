import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { GoogleOAuthProvider } from '@react-oauth/google'

createRoot(document.getElementById('root')).render(
  <GoogleOAuthProvider clientId='270825436286-0m6k81c8eh6csonalrjrth42vg4tt5r4.apps.googleusercontent.com'>
    <App />
  </GoogleOAuthProvider>
)
