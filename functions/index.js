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

    if (conv !== null && conv.data.productsFound === undefined) {
        conv.data.productsFound = [];
    }

    if (conv !== null && conv.data.products === undefined) {
        conv.data.products = [];
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
        if (conv.data.productsFound.length === 0) {
            const data = await service.requestProducts();
            saveProducts(data)
            console.log('Get Promotional True data' + data)
            console.log('Get Promotional True' + conv.data.productsFound)
            return buildPromotionListResponse();
        } else {
            console.log('Get Promotional False' + conv.data.productsFound)
            return buildPromotionListResponse();
        }
    }

    async function getProducts() {
        let productName = agent.parameters['products']
        let page = 1

        console.log('Get Products ' + productName, page)
        if (conv.data.products.length === 0) {
            const products = await service.searchProductsRequest(productName, page)
            saveProductsFound(products)
            return buildProductsFound()
        } else {
            return buildProductsFound()
        }
    }

    async function selectedItemByNumber(agent) {
        if (checkIfGoogle(agent)) {
            let option = agent.contexts.find(function (obj) {
                return obj.name === 'actions_intent_option'
            })
            if (option && option.hasOwnProperty('parameters') && option.parameters.hasOwnProperty('OPTION')) {
                conv.data.productsNumber = parseInt(option.parameters.OPTION.replace('product ', ''));
            }
            console.log('Produto Selecionado: ' + conv.data.productsNumber)
            console.log('Produto encontrado: '+ conv.data.productsFound.length)
            let response = await displayCard();
            agent.add(response);
        }
    }

    async function displayCard() {
        if (conv.data.productsFound.length === 0) {
            await getMeetupData();
            return buildSingleCards();
        } else {
            return buildSingleCards();
        }
    }

    function buildSingleCards() {
        console.log('Single Card' +conv.data.productsFound[parseInt(conv.data.productsNumber)])
        let responseToUser;
        if (conv.data.productsFound.length === 0 ) {
            responseToUser = 'No products on promotions available at this time!';
            conv.close(responseToUser)
        } 
        let product = conv.data.productsFound[parseInt(conv.data.productsNumber)];
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
        if (conv.data.products.products.length === 0) {
            responseToUser = 'No products available at this time!';
            conv.close(responseToUser);
        } else {
            let textList = 'This is a list of products. Please select one of them to proceed';
            let ssmlText = '<speak>This is a list of products. ' +
                'Please select one of them. <break time="1500ms" />';

            let items = {};
            for (let i = 0; i < conv.data.products.products.length; i++) {
                let product = conv.data.products.products[i];
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
        if (conv.data.productsFound.length === 0) {
            responseToUser = 'No products available at this time!';
            conv.close(responseToUser);
        } else {
            let textList = 'This is a list of products. Please select one of them to proceed';
            let ssmlText = '<speak>This is a list of products. ' +
                'Please select one of them. <break time="1500ms" />';

            let items = {};
            for (let i = 0; i < conv.data.productsFound.length; i++) {
                let product = conv.data.productsFound[i];
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

    function saveProducts(data) {
        if (conv !== null) {
            conv.data.productsFound = data;
        }
    }

    function saveProductsFound(data) {
        if (conv !== null) {
            conv.data.products = data;
        }
    }

    // Run the proper function handler based on the matched Dialogflow intent name
    let intentMap = new Map();
    intentMap.set('Default Welcome Intent', welcome);
    intentMap.set('Default Fallback Intent', fallback);
    intentMap.set('show meetups', listMeetups)
    intentMap.set('promotions', listPromotions)
    intentMap.set('Search Products', listProducts)
    intentMap.set('promotions - select.number', selectedItemByNumber)
    agent.handleRequest(intentMap);
});

const requestPromotionalProducts = functions.https.onRequest((request, response) => {
    response.send(service.requestProducts())
})

const requestMeetups = functions.https.onRequest((request, response) => {
    response.send(service.requestMeetups())
})

const requestFinder = functions.https.onRequest((request, response) => {
    response.send(service.searchProductsRequest('kaiak', 2))
})

module.exports = {
    dialogFlow: dialogflowFirebaseFulfillment,
    requestPromotionalProducts: requestPromotionalProducts,
    requestMeetups: requestMeetups,
    requestFinder: requestFinder
}