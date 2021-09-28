import { inferMeals, humanFormatDay, guessDietaryAction, getNextMealDay, MealRequest, guessAskingForAReminder, guessCancellingReminder, nowInServeryTimezone, formatDurationAsTime, getBestDateTime } from "./nlp.js";
import { Meal, openDb, User } from "./database.js";
import { mealsDisplay } from "./food.js";
import { callSendAPI } from "./messenger/utils.js";
import { Duration, Interval } from "luxon";

const greetings = ["Howdy!", "Hey!", "Hi!", "Hello!"];

const helperReplies = () => {
    return [
        {
            content_type: "text",
            title: humanFormatDay(getNextMealDay('dinner')) + "'s menu",
            payload: '{}',
        },
        {
            content_type: "text",
            title: humanFormatDay(getNextMealDay('dinner').plus({ days: 1 })),
            payload: '{}',
        },
        {
            content_type: "text",
            title: "send every morning",
            payload: '{}',
        },
    ];
};

const quickRepliesAfterAnswering = (user, mealRequest) => {
    let replies = [];
    if(typeof user.payload.once_off_dietary_override === 'undefined') {
        replies.push({
            content_type: "text",
            title: user.shouldShowVego() ? 'always hide vego' : 'show vego options',
            payload: JSON.stringify(user.shouldShowVego() ? {} : { once_off_dietary_override: User.SHOW_ALL, original_request: mealRequest.serialize() }),
        });
    } else {
        // we have a dietary override enabled atm,
        // give the user options to make that permanent
        replies.push({
            content_type: "text",
            title: user.shouldShowVego() ? 'always show vego' : 'always hide vego',
            payload: JSON.stringify({}),
        });
    }

    return replies;
};

function getReminderTimeButtons() {
    return [
        {
            "type": "postback",
            "title": "7:00am",
            "payload": JSON.stringify({ remind_at_time: Duration.fromObject({ hours: 7 }).toISOTime() })
        },
        {
            "type": "postback",
            "title": "8:00am",
            "payload": JSON.stringify({ remind_at_time: Duration.fromObject({ hours: 8 }).toISOTime() })
        },
        {
            "type": "postback",
            "title": "custom time",
            "payload": JSON.stringify({ should_select_reminder_time: true })
        },
    ]
}

function getTentativeReminderButtons() {
    return [
        {
            "type": "postback",
            "title": "Enter another time",
            "payload": JSON.stringify({ should_select_reminder_time: true })
        },
        {
            "type": "postback",
            "title": "Cancel",
            "payload": JSON.stringify({ cancel_subscription: true })
        },
    ]
}

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
                    response += mealDisplay + ": " + dishes.join("\n");
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

async function handleSentiments(user, receivedMessage, db) {
    const greeting = firstTrait(receivedMessage.nlp, "wit$greetings");
    if (greeting && greeting.confidence > 0.8) {
        await callSendAPI(user.psid, {
            message: {
                text: getRandomGreeting() + "\nHere are some suggestions to start:",
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

    const sentiment = firstTrait(receivedMessage.nlp, "wit$sentiment");
    if (sentiment && sentiment.value === 'negative' && sentiment.confidence > 0.6) {
        await callSendAPI(user.psid, {
            message: { text: "Your sentiment was: " + sentiment.value },
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

    // if(receivedMessage.nlp.entities) {
    //     for(const [key, entity] of Object.entries(receivedMessage.nlp.entities)) {
    //         console.log(key, entity);
    //     }
    // }

    const dietaryAction = guessDietaryAction(receivedMessage.text);
    if(dietaryAction !== null) {
        if(typeof user.payload.once_off_dietary_override === 'undefined') {
            await user.setDietaryPrefs(db, dietaryAction.dietary_preference);
            await callSendAPI(user.psid, {
                message: { text: dietaryAction.dietary_preference === User.SHOW_ALL
                    ? "Great! I'll show you all dietary options from now on."
                    : "Got it! I'll hide the vego option from now on!" },
            });
            return true;
        }
        console.warn('Responding to quick reply, not setting permanent dietary settings');
    }

    if(guessCancellingReminder(receivedMessage.text)) {
        await user.setSubscription(db, User.NOT_SUBSCRIBED, null);
        await callSendAPI(user.psid, {
            message: {
                text: "We've unsubscribed you from the menu.",
                quick_replies: [
                    {
                        content_type: "text",
                        title: "Subscribe again",
                        payload: '{}',
                    },
                ]
            }
        });
        return true;
    }

    if(guessAskingForAReminder(receivedMessage.text) || user.payload.requested_subscription === true) {
        if(user.subscription !== User.NOT_SUBSCRIBED) {
            await callSendAPI(user.psid, {
                message: {
                    text: "Looks like you're already subscribed to the menu.",
                    quick_replies: [
                        {
                            content_type: "text",
                            title: "Unsubscribe",
                            payload: '{}',
                        },
                    ]
                }
            });
        } else {
            await callSendAPI(user.psid, {
                message: {
                    attachment: {
                        type: 'template',
                        payload: {
                            template_type: 'button',
                            text: "The Servery can send you a message each morning with the day's menu. When would you like to recieve this message?",
                            buttons: getReminderTimeButtons()
                        }
                    }
                },
            });
        }
        return true;
    }

    const dateTime = getBestDateTime(receivedMessage);
    if(user.needsSubscriptionTime()) {
        if(dateTime === null) {
            await callSendAPI(user.psid, { message: { text: "Sorry, please enter the time you'd like to recieve the menu, e.g.: '6:30am'" } });
        } else {
            let startOfDay = dateTime.startOf('day');
            let time = Interval.fromDateTimes(startOfDay, dateTime).toDuration();
            subscribeUser(db, user, time);
        }
        return true;
    }

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

export async function menuReply(db, request, user, tag, concatReplies) {
    console.log("Understood request: " + request.date.toISO() + " meal: " + request.meal);

    const meals = await Meal.lookup(db, request);
    let replies = composeMealsReply(user, meals);
    console.log(replies);
    if(concatReplies === true) {
        replies = [replies.join("\n")];
    }
    console.log(replies, concatReplies);

    for(let i = 0; i < replies.length; i++) {
        let response = { message: { text: replies[i] } };
        if(i === replies.length - 1) {
            response.message.quick_replies = quickRepliesAfterAnswering(user, request);
        }
        if(tag) {
            response.tag = tag;
            response.messaging_type = "MESSAGE_TAG";
        }
        await callSendAPI(user.psid, response);
        process.stdout.write(".");
    }
    process.stdout.write("\n");
}

// Handles messages events
export async function handleMessage(senderPsid, receivedMessage) {
    // this may make the whole process slower, but looks better...
    await callSendAPI(senderPsid, { sender_action: "mark_seen" });
    callSendAPI(senderPsid, { sender_action: "typing_on" });

    const db = await openDb();
    const user = await User.getByPsid(db, senderPsid);

    try {
        if(receivedMessage.quick_reply.payload) {
            user.setPayload(JSON.parse(receivedMessage.quick_reply.payload));
        }
    } catch(e) {
        console.warn('Failed to parse message payload ', receivedMessage.payload);
    }

    // Checks if the message contains text
    if (receivedMessage.text) {
        if(await handleSentiments(user, receivedMessage, db)) {
            // already responded
            return;
        }

        let inferred = null;

        if(typeof user.payload.original_request !== 'undefined') {
            inferred = MealRequest.unserialize(user.payload.original_request);
        } else {
            inferred = inferMeals(receivedMessage);
        }

        if (inferred === null) {
            await defaultReply(user);
            return;
        }

        await menuReply(db, inferred, user);
        return;
    }
    await defaultReply(user);
}

export async function subscribeUser(db, user, time) {
    await user.setSubscription(db, User.SUBSCRIBED_DAILY, time);
    await callSendAPI(user.psid, {
        message: {
            attachment: {
                type: 'template',
                payload: {
                    template_type: 'button',
                    text: "Got it! We'll send you the menu at " + formatDurationAsTime(time) + " each day. If that doesn't sound right, press one of the buttons below",
                    buttons: getTentativeReminderButtons()
                }
            }
        }
    });
}

// Handles messaging_postbacks events
export async function handlePostback(senderPsid, receivedPostback) {
    let response;
    const db = await openDb();
    const user = await User.getByPsid(db, senderPsid);

    // Get the payload for the postback
    let payload = {};
    try {
        payload = JSON.parse(receivedPostback.payload);
    } catch(e) {
        console.warn('Invalid payload', receivedPostback.payload);
    }

    console.log('Postback payload', payload);

    // Set the response based on the postback payload
    if (payload.should_select_reminder_time === true) {
        response = { text: "What time would you like to recieve the menu each day? Reply with a time, e.g.: 6:30am" };
        await user.setSubscription(db, User.SUBSCRIBED_DAILY, null);
    } else if (payload.remind_at_time) {
        let time = Duration.fromISOTime(payload.remind_at_time);
        await subscribeUser(db, user, time);
        return;
    } else if(payload.cancel_subscription === true) {
        await user.setSubscription(db, User.NOT_SUBSCRIBED, null);
        response = {
            text: "Setup cancelled.",
            quick_replies: [
                {
                    content_type: "text",
                    title: "Try setup again",
                    payload: JSON.stringify({ requested_subscription: true }),
                },
            ]
        };
    } else {
        response = { text: "Sorry, I didn't understand that response." };
    }
    // Send the message to acknowledge the postback
    await callSendAPI(senderPsid, { message: response });
}

