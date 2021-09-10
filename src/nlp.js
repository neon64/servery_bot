// To further interpret what the user means (on top of the built-in NLP service)

import { meals, mealsExpired } from "./food.js";
import { Interval, DateTime } from "luxon";

export function findMatchingMeal(receivedMessage) {
    const lower = receivedMessage.text.toLowerCase();
    for (const [search, replace] of Object.entries(meals)) {
        if (lower.includes(search)) {
            return replace;
        }
    }

    return null;
}

const nowInServeryTimezone = () => {
    return DateTime.now().setZone(process.env.SERVERY_TIMEZONE);
};

export const getNextMealDay = (meal) => {
    const now = nowInServeryTimezone();
    const todayStart = now.set({
        hour: 0,
        minute: 0,
        second: 0,
        millisecond: 0,
    });
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
    const todayStart = today.set({
        hour: 0,
        minute: 0,
        second: 0,
        millisecond: 0,
    });
    const dayStart = day.set({ hour: 0, minute: 0, second: 0, millisecond: 0 });
    const duration = Interval.fromDateTimes(todayStart, dayStart).toDuration();
    const days = duration.as("days");
    console.log(days);
    console.log(todayStart.toString(), dayStart.toString());
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

export function inferMeals(receivedMessage) {
    const datetimes = receivedMessage.nlp.entities["wit$datetime:datetime"];
    const mealFilter = findMatchingMeal(receivedMessage);
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
                    zone: process.env.SERVERY_TIMEZON,
                });
            }

            console.log(date);
            console.log(dateReference);

            return {
                date: date,
                meal: mealFilter,
            };
        }
    } else if (mealFilter !== null) {
        return {
            date: getNextMealDay(mealFilter),
            meal: mealFilter,
        };
    }

    return null;
}
