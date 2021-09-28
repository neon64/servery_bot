// To further interpret what the user means (on top of the built-in NLP service)

import { meals, mealsExpired } from "./food.js";
import { Interval, DateTime } from "luxon";
import { User } from "./database.js";

export function findMatchingMeal(text) {
    const lower = text.toLowerCase();
    for (const [search, replace] of Object.entries(meals)) {
        if (lower.includes(search)) {
            return replace;
        }
    }

    return null;
}

export function guessDietaryAction(text) {
    const lower = text.toLowerCase();
    if(!lower.includes("vegetarian") && !lower.includes("vego")) {
        return null;
    }

    if(lower.includes("hide") || lower.includes("skip") || lower.includes("no")) {
        return { dietary_preference: User.HIDE_VEGO };
    }
    return { dietary_preference: User.SHOW_ALL };
}

export function guessAskingForAReminder(text) {
    const lower = text.toLowerCase();
    if(lower.includes("remind") || lower.includes("send") || lower.includes("notify") || lower.includes("tell") || lower.includes("prompt") || lower.includes("subscribe")) {
        return true;
    }
    return false;
}

export function guessCancellingReminder(text) {
    const lower = text.toLowerCase();
    if(lower.includes("unsubscribe") || lower.includes("cancel") || lower.includes("stop") || lower.includes("do not") || lower.includes("don't")) {
        return true;
    }
    return false;
}

export const nowInServeryTimezone = () => {
    return DateTime.now().setZone(process.env.SERVERY_TIMEZONE);
};

export const getNextMealDay = (meal) => {
    const now = nowInServeryTimezone();
    const todayStart = now.startOf('day');
    const mealExpiryTime = mealsExpired[meal];
    const todayMealExpiry = todayStart.plus(mealExpiryTime);
    if (now > todayMealExpiry) {
        return todayStart.plus({ days: 1 });
    } else {
        return todayStart;
    }
};

export const humanFormatDay = (day, meal) => {
    const today = nowInServeryTimezone();
    const duration = Interval.fromDateTimes(today.startOf('day'), day.startOf('day')).toDuration();
    const days = duration.as("days");
    if (days == 0) {
        return (meal ? meal + " " : "") + "today";
    } else if (days == 1) {
        return (meal ? meal + " " : "") + "tomorrow";
    } else if (days <= 6) {
        return (meal ? meal + " on " : "") + day.toFormat("EEEE");
    } else {
        return (meal ? meal + " on " : "") + day.toFormat("EEEE MMMM d");
    }
};

export class MealRequest {
    constructor(date, meal) {
        this.date = date;
        this.meal = meal;
    }

    serialize() {
        return {
            date: this.date.toISO(),
            meal: this.meal
        }
    }

    static unserialize(object) {
        return new MealRequest(DateTime.fromISO(object.date, { zone: process.env.SERVERY_TIMEZONE }), object.meal);
    }
}

export function formatDurationAsTime(duration) {
    return nowInServeryTimezone().startOf('day').plus(duration).toFormat('h:mm a');
}

export function getBestDateTime(receivedMessage) {
    const datetimes = receivedMessage.nlp.entities["wit$datetime:datetime"];
    if (datetimes && datetimes.length > 0) {
        for (let dateReference of datetimes) {
            if (dateReference.confidence < 0.5) {
                console.warn("Skipping", dateReference);
                console.warn("Original message:", receivedMessage.text);
                continue;
            }

            let date;
            if (dateReference.type === "value") {
                date = DateTime.fromISO(dateReference.value, {
                    zone: process.env.SERVERY_TIMEZONE,
                });
            } else if (dateReference.type === "interval") {
                date = DateTime.fromISO(dateReference.from.value, {
                    zone: process.env.SERVERY_TIMEZONE,
                });
            }

            return date;
        }
    }
    return null;
}

export function inferMeals(receivedMessage) {
    const mealFilter = findMatchingMeal(receivedMessage.text);
    const dateTime = getBestDateTime(receivedMessage);
    if(dateTime !== null) {
        return new MealRequest(dateTime, mealFilter);
    } else if (mealFilter !== null) {
        return new MealRequest(getNextMealDay(mealFilter), mealFilter);
    }

    return null;
}
