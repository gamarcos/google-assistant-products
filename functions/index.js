// See https://github.com/dialogflow/dialogflow-fulfillment-nodejs
// for Dialogflow fulfillment library docs, samples, and to report issues
'use strict';

const service = require('./service/service')
const config = require('./config/config')

const functions = require('firebase-functions');
const { WebhookClient } = require('dialogflow-fulfillment');
const { Card, Suggestion } = require('dialogflow-fulfillment');
const { BasicCard, Button, Image, List } = require('actions-on-google');

const admin = require("firebase-admin");
const serviceAccount = require("./config/meetups-853ac-firebase-adminsdk-rrfy9-917874b229.json");

process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: config.DATABASE_URL
});

const dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
    const agent = new WebhookClient({ request, response });
    console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
    console.log('Dialogflow Request body: ' + JSON.stringify(request.body));

    let conv = agent.conv();

    if (conv !== null && conv.data.meetupData === undefined) {
        conv.data.meetupData = [];
    }

    if (conv !== null && conv.data.productsOnPromotions === undefined) {
        conv.data.productsOnPromotions = [];
    }

    if (conv !== null && conv.data.productsSearch === undefined) {
        conv.data.productsSearch = [];
    }

    if (conv !== null && conv.data.productsNumber === undefined) {
        conv.data.productsNumber = 0;
    } 

    const hasScreen = conv !== null && conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT');
    const hasAudio = conv !== null && conv.surface.capabilities.has('actions.capability.AUDIO_OUTPUT');

    function checkIfGoogle(agent) {
        let isGoogle = true;
        if (conv === null) {
            agent.add(`Only requests from Google Assistant are supported.
        Find the XXX action on Google Assistant directory!`);
            isGoogle = false;
        }
        return isGoogle;
    }

    function welcome(agent) {
        agent.add(`Hi nice to meet you! I'm Nat! I'm here to help you get the best deals and offers. How can I help you today?`);
    }

    function fallback(agent) {
        agent.add(`I didn't understand`);
        agent.add(`I'm sorry, can you try again?`)
    }

    async function listMeetups(agent) {
        if (checkIfGoogle(agent)) {
            let response = await getMeetupList();
            agent.add(response);
        }
    }

    async function listPromotions(agent) {
        if (checkIfGoogle(agent)) {
            let response = await getPromotionalProducts();
            console.log(response)
            console.log(agent)
            agent.add(response);
        }
    }

    async function listProducts(agent) {
        if (checkIfGoogle(agent)) {
            let response = await getProducts();
            agent.add(response);
        }
    }

    async function getMeetupList() {
        conv.data.meetupCount = 0;
        if (conv.data.meetupData.length === 0) {
            const meetups = await service.requestMeetups()
            if (meetups.hasOwnProperty('events')) {
                saveMeetupsData(meetups.events);
            }
            return buildMeetupListResponse()
        } else {
            return buildMeetupListResponse();
        }
    }

    async function getPromotionalProducts() {
        conv.data.productsOnPromotions = []
        
        if (conv.data.productsOnPromotions.length === 0) {
            const data = await service.requestProducts();
            saveProductsInPromotions(data)
            console.log('Get Promotional True data' + data)
            console.log('Get Promotional True' + conv.data.productsOnPromotions)
            return buildPromotionListResponse();
        } else {
            console.log('Get Promotional False' + conv.data.productsOnPromotions)
            return buildPromotionListResponse();
        }
    }

    async function getProducts() {
        let productName = agent.parameters['products']
        let page = 1

        conv.data.productsSearch = []

        console.log('Get Products ' + productName, page)
        console.log('Products in cache', conv.data.productsSearch.length)
        if (conv.data.productsSearch.length === 0) {
            const products = await service.searchProductsRequest(productName, page)
            saveProductsSearch(products)
            console.log('Quantidade de PRodutos: ' + products.products.length)
            if (products.products.length === 1) {
                conv.data.productsNumber = 0;
                return buildSingleProduct()
            } else {
                return buildProductsFound()
            }
            
        } else {
            return buildProductsFound()
        }
    }

    async function selectedItemSearch(agent) {
        if (checkIfGoogle(agent)) {
            console.log('Produto Selecionado: ' + conv.data.productsNumber)
            let option = agent.contexts.find(function (obj) {
                return obj.name === 'actions_intent_option'
            })
            if (option && option.hasOwnProperty('parameters') && option.parameters.hasOwnProperty('OPTION')) {
                conv.data.productsNumber = parseInt(option.parameters.OPTION.replace('product ', ''));
            }
            console.log('Produto Selecionado: ' + conv.data.productsNumber)
            let response = await buildSingleProduct();
            agent.add(response);
        }
    }

    async function selectedPromotionsItem(agent) {
        if (checkIfGoogle(agent)) {
            console.log('Produto Selecionado: ' + conv.data.productsNumber)
            let option = agent.contexts.find(function (obj) {
                return obj.name === 'actions_intent_option'
            })
            if (option && option.hasOwnProperty('parameters') && option.parameters.hasOwnProperty('OPTION')) {
                conv.data.productsNumber = parseInt(option.parameters.OPTION.replace('product ', ''));
            }
            console.log('Produto Selecionado: ' + conv.data.productsNumber)
            let response = await displayCard();
            agent.add(response);
        }
    }

    async function displayCard() {
        console.log("Display Cards", conv.data.productsOnPromotions)
        if (conv.data.productsOnPromotions.length === 0) {
            return buildSingleCards();
        } else {
            return buildSingleCards();
        }
    }

    function buildSingleProduct() {
        console.log('Single Card Products Passo 1' + parseInt(conv.data.productsNumber))
        let responseToUser;
        if (conv.data.productsSearch.products.length === 0 ) {
            console.log('Single Card Products Passo 2' + parseInt(conv.data.productsNumber))
            responseToUser = 'No products on promotions available at this time!';
            conv.close(responseToUser)
        } 
        let product = conv.data.productsSearch.products[parseInt(conv.data.productsNumber)];
        responseToUser += ' Write or say next meetup to see more.';
        
        console.log('Single Card Products Passo 3' + parseInt(conv.data.productsNumber))

        if ( hasAudio ) {
            
        console.log('Single Card Products Passo 4' + parseInt(conv.data.productsNumber))
            let ssmlText = '<speak>' +
                ' Is ' + product.friendlyName + '. <break time="1" />' +
                ' By ' + product.tagline + '. <break time="1" />' +
                '<break time="600ms" />For more visit website. <break time="800ms" />' +
                '</speak>';
            conv.ask(ssmlText.replace('&', ' and '));
        } else {
            
        console.log('Single Card Products Passo 5' + parseInt(conv.data.productsNumber))
            conv.ask(responseToUser);
        }
        if (hasScreen) {
            
        console.log('Single Card Products Passo 5' + parseInt(conv.data.productsNumber))
            conv.ask(new BasicCard({
                text: product.tagline,
                subtitle: 'This is a subtitle',
                title: product.friendlyName,
                buttons: new Button({
                    title: 'Read more',
                    url: 'http://rede.natura.net'+product.childSKUs[0].productUrl,
                }),
                image: new Image({
                    url: 'http://rede.natura.net' + product.productImages[0].listingImageUrl,
                    alt: product.friendlyName,
                }),
                display: 'CROPPED',
            }));
        }
        
        console.log('Single Card Products Passo 7' + parseInt(conv.data.productsNumber))
        return conv;
    }

    function buildSingleCards() {
        console.log('Single Card ' +conv.data.productsOnPromotions[parseInt(conv.data.productsNumber)])
        let responseToUser;
        if (conv.data.productsOnPromotions.length === 0 ) {
            responseToUser = 'No products on promotions available at this time!';
            conv.close(responseToUser)
        } 
        let product = conv.data.productsOnPromotions[parseInt(conv.data.productsNumber)];
        responseToUser += ' Write or say next meetup to see more.';

        if ( hasAudio ) {
            let ssmlText = '<speak>' +
                ' Is ' + product.name + '. <break time="1" />' +
                ' By ' + product.description + '. <break time="1" />' +
                '<break time="600ms" />For more visit website. <break time="800ms" />' +
                '</speak>';
            conv.ask(ssmlText.replace('&', ' and '));
        } else {
            conv.ask(responseToUser);
        }
        if (hasScreen) {
            console.log(`show all params in cards ${product.description}, ${product.name}, ${product.productsVariants[0].media[0].url}`)
            conv.ask(new BasicCard({
                text: product.description,
                subtitle: 'This is a subtitle',
                title: product.name,
                buttons: new Button({
                    title: 'Read more',
                    url: 'http://rede.natura.net'+product.productsVariants[0]._links.productUrl.href,
                }),
                image: new Image({
                    url: 'http://rede.natura.net' + product.productsVariants[0].media[0].url,
                    alt: product.name,
                }),
                display: 'CROPPED',
            }));
        }
        return conv;
    }


    function buildProductsFound() {
        let responseToUser;
        if (conv.data.productsSearch.products.length === 0) {
            responseToUser = 'No products available at this time!';
            conv.close(responseToUser);
        } else {
            let textList = 'This is a list of products. Please select one of them to proceed';
            let ssmlText = '<speak>This is a list of products. ' +
                'Please select one of them. <break time="1500ms" />';

            let items = {};
            for (let i = 0; i < conv.data.productsSearch.products.length; i++) {
                let product = conv.data.productsSearch.products[i];
                if (hasScreen) {
                    items[i] = {
                        title: product.friendlyName,
                        description: product.description,
                        image: new Image({
                            url: 'http://rede.natura.net' + product.productImages[0].listingImageUrl,
                            alt: product.friendlyName,
                        }),
                    }
                }
            }
            ssmlText += '</speak>';

            if (hasAudio) {
                conv.ask(ssmlText.replace('&', ' and '));
            } else {
                conv.ask(textList);
                conv.ask(responseToUser);
            }

            if (hasScreen) {
                conv.ask(new List({
                    title: 'Products Find: ',
                    items
                }));
            }
        }
        return conv;
    }

    function buildPromotionListResponse() {
        let responseToUser;
        console.log('buildPromotionListResponse: '+ conv.data.productsOnPromotions.length)
        if (conv.data.productsOnPromotions.length === 0) {
            responseToUser = 'No products available at this time!';
            conv.close(responseToUser);
        } else {
            let textList = 'This is a list of products. Please select one of them to proceed';
            let ssmlText = '<speak>This is a list of products. ' +
                'Please select one of them. <break time="1500ms" />';

            let items = {};
            for (let i = 0; i < conv.data.productsOnPromotions.length; i++) {
                let product = conv.data.productsOnPromotions[i];
                if (hasScreen) {
                    items[i] = {
                        title: product.name,
                        description: product.description,
                        image: new Image({
                            url: 'http://rede.natura.net' + product.productsVariants[0].media[0].url,
                            alt: product.name,
                        }),
                    }
                }
            }
            ssmlText += '</speak>';

            if (hasAudio) {
                conv.ask(ssmlText.replace('&', ' and '));
            } else {
                conv.ask(textList);
                conv.ask(responseToUser);
            }

            if (hasScreen) {
                conv.ask(new List({
                    title: 'Products Find: ',
                    items
                }));
            }
        }
        return conv;
    }

    function buildMeetupListResponse() {
        let responseToUser;

        if (conv.data.meetupData.length === 0) {
            responseToUser = 'No meetups available at this time!';
            conv.close(responseToUser);
        } else {
            let textList = 'This is a list of meetups. Please select one of them to proceed';
            let ssmlText = '<speak>This is a list of meetups. ' +
                'Please select one of them. <break time="1500ms" />';
            let items = {};
            for (let i = 0; i < conv.data.meetupData.length; i++) {
                let meetup = conv.data.meetupData[i];
                if (hasScreen) {
                    items['meetup ' + i] = {
                        title: 'meetup ' + (i + 1),
                        description: meetup.name,
                        image: new Image({
                            url: 'https://raw.githubusercontent.com/jbergant/udemydemoimg/master/meetupS.png',
                            alt: meetup.name,
                        }),
                    }
                }
                responseToUser = 'This is the meetups, that i find for you.'
            }
            ssmlText += '</speak>';

            if (hasAudio) {
                conv.ask(ssmlText.replace('&', ' and '));
            } else {
                conv.ask(textList);
                conv.ask(responseToUser);
            }

            if (hasScreen) {
                conv.ask(new List({
                    title: 'List of meetups: ',
                    items
                }));
            }

        }
        return conv;
    }

    function saveMeetupsData(data) {
        if (conv !== null) {
            conv.data.meetupData = data;
        }
    }

    function saveProductsSearch(data) {
        if (conv !== null) {
            conv.data.productsSearch = data;
        }
    }

    function saveProductsInPromotions(data) {
        if (conv !== null) {
            conv.data.productsOnPromotions = data;
        }
    }

    // Run the proper function handler based on the matched Dialogflow intent name
    let intentMap = new Map();
    intentMap.set('Default Welcome Intent', welcome);
    intentMap.set('Default Fallback Intent', fallback);
    intentMap.set('show meetups', listMeetups)
    intentMap.set('promotions', listPromotions)
    intentMap.set('Search Products', listProducts)
    intentMap.set('promotions - select.number', selectedPromotionsItem)
    intentMap.set('Search Products - select.number', selectedItemSearch)
    agent.handleRequest(intentMap);
});

const requestPromotionalProducts = functions.https.onRequest((request, response) => {
    response.send(service.requestProducts())
})

const requestMeetups = functions.https.onRequest((request, response) => {
    response.send(service.requestMeetups())
})

const requestFinder = functions.https.onRequest((request, response) => {
    response.send(service.searchProductsRequest('   ', 2))
})

module.exports = {
    dialogFlow: dialogflowFirebaseFulfillment,
    requestPromotionalProducts: requestPromotionalProducts,
    requestMeetups: requestMeetups,
    requestFinder: requestFinder
}