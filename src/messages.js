import request from "request";

import { inferMeals } from './nlp.js';
import { lookupMeals } from "./database.js";

function composeMealsReply(meals) {
    return meals.map(meal => {
        return meal.getMainDishes().map(dish => dish.description).join("\n");
    });
}

// Handles messages events
export function handleMessage(senderPsid, receivedMessage) {
    let response;

    // Checks if the message contains text
    if (receivedMessage.text) {

        let inferred = inferMeals(receivedMessage);

        if(inferred === null) {
            // Send the response message
            callSendAPI(senderPsid, { message: { text: `Sorry, I'm not sure what you mean by that.` } });
        } else {
            console.log(inferred);

            const meals = lookupMeals(inferred);

            const replies = composeMealsReply(meals);

            for(const reply of replies) {
                callSendAPI(senderPsid, { message: { text: reply } });
            }
        }
    } else if (receivedMessage.attachments) {
        // Get the URL of the message attachment
        let attachmentUrl = receivedMessage.attachments[0].payload.url;
        response = {
            attachment: {
                type: "template",
                payload: {
                    template_type: "generic",
                    elements: [
                        {
                            title: "Is this the right picture?",
                            subtitle: "Tap a button to answer.",
                            image_url: attachmentUrl,
                            buttons: [
                                {
                                    type: "postback",
                                    title: "Yes!",
                                    payload: "yes",
                                },
                                {
                                    type: "postback",
                                    title: "No!",
                                    payload: "no",
                                },
                            ],
                        },
                    ],
                },
            },
        };

        callSendAPI(senderPsid, { message: response });
    }
}

// Handles messaging_postbacks events
export function handlePostback(senderPsid, receivedPostback) {
    let response;

    // Get the payload for the postback
    let payload = receivedPostback.payload;

    // Set the response based on the postback payload
    if (payload === "yes") {
        response = { text: "Thanks!" };
    } else if (payload === "no") {
        response = { text: "Oops, try sending another image." };
    }
    // Send the message to acknowledge the postback
    callSendAPI(senderPsid, { message: response });
}

// Sends response messages via the Send API
export function callSendAPI(senderPsid, response) {
    // The page access token we have generated in your app settings
    const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

    // Construct the message body
    let requestBody = {
        recipient: {
            id: senderPsid,
        },
        ...response,
    };

    // Send the HTTP request to the Messenger Platform
    request(
        {
            uri: "https://graph.facebook.com/v2.6/me/messages",
            qs: { access_token: PAGE_ACCESS_TOKEN },
            method: "POST",
            json: requestBody,
        },
        (err) => {
            if (!err) {
                console.log("Message sent!");
            } else {
                console.error("Unable to send message:" + err);
            }
        }
    );
}
