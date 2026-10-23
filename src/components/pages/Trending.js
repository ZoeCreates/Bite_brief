import '../../App.css';
import React, { useState, useEffect } from 'react';
import './Trending.css';
import axios from 'axios';

const Trending = () => {
  const [popularItems, setPopularItems] = useState([]);

  useEffect(() => {
    axios({
        method: 'post',
        url: '/api/favdishes',
    }) 
      .then(response => {
        setPopularItems(Array.isArray(response.data) ? response.data : []);
      })
      .catch(error => {
        console.error(error);
      });
  }, []);

  return (
    <div className="trending-container">
      <h1 className='trending'>WHAT'S TRENDING</h1>
      <div className="popular-items">
        {popularItems.slice(0, 10).map((item, index) => (
          <div className="item" key={index}>
            <span className="item-name">{item.name}</span>
            <span className="item-likes">
              <i className="fas fa-heart"></i> {item.likes}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Trending;