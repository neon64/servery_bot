import { open } from "sqlite";
import sqlite3 from "sqlite3";
import { Meal, mealsSortOrder } from "./food.js";

export const openDb = async () => {
    return await open({
        filename: "./data/db.sqlite",
        driver: sqlite3.Database,
    });
};

export const lookupMeals = async (query) => {
    const db = await openDb();

    const isoDate = query.date.toISODate();
    console.log(isoDate);
    let results;
    if (!query.meal) {
        results = await db.all("select * from menu where menu_date = :date", {
            ":date": isoDate,
        });
    } else {
        results = await db.all(
            "select * from menu where menu_date = :date and menu_meal = :meal",
            {
                ":date": isoDate,
                ":meal": query.meal,
            }
        );
    }
    results.sort((m1, m2) => {
        return mealsSortOrder[m1.menu_meal] - mealsSortOrder[m2.menu_meal];
    });
    return results.map((meal) => Meal.fromDb(meal));
};
