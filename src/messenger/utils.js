import got from "got";
import log from "npmlog";

// Sends response messages via the Send API
export function setupSendAPI(senderPsid, pageId, tag) {
    return async (response) => {
        // The page access token we have generated in your app settings
        let PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
        if (pageId === process.env.TEST_PAGE_ID) {
            PAGE_ACCESS_TOKEN = process.env.TEST_PAGE_ACCESS_TOKEN;
        }

        // Construct the message body
        let requestBody = {
            recipient: {
                id: senderPsid,
            },
            ...response,
        };

        if (tag) {
            requestBody.tag = tag;
            requestBody.messaging_type = "MESSAGE_TAG";
        }

        // Send the HTTP request to the Messenger Platform
        try {
            log.verbose("send", "request: %j", requestBody);
            await got.post("https://graph.facebook.com/v12.0/me/messages", {
                searchParams: { access_token: PAGE_ACCESS_TOKEN },
                json: requestBody,
            });
        } catch (e) {
            log.error("send", "response: %j", e.response.body);
        }
    };
}

export const handleWebhookVerify = async (req, res) => {
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
            log.info('utils', "WEBHOOK_VERIFIED");
            res.status(200).send(challenge);
        } else {
            // Responds with '403 Forbidden' if verify tokens do not match
            res.sendStatus(403);
        }
    }
};

export const handleWebhook = (onMessage, onPostback) => {
    return async (req, res) => {
        let body = req.body;

        // Checks if this is an event from a page subscription
        if (body.object === "page") {
            // Iterates over each entry - there may be multiple if batched
            for (let entry of body.entry) {
                // Gets the body of the webhook event
                let webhookEvent = entry.messaging[0];

                let pageId = entry.id;
                log.verbose("messenger", "Received event for page: %s", pageId);

                // Get the sender PSID
                let senderPsid = webhookEvent.sender.id;

                let reply = setupSendAPI(senderPsid, pageId);

                // Check if the event is a message or postback and
                // pass the event to the appropriate handler function
                if (webhookEvent.message) {
                    onMessage(senderPsid, webhookEvent.message, reply);
                } else if (webhookEvent.postback) {
                    onPostback(senderPsid, webhookEvent.postback, reply);
                }
            }

            // Returns a '200 OK' response to all requests
            res.status(200).send("EVENT_RECEIVED");
            log.verbose("send", "200 OK");
        } else {
            // Returns a '404 Not Found' if event is not from a page subscription
            res.sendStatus(404);
        }
    };
};
