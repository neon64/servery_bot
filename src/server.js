import express from "express";
import pkg from "body-parser";
const { urlencoded, json } = pkg;
import { openDb } from "./database.js";
import { MAIN, mealsDisplay } from "./food.js";

import { handleMessage, handlePostback } from "./messages.js";

export async function runServer() {
    const app = express();

    // Parse application/x-www-form-urlencoded
    app.use(urlencoded({ extended: true }));

    // Parse application/json
    app.use(json());

    // Respond with 'Hello World' when a GET request is made to the homepage
    app.get("/", async (_req, res) => {
        const db = await openDb();
        const result = await db.all("select * from menu");
        let response =
            '<body><h1>The Servery - Raw Data Dump</h1><table border="1">';
        for (let row of result) {
            response +=
                "<tr><td>" +
                new Date(row.menu_date).toDateString() +
                "</td><td><h6>" + row.menu_meal + "</h6></td><td>";
            let data = JSON.parse(row.menu_contents);
            response += "<ul>";
            for (const dish of data.dishes) {
                response += "<li>";
                if(dish.role === MAIN) {
                    response += "<strong>";
                }
                response += "" + dish.description;
                if(dish.role === MAIN) {
                    response += "</strong>";
                }
                response += "</li>";
            }
            response += "</ul>";
            response += "</td></tr>\n";
        }
        response += "</table></body>";
        res.send(response);
    });

    // Adds support for GET requests to our webhook
    app.get("/webhook", (req, res) => {
        // Your verify token. Should be a random string.
        const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

        // Parse the query params
        let mode = req.query["hub.mode"];
        let token = req.query["hub.verify_token"];
        let challenge = req.query["hub.challenge"];

        // Checks if a token and mode is in the query string of the request
        if (mode && token) {
            // Checks the mode and token sent is correct
            if (mode === "subscribe" && token === VERIFY_TOKEN) {
                // Responds with the challenge token from the request
                console.log("WEBHOOK_VERIFIED");
                res.status(200).send(challenge);
            } else {
                // Responds with '403 Forbidden' if verify tokens do not match
                res.sendStatus(403);
            }
        }
    });

    // Creates the endpoint for your webhook
    app.post("/webhook", async (req, res) => {
        let body = req.body;

        // Checks if this is an event from a page subscription
        if (body.object === "page") {
            // Iterates over each entry - there may be multiple if batched
            for(let entry of body.entry) {
                // Gets the body of the webhook event
                let webhookEvent = entry.messaging[0];
                console.log(webhookEvent);

                // Get the sender PSID
                let senderPsid = webhookEvent.sender.id;
                console.log("Sender PSID: " + senderPsid);

                // Check if the event is a message or postback and
                // pass the event to the appropriate handler function
                if (webhookEvent.message) {
                    await handleMessage(senderPsid, webhookEvent.message);
                } else if (webhookEvent.postback) {
                    handlePostback(senderPsid, webhookEvent.postback);
                }
            }

            // Returns a '200 OK' response to all requests
            res.status(200).send("EVENT_RECEIVED");
        } else {
            // Returns a '404 Not Found' if event is not from a page subscription
            res.sendStatus(404);
        }
    });

    const hostname = 'localhost';

    // listen for requests :)
    let listener = await app.listen(process.env.PORT, hostname, function () {
        console.log("Your app is listening on http://" + hostname + ":" + listener.address().port);
    });
}
