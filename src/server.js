import express from "express";
import pkg from "body-parser";
const { urlencoded, json } = pkg;
import { openDb } from "./database.js";

import { handleMessage, handlePostback } from "./messages.js";
import { handleWebhook, handleWebhookVerify } from "./messenger/utils.js";
import expressBasicAuth from "express-basic-auth";

const HOSTNAME = "localhost";

export async function runServer() {
    const app = express();

    // Parse application/x-www-form-urlencoded
    app.use(urlencoded({ extended: true }));

    // Parse application/json
    app.use(json());

    // Respond with 'Hello World' when a GET request is made to the homepage
    app.get("/", async (_req, res) => {
        const response = '<body><h1>The Servery</h1><p><a href="/api/menu">/api/menu - dump all items in the menu</a></p><p><a href="/api/users">/api/users - show all user subscriptions</a></p></body>';
        res.send(response);
    });

    app.get("/privacy-policy", async (_req, res) => {
        const response = '<body><h1>The Servery - Privacy Policy</h1><p>We collect your Facebook PSID, and (voluntarily) your dietary preferences</p></body>';
        res.send(response);
    });

    const router = express.Router();

    router.get("/menu", async (_req, res) => {
        const db = await openDb();
        const result = await db.all("select * from menu");
        const items = result.map((item) => {
            item.menu_contents = JSON.parse(item.menu_contents);
            return item;
        })
        res.json(items);
    });

    router.get("/users", async (_req, res) => {
        const db = await openDb();
        const result = await db.all("select * from messenger_users");
        res.json(result);
    });

    let credentials = {}
    credentials[process.env.HTTP_BASIC_USER] = process.env.HTTP_BASIC_PASSWORD;
    app.use('/api', expressBasicAuth({ users: credentials, challenge: true, realm: 'servery_bot' }), router);

    // Adds support for GET requests to our webhook
    app.get("/webhook", handleWebhookVerify);

    // Creates the endpoint for your webhook
    app.post("/webhook", handleWebhook(handleMessage, handlePostback));

    // listen for requests :)
    let listener = await app.listen(process.env.PORT, HOSTNAME, function () {
        console.log(
            "Your app is listening on http://" +
                HOSTNAME +
                ":" +
                listener.address().port
        );
    });
}
