import '../../App.css'
import './SignUp.css'
import { GoogleLogin } from '@react-oauth/google'
import React from 'react'
import axios from 'axios'
import { toast } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import { useHistory, Link } from 'react-router-dom'

export default function SignUp({ loggedIn, setLoggedIn }) {
  const history = useHistory()

  const toastOptions = {
    position: 'bottom-right',
    autoClose: 5000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    progress: undefined,
    theme: 'light',
  }

  const login = (response) => {
    //the server checks the Google credential itself
    axios
      .post('/api/user', {
        credential: response.credential,
      })
      .then(() => {
        setLoggedIn(true)
        toast.success('You have successfully logged in.', toastOptions)
        history.push('/')
      })
      .catch((error) => {
        console.log(error)
        toast.error('Login failed, please try again.', toastOptions)
      })
  }

  return (
    <div className='sign-up-bg'>
      <div className='sign-up-border'>
        <h1 style={{ paddingBottom: '20px', fontSize: '60px' }}>BiteBrief</h1>
        <hr style={{ borderColor: 'white' }} />
        <h2 style={{ paddingTop: '20px' }}>Sign up</h2>
        <p style={{ paddingTop: '8px', paddingBottom: '25px' }}>
          Sign up to customize and recieve notifications on favorite dining hall
          foods
        </p>
        <GoogleLogin
          onSuccess={login}
          onError={(error) => {
            console.log(error)
          }}
        />
        <p style={{ paddingTop: '8px', fontSize: '12px' }}>
          By signing in, you agree to our{' '}
          <Link to='/privacy' style={{ color: 'white', textDecoration: 'underline' }}>
            Privacy Policy
          </Link>
        </p>
      </div>
    </div>
  )
}
