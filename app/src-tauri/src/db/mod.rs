use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;

pub mod migrations;
pub mod models;
pub mod test_utils;

pub struct Database {
    pub conn: Mutex<Connection>,
}

impl Database {
    pub fn new(app_dir: PathBuf) -> Result<Self, Box<dyn std::error::Error>> {
        std::fs::create_dir_all(&app_dir)?;
        let db_path = app_dir.join("zell.db");
        let conn = Connection::open(&db_path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=NORMAL;")?;
        migrations::run_migrations(&conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn from_connection(conn: Connection) -> Result<Self, Box<dyn std::error::Error>> {
        conn.execute_batch("PRAGMA foreign_keys=ON;")?;
        migrations::run_migrations(&conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }
}
