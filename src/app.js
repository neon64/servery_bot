/*
 * required env-vars:
 * - VERIFY_TOKEN
 * - PAGE_ACCESS_TOKEN
 */

"use strict";

// Use dotenv to read .env vars into Node
import dotenv from "dotenv";
dotenv.config();

import log from "npmlog";
log.enableColor();

// Imports dependencies and set up http server

import { scrape, scrapeIfNeeded } from "./scrape.js";
import { runServer } from "./server.js";

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { openDb, User } from "./database.js";
import { processSubscriptions } from "./subscriptions.js";

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
            await scrape(argv.headless);
        }
    )
    .command(
        "cron",
        "Send menu to subscribed users on a timer",
        () => {},
        async () => {
            const db = await openDb();
            await scrapeIfNeeded(db);
            const subscribedUsers = await User.allSubscribedUsers(db);
            await processSubscriptions(db, subscribedUsers);
        }
    )
    .help().argv;
