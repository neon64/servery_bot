--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------

CREATE TABLE menu (menu_date DATE NOT NULL PRIMARY KEY, menu_contents JSON NOT NULL);

--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------

DROP TABLE menu;