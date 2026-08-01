use app_lib::commands::project::*;
use app_lib::db::test_utils::create_test_db;

#[test]
fn create_and_get_project() {
    let db = create_test_db();

    let project = create_project_core(
        &db,
        None,
        "Test Project".into(),
        "A description".into(),
        "#ffffff".into(),
        "book".into(),
        "{}".into(),
    )
    .unwrap();

    assert_eq!(project.name, "Test Project");
    assert!(project.deleted_at.is_none());
    assert!(!project.id.is_empty());
}

#[test]
fn create_project_with_duplicate_name_gets_suffix() {
    let db = create_test_db();

    let p1 = create_project_core(
        &db,
        None,
        "My Project".into(),
        "".into(),
        "".into(),
        "".into(),
        "{}".into(),
    )
    .unwrap();
    let p2 = create_project_core(
        &db,
        None,
        "My Project".into(),
        "".into(),
        "".into(),
        "".into(),
        "{}".into(),
    )
    .unwrap();

    assert_eq!(p1.name, "My Project");
    assert_eq!(p2.name, "My Project (2)");
}

#[test]
fn get_projects_returns_active_only() {
    let db = create_test_db();

    let p = create_project_core(
        &db,
        None,
        "Active".into(),
        "".into(),
        "".into(),
        "".into(),
        "{}".into(),
    )
    .unwrap();
    delete_project_core(&db, &p.id).unwrap();

    let projects = get_projects_core(&db).unwrap();
    assert!(projects.is_empty());
}

#[test]
fn get_project_by_id() {
    let db = create_test_db();

    let p = create_project_core(
        &db,
        None,
        "Find Me".into(),
        "desc".into(),
        "#000".into(),
        "star".into(),
        "{}".into(),
    )
    .unwrap();

    let found = get_project_core(&db, &p.id).unwrap();
    assert_eq!(found.name, "Find Me");
    assert_eq!(found.description, "desc");
}

#[test]
fn get_project_not_found_errors() {
    let db = create_test_db();
    let result = get_project_core(&db, "nonexistent");
    assert!(result.is_err());
}

#[test]
fn update_project_changes_fields() {
    let db = create_test_db();

    let p = create_project_core(
        &db,
        None,
        "Old".into(),
        "".into(),
        "".into(),
        "".into(),
        "{}".into(),
    )
    .unwrap();

    let updated = update_project_core(
        &db,
        &p.id,
        "New Name".into(),
        "New Desc".into(),
        "#111".into(),
        "icon2".into(),
        "{\"key\":\"val\"}".into(),
    )
    .unwrap();

    assert_eq!(updated.name, "New Name");
    assert_eq!(updated.description, "New Desc");
    assert_eq!(updated.background, "#111");
}

#[test]
fn update_project_duplicate_name_errors() {
    let db = create_test_db();

    create_project_core(
        &db,
        None,
        "Existing".into(),
        "".into(),
        "".into(),
        "".into(),
        "{}".into(),
    )
    .unwrap();
    let p2 = create_project_core(
        &db,
        None,
        "Second".into(),
        "".into(),
        "".into(),
        "".into(),
        "{}".into(),
    )
    .unwrap();

    let result = update_project_core(
        &db,
        &p2.id,
        "Existing".into(),
        "".into(),
        "".into(),
        "".into(),
        "{}".into(),
    );
    assert!(result.is_err());
}

#[test]
fn soft_delete_preserves_record() {
    let db = create_test_db();

    let p = create_project_core(
        &db,
        None,
        "To Delete".into(),
        "".into(),
        "".into(),
        "".into(),
        "{}".into(),
    )
    .unwrap();

    delete_project_core(&db, &p.id).unwrap();

    let conn = db.conn.lock().unwrap();
    let deleted_at: Option<String> = conn
        .query_row(
            "SELECT deleted_at FROM projects WHERE id=?1",
            rusqlite::params![p.id],
            |row| row.get(0),
        )
        .unwrap();
    assert!(deleted_at.is_some());
}

#[test]
fn create_project_with_existing_id_updates_settings() {
    let db = create_test_db();
    let id = "fixed-id-123";

    let p1 = create_project_core(
        &db,
        Some(id.into()),
        "First".into(),
        "".into(),
        "".into(),
        "".into(),
        "{\"v\":1}".into(),
    )
    .unwrap();

    let p2 = create_project_core(
        &db,
        Some(id.into()),
        "First".into(),
        "".into(),
        "".into(),
        "".into(),
        "{\"v\":2}".into(),
    )
    .unwrap();

    assert_eq!(p1.id, p2.id);
    assert_eq!(p2.settings, "{\"v\":2}");
}

#[test]
fn get_setting_and_set_setting() {
    let db = create_test_db();

    let val = get_setting_core(&db, "theme");
    assert!(val.unwrap().is_none());

    set_setting_core(&db, "theme", "dark").unwrap();

    let val = get_setting_core(&db, "theme").unwrap().unwrap();
    assert_eq!(val, "dark");

    set_setting_core(&db, "theme", "light").unwrap();
    let val = get_setting_core(&db, "theme").unwrap().unwrap();
    assert_eq!(val, "light");
}

#[test]
fn touch_project_updates_timestamp() {
    let db = create_test_db();

    let p = create_project_core(
        &db,
        None,
        "Touch".into(),
        "".into(),
        "".into(),
        "".into(),
        "{}".into(),
    )
    .unwrap();

    let original_updated = p.updated_at;

    std::thread::sleep(std::time::Duration::from_millis(10));
    touch_project(&db, &p.id);

    let conn = db.conn.lock().unwrap();
    let new_updated: String = conn
        .query_row(
            "SELECT updated_at FROM projects WHERE id=?1",
            rusqlite::params![p.id],
            |row| row.get(0),
        )
        .unwrap();

    assert_ne!(original_updated, new_updated);
}
