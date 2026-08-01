use app_lib::commands::conversation::*;
use app_lib::commands::project::create_project_core;
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
fn create_and_list_conversations() {
    let db = create_test_db();
    let pid = setup_project(&db);

    create_ai_conversation_core(&db, pid.clone(), "whiteboard".into()).unwrap();
    create_ai_conversation_core(&db, pid.clone(), "knowledge".into()).unwrap();

    let convs = get_ai_conversations_core(&db, &pid).unwrap();
    assert_eq!(convs.len(), 2);
}

#[test]
fn save_and_load_messages() {
    let db = create_test_db();
    let pid = setup_project(&db);

    let conv = create_ai_conversation_core(&db, pid, "whiteboard".into()).unwrap();
    save_ai_conversation_core(
        &db,
        &conv.id,
        r#"[{"role":"user","content":"Hello"}]"#.into(),
        "Chat Title".into(),
    )
    .unwrap();

    let fetched = get_ai_conversation_core(&db, &conv.id).unwrap();
    assert_eq!(fetched.messages, r#"[{"role":"user","content":"Hello"}]"#);
    assert_eq!(fetched.title, "Chat Title");
}

#[test]
fn conversations_ordered_by_updated() {
    let db = create_test_db();
    let pid = setup_project(&db);

    let conv1 = create_ai_conversation_core(&db, pid.clone(), "whiteboard".into()).unwrap();
    std::thread::sleep(std::time::Duration::from_millis(10));
    let conv2 = create_ai_conversation_core(&db, pid.clone(), "knowledge".into()).unwrap();

    let convs = get_ai_conversations_core(&db, &pid).unwrap();
    assert_eq!(convs.len(), 2);
    assert_eq!(convs[0].id, conv2.id);
    assert_eq!(convs[1].id, conv1.id);
}

#[test]
fn delete_conversation() {
    let db = create_test_db();
    let pid = setup_project(&db);

    let conv = create_ai_conversation_core(&db, pid.clone(), "whiteboard".into()).unwrap();
    delete_ai_conversation_core(&db, &conv.id).unwrap();

    let convs = get_ai_conversations_core(&db, &pid).unwrap();
    assert!(convs.is_empty());
}
