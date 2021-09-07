/*
 * required env-vars:
 * - VERIFY_TOKEN
 * - PAGE_ACCESS_TOKEN
 */

'use strict';

// Use dotenv to read .env vars into Node
import dotenv from 'dotenv';
dotenv.config();

// Imports dependencies and set up http server

import { getMenu } from './src/scrape.js';
import { runServer } from './src/server.js';

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { openDb } from './src/database.js';

const argv = yargs(hideBin(process.argv))
    .usage('Runs the server')
    .command('serve', 'start the server', (yargs) => {}, (argv) => {
        runServer();
    })
    .command('migrate', 'Run migrations', (yargs) => {}, async (argv) => {
        let db = await openDb();
        await db.migrate();
    })
    .command('scrape', 'Scrape the menu', (yargs) => {}, async (argv) => {
        let menu = await getMenu();
        console.log(menu);
        let db = await openDb();
        for(const [date, contents] of menu) {
            await db.run("INSERT OR REPLACE INTO menu VALUES (:day, json(:contents))", { ':day': date.toISOString(), ':contents': JSON.stringify(contents) });
        }
    })
    .help()
    .argv;