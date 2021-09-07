import { open } from 'sqlite';
import sqlite3 from 'sqlite3';

export const openDb = async () => {
    return await open({
        filename: './data/db.sqlite',
        driver: sqlite3.Database
    });
}
