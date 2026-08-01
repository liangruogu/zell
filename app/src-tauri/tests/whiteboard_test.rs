use app_lib::commands::project::create_project_core;
use app_lib::commands::whiteboard::*;
use app_lib::db::test_utils::create_test_db;

fn setup_project(db: &app_lib::db::Database) -> String {
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

#[test]
fn create_and_list_whiteboards() {
    let db = create_test_db();
    let pid = setup_project(&db);

    create_whiteboard_core(&db, &pid, "Board 1".into(), "free".into()).unwrap();
    create_whiteboard_core(&db, &pid, "Board 2".into(), "free".into()).unwrap();

    let boards = get_whiteboards_core(&db, &pid).unwrap();
    assert_eq!(boards.len(), 2);
    assert_eq!(boards[0].name, "Board 1");
    assert_eq!(boards[1].name, "Board 2");
}

#[test]
fn whiteboard_types() {
    let db = create_test_db();
    let pid = setup_project(&db);

    let ppt = create_whiteboard_core(&db, &pid, "PPT".into(), "ppt".into()).unwrap();
    let aigc = create_whiteboard_core(&db, &pid, "AIGC".into(), "aigc".into()).unwrap();
    let ui = create_whiteboard_core(&db, &pid, "UI".into(), "ui".into()).unwrap();
    let mood = create_whiteboard_core(&db, &pid, "Mood".into(), "mood".into()).unwrap();

    assert_eq!(ppt.wb_type, "ppt");
    assert_eq!(aigc.wb_type, "aigc");
    assert_eq!(ui.wb_type, "ui");
    assert_eq!(mood.wb_type, "mood");
}

#[test]
fn save_and_load_snapshot() {
    let db = create_test_db();
    let pid = setup_project(&db);

    let wb = create_whiteboard_core(&db, &pid, "Board".into(), "free".into()).unwrap();
    save_whiteboard_snapshot_core(&db, &wb.id, r#"{"elements":[]}"#.into()).unwrap();

    let fetched = get_whiteboard_core(&db, &wb.id).unwrap();
    assert_eq!(fetched.snapshot, Some(r#"{"elements":[]}"#.into()));
}

#[test]
fn rename_whiteboard() {
    let db = create_test_db();
    let pid = setup_project(&db);

    let wb = create_whiteboard_core(&db, &pid, "Old Name".into(), "free".into()).unwrap();
    rename_whiteboard_core(&db, &wb.id, "New Name".into()).unwrap();

    let fetched = get_whiteboard_core(&db, &wb.id).unwrap();
    assert_eq!(fetched.name, "New Name");
}

#[test]
fn delete_whiteboard() {
    let db = create_test_db();
    let pid = setup_project(&db);

    let wb = create_whiteboard_core(&db, &pid, "To Delete".into(), "free".into()).unwrap();
    delete_whiteboard_core(&db, &wb.id).unwrap();

    let boards = get_whiteboards_core(&db, &pid).unwrap();
    assert!(boards.is_empty());
}

#[test]
fn whiteboards_isolated_by_project() {
    let db = create_test_db();
    let p1 = setup_project(&db);
    let p2 = create_project_core(
        &db,
        None,
        "Project 2".into(),
        "".into(),
        "".into(),
        "".into(),
        "{}".into(),
    )
    .unwrap()
    .id;

    create_whiteboard_core(&db, &p1, "P1 Board".into(), "free".into()).unwrap();
    create_whiteboard_core(&db, &p2, "P2 Board".into(), "free".into()).unwrap();

    let p1_boards = get_whiteboards_core(&db, &p1).unwrap();
    let p2_boards = get_whiteboards_core(&db, &p2).unwrap();
    assert_eq!(p1_boards.len(), 1);
    assert_eq!(p2_boards.len(), 1);
    assert_eq!(p1_boards[0].name, "P1 Board");
    assert_eq!(p2_boards[0].name, "P2 Board");
}
