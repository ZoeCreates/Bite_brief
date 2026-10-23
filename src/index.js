import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { GoogleOAuthProvider } from '@react-oauth/google'

createRoot(document.getElementById('root')).render(
  <GoogleOAuthProvider clientId='680142103979-ahonidcp8bvl73hc5ncghsj0v5igt52b.apps.googleusercontent.com'>
    <App />
  </GoogleOAuthProvider>
)
