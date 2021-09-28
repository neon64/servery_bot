import puppeteer from "puppeteer";
import cheerio from "cheerio";
import { meals, identifyDish } from "./food.js";
import { DateTime } from "luxon";

// goes through the whole OneLogin authentication process in order to scrape the
let getMenuHtml = async (headless) => {
    console.log("launching browser instance (headless=" + headless + ")");
    const browser = await puppeteer.launch({ headless: headless });
    const page = await browser.newPage();
    await page.goto(process.env.GRAIL_ENDPOINT, { waitUntil: "networkidle2" });
    console.log("finished loading login page");
    await page.type("#username", process.env.GRAIL_USERNAME);
    await page.click("button[type=submit]");
    await page.waitForSelector("input#password");
    console.log("password prompt appears, entering password...");
    await page.type("#password", process.env.GRAIL_PASSWORD);
    await page.click("button[type=submit]");
    console.log("submitted login page...");
    await page.waitForNavigation({ waitUntil: "domcontentloaded" });
    console.log("loading food menu...");
    await page.goto(process.env.GRAIL_ENDPOINT + "/food/college-menu/");
    await page.waitForSelector(".entry-content");
    const menuHtml = await page.$eval(".entry-content", (element) => {
        return element.innerHTML;
    });
    console.log("got menu html");
    await browser.close();
    return menuHtml;
};

function isValidDate(d) {
    return d instanceof Date && !isNaN(d);
}

function menuHtmlToStructuredData(html) {
    const $ = cheerio.load(html);

    const menu = new Map();
    let currentDate = null;
    let currentMeal = null;

    for (let child of $("body").children()) {
        const text = $(child).text();

        const parts = text.split("\n");

        for (let line of parts) {
            const part = line.trim();

            if (part === "") {
                continue;
            }

            const date = new Date(part);
            if (isValidDate(date)) {
                // valid date
                console.log("Parsing", date);
                currentDate = DateTime.fromJSDate(date);
                menu.set(currentDate, {});
                currentMeal = null;
                continue;
            }

            const lowerText = part.toLowerCase();

            if (Object.keys(meals).includes(lowerText)) {
                const meal = meals[lowerText];
                console.log("Detected meal:", meal);
                currentMeal = meal;
                if (currentDate !== null) {
                    menu.get(currentDate)[currentMeal] = [];
                } else {
                    console.warn("No date for meal", meal);
                }
                continue;
            }

            if ((currentDate !== null, currentMeal !== null)) {
                menu.get(currentDate)[currentMeal].push(identifyDish(part));
            } else {
                console.warn("ignoring line", part);
            }
        }
    }

    // dedup menu items to clean it up a little bit
    for (const [date, contents] of menu) {
        Object.keys(contents).forEach((meal) => {
            menu.get(date)[meal] = menu
                .get(date)
                [meal].filter(
                    (item, index) =>
                        menu.get(date)[meal].indexOf(item) === index
                );
        });
    }

    return menu;
}

const getMenu = async (headless) => {
    let html = await getMenuHtml(headless);
    return menuHtmlToStructuredData(html);
};

export { getMenu };
