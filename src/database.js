import { DateTime } from "luxon";
import { open } from "sqlite";
import sqlite3 from "sqlite3";
import { MAIN, mealsSortOrder, VEGO } from "./food.js";

export const openDb = async () => {
    return await open({
        filename: "./data/db.sqlite",
        driver: sqlite3.Database,
    });
};

export class Meal {
    constructor(date, mealType, dishes) {
        this.date = date;
        this.mealType = mealType;
        this.dishes = dishes;
    }

    getMainDishes() {
        return this.dishes.filter((dish) => dish.role === MAIN);
    }

    getVegoDishes() {
        return this.dishes.filter((dish) => dish.role === VEGO);
    }

    static fromDb(row) {
        return new Meal(
            DateTime.fromSQL(row.menu_date, {
                zone: process.env.SERVERY_TIMEZONE,
            }),
            row.menu_meal,
            JSON.parse(row.menu_contents).dishes
        );
    }

    static async lookup(db, query) {
        const sqlDate = query.date.toSQLDate();
        console.log('Looking for meals on ' + sqlDate + ' in DB');
        let results;
        if (!query.meal) {
            results = await db.all("select * from menu where menu_date = :date", {
                ":date": sqlDate,
            });
        } else {
            results = await db.all(
                "select * from menu where menu_date = :date and menu_meal = :meal",
                {
                    ":date": sqlDate,
                    ":meal": query.meal,
                }
            );
        }
        results.sort((m1, m2) => {
            return mealsSortOrder[m1.menu_meal] - mealsSortOrder[m2.menu_meal];
        });
        return results.map((meal) => Meal.fromDb(meal));
    }

    async upsert(db) {
        await db.run(
            "INSERT OR REPLACE INTO menu (menu_date, menu_meal, menu_contents) VALUES (:day, :meal, json(:contents))",
            {
                ":day": this.date.toSQLDate(),
                ":meal": this.mealType,
                ":contents": JSON.stringify({ dishes: this.dishes }),
            }
        );
    }
}


export class User {
    constructor(psid, subscription, subscription_time, dietary_preference) {
        this.psid = psid;
        this.subscription = subscription;
        this.subscription_time = subscription_time;
        this.dietary_preference = dietary_preference;
        if(this.dietary_preference === null) {
            this.dietary_preference = User.HIDE_VEGO;
        }
        this.payload = {};
    }

    static get NOT_SUBSCRIBED() {
        return null;
    }
    static get SUBSCRIBED_DAILY() {
        return 1;
    }
    static get SUBSCRIBED_WEEKLY() {
        return 2;
    }

    static get SHOW_ALL() {
        return 0;
    }

    static get HIDE_VEGO() {
        return 1;
    }

    shouldShowVego() {
        if(typeof this.payload.once_off_dietary_override !== 'undefined') {
            return this.payload.once_off_dietary_override !== User.HIDE_VEGO;
        }
        return this.dietary_preference !== User.HIDE_VEGO;
    }

    setPayload(payload) {
        console.log('Setting message payload', payload);
        this.payload = payload;
    }

    needsSubscriptionTime() {
        return this.subscription !== User.NOT_SUBSCRIBED && this.subscription_time === null;
    }

    async setSubscription(db, subscription, subscription_time) {
        this.subscription = subscription;
        this.subscription_time = subscription_time;
        await db.run(
            "INSERT OR REPLACE INTO messenger_users (user_psid, user_subscription, user_subscription_time) VALUES (:psid, :subscriptionType, :subscriptionTime)",
            {
                ":psid": this.psid,
                ":subscriptionType": this.subscription,
                ":subscriptionTime": this.subscription_time === null ? null : this.subscription_time.toISOTime()
            }
        );
    }

    async setDietaryPrefs(db, dietary_preference) {
        this.dietary_preference = dietary_preference;
        await db.run(
            "INSERT OR REPLACE INTO messenger_users (user_psid, user_dietary_prefs) VALUES (:psid, :dietary)",
            {
                ":psid": this.psid,
                ":dietary": this.dietary_preference
            }
        );
    }

    static async getByPsid(db, psid) {
        let row = await db.get("select * from messenger_users where user_psid = :psid", { ':psid': psid });
        if(!row) {
            return new User(psid, null, null, null);
        }
        return new User(row.user_psid, row.user_subscription, row.user_subscription_time, row.user_dietary_prefs);
    }
}
