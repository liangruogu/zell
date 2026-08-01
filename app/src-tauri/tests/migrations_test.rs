use app_lib::db::test_utils::create_test_db;

#[test]
fn all_tables_created() {
    let db = create_test_db();
    let conn = db.conn.lock().unwrap();

    let expected_tables = vec![
        "projects",
        "knowledge_articles",
        "whiteboards",
        "ai_conversations",
        "external_links",
        "project_files",
        "settings",
        "invite_codes",
    ];

    for table in expected_tables {
        let count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
                rusqlite::params![table],
                |row| row.get(0),
            )
            .unwrap();
        assert!(count > 0, "Table '{}' should exist", table);
    }
}

#[test]
fn fts5_virtual_table_created() {
    let db = create_test_db();
    let conn = db.conn.lock().unwrap();

    let count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='document_search'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count, 1, "FTS5 table 'document_search' should exist");
}

#[test]
fn foreign_keys_enabled() {
    let db = create_test_db();
    let conn = db.conn.lock().unwrap();

    let fk: i32 = conn
        .pragma_query_value(None, "foreign_keys", |row| row.get(0))
        .unwrap();
    assert_eq!(fk, 1, "Foreign keys should be enabled");
}

#[test]
fn settings_table_has_on_conflict_upsert() {
    let db = create_test_db();
    let conn = db.conn.lock().unwrap();

    conn.execute(
        "INSERT INTO settings (key, value, updated_at) VALUES ('test_key', 'v1', '2024-01-01T00:00:00Z')",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO settings (key, value, updated_at) VALUES ('test_key', 'v2', '2024-01-02T00:00:00Z') ON CONFLICT(key) DO UPDATE SET value='v2', updated_at='2024-01-02T00:00:00Z'",
        [],
    )
    .unwrap();

    let value: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key='test_key'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(value, "v2");
}
