import { Interval } from "luxon";
import log from "npmlog";
import { User } from "./database.js";
import { menuReply } from "./messages.js";
import { setupSendAPI } from "./messenger/utils.js";
import { MealRequest, nowInServeryTimezone } from "./nlp.js";

const MAX_MINS_AWAY_FROM_IDEAL = 10;
const MIN_MINUTES_SINCE_LAST_MESSAGE = 20;

export async function processUserSubscription(db, now, user) {
    if (user.subscription !== User.SUBSCRIBED_DAILY) {
        return;
    } else if (user.subscription_time === null) {
        console.warn("user missing subscription time ", user);
        return;
    }
    let idealMessageTime = now.startOf("day").plus(user.subscription_time);
    let minutesAwayFromIdeal = Interval.fromDateTimes(
        now > idealMessageTime ? idealMessageTime : now,
        now > idealMessageTime ? now : idealMessageTime
    )
        .toDuration()
        .as("minutes");
    log.info('subscriptions',
        user.psid +
            ": " +
            minutesAwayFromIdeal +
            " away from ideal message time"
    );
    if (
        now < idealMessageTime ||
        minutesAwayFromIdeal > MAX_MINS_AWAY_FROM_IDEAL
    ) {
        return;
    }
    let minutesSinceLastMessage =
        user.last_contacted === null
            ? null
            : Interval.fromDateTimes(user.last_contacted, now)
                  .toDuration()
                  .as("minutes");
    log.info('subscriptions',
        user.psid + ": " + minutesSinceLastMessage + " since last message"
    );
    if (
        minutesSinceLastMessage !== null &&
        minutesSinceLastMessage < MIN_MINUTES_SINCE_LAST_MESSAGE
    ) {
        return;
    }

    log.info('subscriptions', user.psid + ": will send!");

    let reply = setupSendAPI(user.psid, null, "CONFIRMED_EVENT_UPDATE");

    await user.setLastContacted(db, nowInServeryTimezone());
    log.info('subscriptions', user.psid + ": last_contacted updated");
    await menuReply(db, new MealRequest(now, null), user, reply, true, true);
    log.info('subscriptions', user.psid + ": sent menu");
}

export function processSubscriptions(db, users) {
    let now = nowInServeryTimezone();

    let promises = [];
    for (let user of users) {
        promises.push(processUserSubscription(db, now, user));
    }

    return Promise.allSettled(promises);
}
