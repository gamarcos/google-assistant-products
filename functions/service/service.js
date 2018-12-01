const config = require('../config/config');
const requestAPI = require('request-promise')

require('dotenv').config()

const urlRequest = config.MEETUP_URL+process.env.MEETUP_KEY 

function searchProductsRequest(productName, position) {
  const options = {
    method: 'POST',
    uri: config.SEARCH_URL,
    headers: {
      'Content-Type': 'application/json',
      'client_id': process.env.SEARCH_CLIENT_ID,
      'access_token': process.env.SEARCH_ACCESS_TOKEN,
      'siteId': 'natura-site',
      'hash': process.env.SEARCH_HASH,
      'app-version': 'ANDROID-4.6.9(187)',
    },
    body: {
      request: {
        query: productName,
        limit: 5,
        offset: position
      }
    },
    json: true 
  }
  return requestAPI(options)
  .then(function (data) {
    console.log(data.products)
    return data
  }).catch(function (err) {
      console.log('No products find')
      console.log(err)
  })
}

function requestProducts() {
  console.log('CLIENT ID: '+process.env.SEARCH_CLIENT_ID)
  const options = {
    uri: config.PROMOTIONS_URL,
    headers: {
      'Content-Type': 'application/json',
      'client_id': process.env.SEARCH_CLIENT_ID,
      'access_token': process.env.SEARCH_ACCESS_TOKEN,
      'siteId': 'natura-site',
      'hash': process.env.SEARCH_HASH,
      'app-version': 'ANDROID-4.6.9(187)',
      'sales_channel': 'ecommerce',
      '_dynSessConf': process.env.PROMOTION_DYN
    }
  }
  
  return requestAPI(options)
  .then(function (data) {
    let products = JSON.parse(data)
    console.log(products)
    return products
  }).catch(function (err) {
      console.log('No products find')
      console.log(err)
  })
}

function requestMeetups() {
  if (!config.MEETUP_KEY) {
    throw new Error('missing MEETUP_KEY')
  } else {
    console.log(urlRequest)
    return requestAPI(urlRequest)
    .then(function (data) {
      let meetups = JSON.parse(data);
      console.log(meetups)
    }).catch(function (err) {
        console.log('No meetups data');
        console.log(err);
    });
  }
}

module.exports = {
  requestMeetups:requestMeetups,
  requestProducts: requestProducts,
  searchProductsRequest: searchProductsRequest
}