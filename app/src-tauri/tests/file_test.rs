use app_lib::commands::file::*;
use app_lib::commands::project::create_project_core;
use app_lib::db::test_utils::create_test_db;
use app_lib::db::Database;

fn setup_project(db: &Database) -> String {
    create_project_core(
        db,
        None,
        "Test Project".into(),
        "".into(),
        "".into(),
        "".into(),
        "{}".into(),
    )
    .unwrap()
    .id
}

fn insert_test_file_record(db: &Database, project_id: &str, id: &str, original_name: &str) {
    let conn = db.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO project_files (id, project_id, file_name, original_name, file_type, file_size, extracted_text, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 'txt', 0, '', datetime('now'), datetime('now'))",
        rusqlite::params![id, project_id, format!("{}.txt", id), original_name],
    )
    .unwrap();
}

#[test]
fn detect_markdown_by_extension() {
    assert_eq!(detect_file_type("md"), "md");
}

#[test]
fn detect_pdf_by_extension() {
    assert_eq!(detect_file_type("pdf"), "pdf");
}

#[test]
fn detect_image_by_extension() {
    assert_eq!(detect_file_type("png"), "image");
    assert_eq!(detect_file_type("jpg"), "image");
    assert_eq!(detect_file_type("webp"), "image");
}

#[test]
fn mime_from_ext_known_types() {
    assert_eq!(mime_from_ext("md"), "text/markdown");
    assert_eq!(mime_from_ext("pdf"), "application/pdf");
    assert_eq!(mime_from_ext("png"), "image/png");
    assert_eq!(mime_from_ext("jpg"), "image/jpeg");
    assert_eq!(mime_from_ext("txt"), "text/plain");
}

#[test]
fn mime_from_ext_unknown() {
    assert_eq!(mime_from_ext("xyz"), "application/octet-stream");
}

#[test]
fn rename_file() {
    let db = create_test_db();
    let pid = setup_project(&db);

    insert_test_file_record(&db, &pid, "file-1", "old_name.txt");

    rename_project_file_core(&db, "file-1", "new_name.txt".into()).unwrap();

    let files = get_project_files_core(&db, &pid).unwrap();
    assert_eq!(files.len(), 1);
    assert_eq!(files[0].original_name, "new_name.txt");
}

#[test]
fn update_file_description() {
    let db = create_test_db();
    let pid = setup_project(&db);

    insert_test_file_record(&db, &pid, "file-2", "test.txt");

    update_project_file_core(&db, "file-2", "A description".into()).unwrap();

    let files = get_project_files_core(&db, &pid).unwrap();
    assert_eq!(files[0].description, "A description");
}

#[test]
fn get_project_files_returns_active_only() {
    let db = create_test_db();
    let pid = setup_project(&db);

    insert_test_file_record(&db, &pid, "file-3", "active.txt");
    insert_test_file_record(&db, &pid, "file-4", "deleted.txt");

    let conn = db.conn.lock().unwrap();
    conn.execute(
        "UPDATE project_files SET deleted_at = datetime('now') WHERE id = 'file-4'",
        [],
    )
    .unwrap();
    drop(conn);

    let files = get_project_files_core(&db, &pid).unwrap();
    assert_eq!(files.len(), 1);
    assert_eq!(files[0].id, "file-3");
}
