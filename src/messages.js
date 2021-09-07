import { inferMeals, humanFormatDay } from './nlp.js';
import { lookupMeals } from "./database.js";
import got from "got";
import { mealsDisplay } from './food.js';
import { DateTime } from 'luxon';

const greetings = ["Howdy!", "Hey!", "Hi!", "Hello!"];

const helperReplies = () =>  {
    const today = DateTime.fromObject({}, { zone: process.env.SERVERY_TIMEZONE });
    return [
        {
            "content_type":"text",
            "title": humanFormatDay(today.plus({ days: 1 })) + "'s menu",
            "payload": "1day"
        },
        {
            "content_type":"text",
            "title": humanFormatDay(today.plus({ days: 2 })) + "'s menu",
            "payload": "2days"
        }
    ];
}    ;

export function getRandomGreeting() {
    return greetings[Math.floor(Math.random() * greetings.length)];
}

function composeMealsReply(meals) {
    const prelude = [getRandomGreeting()];
    if(meals.length === 0) {
        return prelude.concat(["Sorry, I'll have to get back to you on that one."]);
    }
    if(meals.length > 1) {
        const humanDay = humanFormatDay(meals[0].date);
        prelude.push(`Here's the menu for ${humanDay}:`);
    }
    return prelude.concat([
        meals.map(meal => {
            const mealDisplay = mealsDisplay[meal.mealType];
            let dishes = meal.getMainDishes().map(dish => dish.description).join("\n");
            if(meals.length === 1) {
                return humanFormatDay(meal.date, mealDisplay) + " is " + dishes;
            }
            return mealDisplay + ": " + dishes;
        }).join("\n")
    ]);
}

function firstTrait(nlp, name) {
    return nlp && nlp.entities && nlp.traits[name] && nlp.traits[name][0];
}

// Handles messages events
export async function handleMessage(senderPsid, receivedMessage) {
    // this may make the whole process slower, but looks better...
    await callSendAPI(senderPsid, { sender_action: "mark_seen" });
    callSendAPI(senderPsid, { sender_action: "typing_on" });

    // Checks if the message contains text
    if (receivedMessage.text) {

        const greeting = firstTrait(receivedMessage.nlp, 'wit$greetings');
        if(greeting && greeting.confidence > 0.8) {
            await callSendAPI(senderPsid, { message: { text: getRandomGreeting(), 'quick_replies': helperReplies() } });
            return;
        }

        const thanks = firstTrait(receivedMessage.nlp, 'wit$thanks');
        if(thanks && thanks.confidence > 0.8) {
            await callSendAPI(senderPsid, { message: { text: 'No worries at all!' } });
            return;
        }

        const bye = firstTrait(receivedMessage.nlp, 'wit$bye');
        if(bye && bye.confidence > 0.8) {
            await callSendAPI(senderPsid, { message: { text: 'Good bye! Sorry to see you go.' } });
            return;
        }

        let inferred = inferMeals(receivedMessage);

        if(inferred === null) {
            // Send the response message
            await callSendAPI(senderPsid, { message: { text: `Sorry, I couldn't understand your message. Try some of these suggestions to start.`, 'quick_replies': helperReplies() } });
        } else {
            console.log('Inferred req', inferred);

            const meals = await lookupMeals(inferred);

            console.log(meals);
            const replies = composeMealsReply(meals);
            console.log('Sending replies to user', replies);

            for(const reply of replies) {
                await callSendAPI(senderPsid, { message: { text: reply } });
            }
        }
    } else if (receivedMessage.attachments) {
        // Get the URL of the message attachment
        let attachmentUrl = receivedMessage.attachments[0].payload.url;
        let response = {
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
    return got.post(
        "https://graph.facebook.com/v2.6/me/messages",
        {
            searchParams: { access_token: PAGE_ACCESS_TOKEN },
            json: requestBody
        }
    );
}
