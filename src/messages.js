import { inferMeals, humanFormatDay } from "./nlp.js";
import { Meal, openDb, User } from "./database.js";
import { mealsDisplay } from "./food.js";
import { DateTime } from "luxon";
import { callSendAPI } from "./messenger/utils.js";

const greetings = ["Howdy!", "Hey!", "Hi!", "Hello!"];

const helperReplies = () => {
    const today = DateTime.fromObject(
        {},
        { zone: process.env.SERVERY_TIMEZONE }
    );
    return [
        {
            content_type: "text",
            title: humanFormatDay(today.plus({ days: 1 })) + "'s menu",
            payload: "1day",
        },
        {
            content_type: "text",
            title: humanFormatDay(today.plus({ days: 2 })) + "'s menu",
            payload: "2days",
        },
    ];
};

export function getRandomGreeting() {
    return greetings[Math.floor(Math.random() * greetings.length)];
}

function composeMealsReply(user, meals) {
    const prelude = [getRandomGreeting()];
    if (meals.length === 0) {
        return prelude.concat([
            "Sorry, I'll have to get back to you on that one.",
        ]);
    }
    if (meals.length > 1) {
        const humanDay = humanFormatDay(meals[0].date);
        prelude.push(`Here's the menu for ${humanDay}:`);
    }
    return prelude.concat(
        meals
            .map((meal) => {
                const mealDisplay = mealsDisplay[meal.mealType];
                let dishes = meal
                    .getMainDishes()
                    .map((dish) => dish.description);
                let vego = meal.getVegoDishes()
                    .map((dish) => dish.description);
                let response = "";
                if (meals.length === 1) {
                    response += humanFormatDay(meal.date, mealDisplay) + " is " + dishes.join("\n");
                } else {
                    response += mealDisplay + ":\n" + dishes.join("\n");
                }
                if(user.shouldShowVego() && vego.length > 0) {
                    response += "\n" + vego.join("\n") + " (V)";
                }
                return response;
            })
    );
}

function firstTrait(nlp, name) {
    return nlp && nlp.entities && nlp.traits[name] && nlp.traits[name][0];
}

async function handleSentiments(user, receivedMessage) {
    const greeting = firstTrait(receivedMessage.nlp, "wit$greetings");
    if (greeting && greeting.confidence > 0.8) {
        await callSendAPI(user.psid, {
            message: {
                text: getRandomGreeting(),
                quick_replies: helperReplies(),
            },
        });
        return true;
    }

    const thanks = firstTrait(receivedMessage.nlp, "wit$thanks");
    if (thanks && thanks.confidence > 0.8) {
        await callSendAPI(user.psid, {
            message: { text: "No worries at all!" },
        });
        return true;
    }

    const bye = firstTrait(receivedMessage.nlp, "wit$bye");
    if (bye && bye.confidence > 0.8) {
        await callSendAPI(user.psid, {
            message: { text: "Good bye! Sorry to see you go." },
        });
        return true;
    }

    console.log(receivedMessage.nlp);

    return false;
}

async function defaultReply(user) {
    await callSendAPI(user.psid, {
        message: {
            text: `Sorry, I couldn't understand your message. Try some of these suggestions to start.`,
            quick_replies: helperReplies(),
        },
    });
}

// Handles messages events
export async function handleMessage(senderPsid, receivedMessage) {
    // this may make the whole process slower, but looks better...
    await callSendAPI(senderPsid, { sender_action: "mark_seen" });
    callSendAPI(senderPsid, { sender_action: "typing_on" });

    const db = await openDb();
    const user = await User.getByPsid(db, senderPsid);

    // Checks if the message contains text
    if (receivedMessage.text) {
        if(await handleSentiments(user, receivedMessage)) {
            // already responded
            return;
        }

        let inferred = inferMeals(receivedMessage);

        if (inferred === null) {
            await defaultReply(user);
            return;
        }

        console.log("Inferred req", inferred);

        const meals = await Meal.lookup(db, inferred);

        console.log(meals);
        const replies = composeMealsReply(user, meals);
        console.log("Sending replies to user", replies);

        for (const reply of replies) {
            await callSendAPI(senderPsid, { message: { text: reply } });
        }
        return;
    }
    await defaultReply(user);
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

