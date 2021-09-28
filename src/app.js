/*
 * required env-vars:
 * - VERIFY_TOKEN
 * - PAGE_ACCESS_TOKEN
 */

"use strict";

// Use dotenv to read .env vars into Node
import dotenv from "dotenv";
dotenv.config();

// Imports dependencies and set up http server

import { getMenu } from "./scrape.js";
import { runServer } from "./server.js";

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { Meal, openDb } from "./database.js";

yargs(hideBin(process.argv))
    .usage("Runs the server")
    .command(
        "serve",
        "start the server",
        () => {},
        () => {
            runServer();
        }
    )
    .command(
        "migrate",
        "Run migrations",
        () => {},
        async () => {
            let db = await openDb();
            await db.migrate();
        }
    )
    .command(
        "scrape",
        "Scrape the menu",
        (yargs) => {
            return yargs
                .boolean("headless")
                .default("headless", true)
                .describe(
                    "headless",
                    "Perform scraping without opening a browser window"
                );
        },
        async (argv) => {
            let menu = await getMenu(argv.headless);
            console.log(menu);
            let db = await openDb();
            for (const [date, contents] of menu) {
                for (const [meal, dishes] of Object.entries(contents)) {
                    const m = new Meal(date, meal, dishes);
                    await m.upsert(db);
                }
            }
        }
    )
    .help().argv;
