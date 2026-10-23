import React from "react";
import Navbar from "./components/Navbar";
import "./App.css";
import { BrowserRouter as Router, Switch, Route } from "react-router-dom";
import Myprofile from "./components/pages/Myprofile";
import Trending from "./components/pages/Trending";
import Home from "./components/pages/Home";
import SignUp from "./components/pages/SignUp";
import AboutUs from "./components/pages/AboutUs";
import { createContext, useEffect, useState } from "react";
import axios from "axios";
import RecommendedDish from "./components/pages/RecommendedDish";
import { ToastContainer } from 'react-toastify';

import AllergySeverity from "./components/pages/AllergySeverity";

export const SignInContext = createContext(false);

function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  useEffect(() => {
    //stay logged in after a page refresh if the login cookie is still valid
    axios({
      method: "get",
      url: "/api/user/uid",
    })
      .then((response) => {
        setLoggedIn(Boolean(response.data.userID));
      })
      .catch((error) => {
        console.error(error);
      });
  }, []);

  return (
    <>
      <Router>
        <Navbar />
        <Switch>
          <Route path="/" exact component={Home} />

          <Route
            path="/myprofile"
            exact
            render={() => (
              <SignInContext.Provider value={loggedIn}>
                <Myprofile />
              </SignInContext.Provider>
            )}
          />
          <Route path="/trending" component={Trending} />
          <Route
            path="/sign-up"
            exact
            render={() => (
              <SignUp loggedIn={loggedIn} setLoggedIn={setLoggedIn} />
            )}
          />
          <Route path="/aboutus" component={AboutUs} />
          <Route
            path="/recommendeddish"
            exact
            render={() => <RecommendedDish loggedIn={loggedIn} />}
          />
          <Route path="/allergyseverity" component={AllergySeverity} />
        </Switch>
      </Router>
      <ToastContainer />
    </>
  );
}

export default App;
