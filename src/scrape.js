import puppeteer from "puppeteer";
import cheerio from "cheerio";
import { meals, identifyDish } from "./food.js";
import { DateTime } from "luxon";
import { Meal, openDb } from "./database.js";
import { nowInServeryTimezone } from "./nlp.js";
import log from "npmlog";

const SCRAPE_INTERVAL = { hours: 2 };

// goes through the whole OneLogin authentication process in order to scrape the
let getMenuHtml = async (headless) => {
    log.info('scrape', "launching browser instance (headless=" + headless + ")");
    const browser = await puppeteer.launch({ headless: headless });
    const page = await browser.newPage();
    await page.goto(process.env.GRAIL_ENDPOINT, { waitUntil: "networkidle2" });
    log.verbose('scrape', "finished loading login page");
    await page.type("#username", process.env.GRAIL_USERNAME);
    await page.click("button[type=submit]");
    await page.waitForSelector("input#password");
    log.verbose('scrape',  "password prompt appears, entering password...");
    await page.type("#password", process.env.GRAIL_PASSWORD);
    await page.click("button[type=submit]");
    log.verbose('scrape', "submitted login page...");
    await page.waitForNavigation({ waitUntil: "domcontentloaded" });
    log.verbose('scrape', "loading food menu...");
    await page.goto(process.env.GRAIL_ENDPOINT + "/food/college-menu/");
    await page.waitForSelector(".entry-content");
    const menuHtml = await page.$eval(".entry-content", (element) => {
        return element.innerHTML;
    });
    log.info('scrape', "got menu html");
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
                log.verbose('scrape', "Parsing " + date);
                currentDate = DateTime.fromJSDate(date);
                menu.set(currentDate, {});
                currentMeal = null;
                continue;
            }

            const lowerText = part.toLowerCase();

            if (Object.keys(meals).includes(lowerText)) {
                const meal = meals[lowerText];
                log.verbose('scrape', "Detected meal: %j", meal);
                currentMeal = meal;
                if (currentDate !== null) {
                    menu.get(currentDate)[currentMeal] = [];
                } else {
                    log.warn('scrape', "No date for meal %j", meal);
                }
                continue;
            }

            if ((currentDate !== null, currentMeal !== null)) {
                menu.get(currentDate)[currentMeal].push(identifyDish(part));
            } else {
                log.warn('scrape', "ignoring line %j", part);
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

export async function updateLastScrapedDateTime(db) {
    await db.run(
        "INSERT OR REPLACE INTO bookkeeping (field, value) VALUES ('last_scraped', :last_scraped)",
        {
            ":last_scraped": nowInServeryTimezone().toISO()
        }
    );
}

export async function scrape(headless) {
    let menu = await getMenu(headless);
    let db = await openDb();
    let updated = 0;
    for (const [date, contents] of menu) {
        for (const [meal, dishes] of Object.entries(contents)) {
            const m = new Meal(date, meal, dishes);
            await m.upsert(db);
            updated += 1;
        }
    }
    log.info('scrape', "Upserted " + updated + " rows");
    updateLastScrapedDateTime(db);
    log.info('scrape', "Updated last_scraped time");
}

export async function scrapeIfNeeded(db) {
    let last_scraped = await db.get("select value from bookkeeping where field = 'last_scraped'");
    if(last_scraped) {
        last_scraped = DateTime.fromISO(last_scraped.value, {
            zone: process.env.SERVERY_TIMEZONE,
        });
    }
    if(!last_scraped) {
        log.info('scrape', 'Never scraped before - scraping now.');
        await scrape(true);
    } else if(last_scraped < nowInServeryTimezone().minus(SCRAPE_INTERVAL)) {
        log.info('scrape', 'Last scraped %s, scraping again', last_scraped.toLocaleString(DateTime.DATETIME_SHORT));
        await scrape(true);
    } else {
        log.info('scrape', 'Last scraped %s, skipping scrape', last_scraped.toLocaleString(DateTime.DATETIME_SHORT));
    }
}

export { getMenu };
