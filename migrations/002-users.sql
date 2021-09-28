--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------

CREATE TABLE messenger_users (user_psid VARCHAR(50) PRIMARY KEY NOT NULL, user_subscription INTEGER, user_subscription_time TIME, user_dietary_prefs INTEGER);

--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------

DROP TABLE messenger_users;