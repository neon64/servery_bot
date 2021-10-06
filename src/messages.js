import {
    inferMeals,
    humanFormatDay,
    guessDietaryAction,
    getNextMealDay,
    MealRequest,
    guessAskingForAReminder,
    guessCancellingReminder,
    formatDurationAsTime,
    getBestDateTime,
} from "./nlp.js";
import { Meal, openDb, User } from "./database.js";
import { mealsDisplay } from "./food.js";
import { Duration, Interval } from "luxon";
import log from "npmlog";

const greetings = ["Howdy!", "Hey!", "Hi!", "Hello!"];

const helperReplies = () => {
    return [
        {
            content_type: "text",
            title: humanFormatDay(getNextMealDay("dinner")) + "'s menu",
            payload: "{}",
        },
        {
            content_type: "text",
            title: humanFormatDay(getNextMealDay("dinner").plus({ days: 1 })),
            payload: "{}",
        },
        {
            content_type: "text",
            title: "send every morning",
            payload: "{}",
        },
    ];
};

const quickRepliesAfterAnswering = (
    user,
    mealRequest,
    showUnsubscribe,
    empty
) => {
    if (empty) {
        return [];
    }

    let replies = [];
    if (typeof user.payload.once_off_dietary_override === "undefined") {
        replies.push({
            content_type: "text",
            title: user.shouldShowVego()
                ? "Always hide vego"
                : "Show vego options",
            payload: JSON.stringify(
                user.shouldShowVego()
                    ? {}
                    : {
                          once_off_dietary_override: User.SHOW_ALL,
                          original_request: mealRequest.serialize(),
                      }
            ),
        });
    } else {
        // we have a dietary override enabled atm,
        // give the user options to make that permanent
        replies.push({
            content_type: "text",
            title: user.shouldShowVego()
                ? "Always show vego"
                : "Always hide vego",
            payload: JSON.stringify({}),
        });
    }

    if (showUnsubscribe) {
        replies.push({
            content_type: "text",
            title: "Unsubscribe",
            payload: JSON.stringify({}),
        });
    }

    return replies;
};

function getReminderTimeButtons() {
    return [
        {
            type: "postback",
            title: "7:00am",
            payload: JSON.stringify({
                remind_at_time: Duration.fromObject({ hours: 7 }).toISOTime(),
            }),
        },
        {
            type: "postback",
            title: "8:00am",
            payload: JSON.stringify({
                remind_at_time: Duration.fromObject({ hours: 8 }).toISOTime(),
            }),
        },
        {
            type: "postback",
            title: "custom time",
            payload: JSON.stringify({ should_select_reminder_time: true }),
        },
    ];
}

function getTentativeReminderButtons() {
    return [
        {
            type: "postback",
            title: "Enter another time",
            payload: JSON.stringify({ should_select_reminder_time: true }),
        },
        {
            type: "postback",
            title: "Cancel",
            payload: JSON.stringify({ cancel_subscription: true }),
        },
    ];
}

export function getRandomGreeting() {
    return greetings[Math.floor(Math.random() * greetings.length)];
}

function composeMealsReply(user, meals) {
    const prelude = [getRandomGreeting()];
    if (meals.length === 0) {
        return {
            messages: prelude.concat([
                "Sorry, my search returned 0 results.\nNote: the Servery only publishes its menu week-by-week.\nPerhaps you've asked too far into the future? ",
            ]),
            empty: true,
        };
    }
    if (meals.length > 1) {
        const humanDay = humanFormatDay(meals[0].date);
        prelude.push(`Here's the menu for ${humanDay}:`);
    }
    return {
        messages: prelude.concat(
            meals.map((meal) => {
                const mealDisplay = mealsDisplay[meal.mealType];
                let dishes = meal
                    .getMainDishes()
                    .map((dish) => dish.description);
                let vego = meal.getVegoDishes().map((dish) => dish.description);
                let response = "";
                if (meals.length === 1) {
                    response +=
                        humanFormatDay(meal.date, mealDisplay) +
                        " is " +
                        dishes.join("\n");
                } else {
                    response += mealDisplay + ": " + dishes.join("\n");
                }
                if (user.shouldShowVego() && vego.length > 0) {
                    response += "\n" + vego.join("\n") + " (V)";
                }
                return response;
            })
        ),
        empty: false,
    };
}

function firstTrait(nlp, name) {
    return nlp && nlp.entities && nlp.traits[name] && nlp.traits[name][0];
}

async function handleSentiments(user, receivedMessage, db, reply) {
    const greeting = firstTrait(receivedMessage.nlp, "wit$greetings");
    if (greeting && greeting.confidence > 0.8) {
        await reply({
            message: {
                text:
                    getRandomGreeting() +
                    "\nHere are some suggestions to start:",
                quick_replies: helperReplies(),
            },
        });
        return true;
    }

    const thanks = firstTrait(receivedMessage.nlp, "wit$thanks");
    if (thanks && thanks.confidence > 0.8) {
        await reply({
            message: { text: "No worries at all!" },
        });
        return true;
    }

    const sentiment = firstTrait(receivedMessage.nlp, "wit$sentiment");
    if (
        sentiment &&
        sentiment.value === "negative" &&
        sentiment.confidence > 0.6
    ) {
        await reply({
            message: { text: "Your sentiment was: " + sentiment.value },
        });
        return true;
    }

    const bye = firstTrait(receivedMessage.nlp, "wit$bye");
    if (bye && bye.confidence > 0.8) {
        await reply({
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
    if (dietaryAction !== null) {
        if (typeof user.payload.once_off_dietary_override === "undefined") {
            await user.setDietaryPrefs(db, dietaryAction.dietary_preference);
            await reply({
                message: {
                    text:
                        dietaryAction.dietary_preference === User.SHOW_ALL
                            ? "Great! I'll show you all dietary options from now on."
                            : "Got it! I'll hide the vego option from now on!",
                },
            });
            return true;
        }
        log.warn(
            "subscribe",
            "Responding to quick reply, not setting permanent dietary settings"
        );
    }

    if (guessCancellingReminder(receivedMessage.text)) {
        await user.setSubscription(db, User.NOT_SUBSCRIBED, null);
        await reply({
            message: {
                text: "We've unsubscribed you from the menu.",
                quick_replies: [
                    {
                        content_type: "text",
                        title: "Subscribe again",
                        payload: "{}",
                    },
                ],
            },
        });
        return true;
    }

    if (
        guessAskingForAReminder(receivedMessage.text) ||
        user.payload.requested_subscription === true
    ) {
        if (user.subscription !== User.NOT_SUBSCRIBED) {
            await reply({
                message: {
                    text:
                        "Looks like you're already subscribed to receive the menu at " +
                        formatDurationAsTime(user.subscription_time) +
                        " each morning.",
                    quick_replies: [
                        {
                            content_type: "text",
                            title: "Unsubscribe",
                            payload: "{}",
                        },
                    ],
                },
            });
        } else {
            await reply({
                message: {
                    attachment: {
                        type: "template",
                        payload: {
                            template_type: "button",
                            text: "The Servery can send you a message each morning with the day's menu. When would you like to recieve this message?",
                            buttons: getReminderTimeButtons(),
                        },
                    },
                },
            });
        }
        return true;
    }

    const dateTime = getBestDateTime(receivedMessage);
    if (user.needsSubscriptionTime()) {
        if (dateTime === null) {
            await reply({
                message: {
                    text: "Sorry, please enter the time you'd like to recieve the menu, e.g.: '6:30am'",
                },
            });
        } else {
            let startOfDay = dateTime.startOf("day");
            let time = Interval.fromDateTimes(
                startOfDay,
                dateTime
            ).toDuration();
            await subscribeUser(db, user, time, reply);
        }
        return true;
    }

    return false;
}

async function defaultReply(reply) {
    await reply({
        message: {
            text: `Sorry, I couldn't understand your message. Try some of these suggestions to start.`,
            quick_replies: helperReplies(),
        },
    });
}

export async function menuReply(
    db,
    request,
    user,
    reply,
    showUnsubscribe,
    concatReplies
) {
    log.info(
        "messsages",
        "Understood request: " + request.date.toISO() + " meal: " + request.meal
    );

    const meals = await Meal.lookup(db, request);
    let response = composeMealsReply(user, meals);
    if (concatReplies === true) {
        response.messages = [response.messages.join("\n")];
    }

    log.info("messages", "sending %j", response.messages);
    const quickReplies = quickRepliesAfterAnswering(
        user,
        request,
        showUnsubscribe,
        response.empty
    );

    for (let i = 0; i < response.messages.length; i++) {
        let data = { message: { text: response.messages[i] } };
        if (i === response.messages.length - 1 && quickReplies.length > 0) {
            data.message.quick_replies = quickReplies;
        }
        await reply(data);
    }
}

// Handles messages events
export async function handleMessage(senderPsid, receivedMessage, reply) {
    // this may make the whole process slower, but looks better...
    await reply({ sender_action: "mark_seen" });
    reply({ sender_action: "typing_on" });

    const db = await openDb();
    const user = await User.getByPsid(db, senderPsid);

    log.info("messages", user.psid + ": " + receivedMessage.text);

    try {
        if (
            receivedMessage.quick_reply &&
            receivedMessage.quick_reply.payload
        ) {
            user.setPayload(JSON.parse(receivedMessage.quick_reply.payload));
        }
    } catch (e) {
        log.warn(
            "messages",
            "Failed to parse message payload %j",
            receivedMessage.quick_reply.payload
        );
    }

    // Checks if the message contains text
    if (receivedMessage.text) {
        if (await handleSentiments(user, receivedMessage, db, reply)) {
            // already responded
            return;
        }

        let inferred = null;

        if (typeof user.payload.original_request !== "undefined") {
            inferred = MealRequest.unserialize(user.payload.original_request);
        } else {
            inferred = inferMeals(receivedMessage);
        }

        if (inferred !== null) {
            await menuReply(db, inferred, user, reply);
            return;
        }
    }
    await defaultReply(reply);
}

export async function subscribeUser(db, user, time, reply) {
    await user.setSubscription(db, User.SUBSCRIBED_DAILY, time);
    await reply({
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "button",
                    text:
                        "Got it! We'll send you the menu at " +
                        formatDurationAsTime(time) +
                        " each day. If that doesn't sound right, press one of the buttons below",
                    buttons: getTentativeReminderButtons(),
                },
            },
        },
    });
}

// Handles messaging_postbacks events
export async function handlePostback(senderPsid, receivedPostback, reply) {
    const db = await openDb();
    const user = await User.getByPsid(db, senderPsid);

    // Get the payload for the postback
    let payload = {};
    try {
        payload = JSON.parse(receivedPostback.payload);
    } catch (e) {
        log.warn("messages", "Invalid payload %j", receivedPostback.payload);
    }

    log.info("messages", "Postback payload %j", payload);

    // Set the response based on the postback payload
    if (payload.should_select_reminder_time === true) {
        await user.setSubscription(db, User.SUBSCRIBED_DAILY, null);
        await reply({
            message: {
                text: "What time would you like to recieve the menu each day? Reply with a time, e.g.: 6:30am",
            },
        });
    } else if (payload.remind_at_time) {
        let time = Duration.fromISOTime(payload.remind_at_time);
        await subscribeUser(db, user, time, reply);
    } else if (payload.cancel_subscription === true) {
        await user.setSubscription(db, User.NOT_SUBSCRIBED, null);
        await reply({
            message: {
                text: "Setup cancelled.",
                quick_replies: [
                    {
                        content_type: "text",
                        title: "Try setup again",
                        payload: JSON.stringify({
                            requested_subscription: true,
                        }),
                    },
                ],
            },
        });
    } else {
        await reply({
            message: { text: "Sorry, I didn't understand that response." },
        });
    }
}
