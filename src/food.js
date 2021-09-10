import { DateTime, Duration } from "luxon";

// key words we recognize as a type of "meal"
export const meals = {
    brekky: "breakfast",
    breakfast: "breakfast",
    brekkie: "breakfast",
    "break fast": "breakfast",
    brunch: "brunch",
    lunch: "lunch",
    linch: "lunch",
    dins: "dinner",
    diner: "dinner",
    supper: "supper",
    dinner: "dinner",
};

// display meals
export const mealsDisplay = {
    breakfast: "Breakfast",
    brunch: "Brunch",
    lunch: "Lunch",
    dinner: "Dinner",
};

export const mealsExpired = {
    // we take the end of the mealtime, plus 15 mins 'buffer'
    // in case you wanted to find out what they just missed, for example
    breakfast: Duration.fromObject({ hours: 10, minutes: 15 }),
    brunch: Duration.fromObject({ hours: 13, minutes: 15 }),
    lunch: Duration.fromObject({ hours: 14, minutes: 15 }),
    dinner: Duration.fromObject({ hours: 19, minutes: 15 }),
};

export const SOUP = "soup";
export const MAIN = "main";
export const VEGO = "vegetarian";
export const STAPLE = "staple";

export const mealsSortOrder = {
    breakfast: 0,
    brunch: 5,
    lunch: 10,
    dinner: 20,
};

export const identifyDish = (dish) => {
    if (dish === "Chefs Selection Soup") {
        return { role: SOUP, description: dish };
    } else if (dish.includes("(V)")) {
        const description = dish.replace("(V)", "").trim();
        return { role: VEGO, description };
    } else if (
        dish.toLowerCase().startsWith("assorted breads, cereals") ||
        dish.toLowerCase().startsWith("seasonal vegetables") ||
        dish.toLowerCase().includes("chefs selection")
    ) {
        return { role: STAPLE, description: dish };
    } else {
        return { role: MAIN, description: dish };
    }
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

    static fromDb(row) {
        return new Meal(
            DateTime.fromSQL(row.menu_date, {
                zone: process.env.SERVERY_TIMEZONE,
            }),
            row.menu_meal,
            JSON.parse(row.menu_contents).dishes
        );
    }
}
