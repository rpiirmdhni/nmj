import Database from "better-sqlite3";
import { join } from "path";

const dbPath = join(__dirname, "../data/nmj.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export default db;
