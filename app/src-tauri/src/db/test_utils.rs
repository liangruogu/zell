use crate::db::Database;
use rusqlite::Connection;

pub fn create_test_db() -> Database {
    let conn = Connection::open_in_memory().unwrap();
    Database::from_connection(conn).unwrap()
}
