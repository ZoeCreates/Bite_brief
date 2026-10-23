// import React from "react";
// // Add any other imports you need, like styles or other components

// const AllergySeverity = () => {
//   return (
//     <div>
//       <h1>Allergy Severity Information</h1>
//     </div>
//   );
// };

// export default AllergySeverity;

import "../../App.css";
import React, { useState, useEffect } from "react";
import "./Trending.css";
import axios from "axios";

const AllergySeverity = () => {
  const [popularItems, setPopularItems] = useState([]);

  useEffect(() => {
    axios({
      method: "get",
      url: "/api/severeAllergies",
    })
      .then((response) => {
        setPopularItems(Array.isArray(response.data) ? response.data : []);
      })
      .catch((error) => {
        console.error(error);
      });
  }, []);

  return (
    <div className="trending-container">
      <h1 className="trending">Most Problematic Allergies (according to user input data)</h1>
      <div className="popular-items">
        {popularItems.slice(0, 10).map((item, index) => (
          <div className="item" key={index}>
            <span className="item-name">{item.name}</span>
            <span className="item-likes">{item.severity}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AllergySeverity;
