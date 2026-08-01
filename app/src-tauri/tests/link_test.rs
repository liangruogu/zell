use app_lib::commands::link::*;
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

#[tokio::test]
async fn create_and_list_links() {
    let db = create_test_db();
    let pid = setup_project(&db);

    create_external_link_core(
        &db,
        &pid,
        "Test Link".into(),
        "http://127.0.0.1:19999/".into(),
        "A test link".into(),
        "web".into(),
        "".into(),
    )
    .await
    .unwrap();

    let links = get_external_links_core(&db, &pid).unwrap();
    assert_eq!(links.len(), 1);
    assert_eq!(links[0].title, "Test Link");
    assert_eq!(links[0].url, "http://127.0.0.1:19999/");
}

#[test]
fn update_link() {
    let db = create_test_db();
    let pid = setup_project(&db);

    let rt = tokio::runtime::Runtime::new().unwrap();
    let link = rt.block_on(create_external_link_core(
        &db,
        &pid,
        "Old".into(),
        "http://127.0.0.1:19999/".into(),
        "desc".into(),
        "web".into(),
        "".into(),
    ))
    .unwrap();

    update_external_link_core(
        &db,
        &link.id,
        "Updated".into(),
        "http://127.0.0.1:19999/updated".into(),
        "new desc".into(),
        "github".into(),
        "code".into(),
    )
    .unwrap();

    let links = get_external_links_core(&db, &pid).unwrap();
    assert_eq!(links[0].title, "Updated");
    assert_eq!(links[0].link_type, "github");
    assert_eq!(links[0].description, "new desc");
}

#[test]
fn delete_link() {
    let db = create_test_db();
    let pid = setup_project(&db);

    let rt = tokio::runtime::Runtime::new().unwrap();
    let link = rt.block_on(create_external_link_core(
        &db,
        &pid,
        "To Delete".into(),
        "http://127.0.0.1:19999/".into(),
        "".into(),
        "web".into(),
        "".into(),
    ))
    .unwrap();

    delete_external_link_core(&db, &link.id).unwrap();

    let links = get_external_links_core(&db, &pid).unwrap();
    assert!(links.is_empty());
}

#[test]
fn links_by_type() {
    let db = create_test_db();
    let pid = setup_project(&db);

    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(create_external_link_core(
        &db,
        &pid,
        "Web Link".into(),
        "http://127.0.0.1:19999/".into(),
        "".into(),
        "web".into(),
        "".into(),
    ))
    .unwrap();
    rt.block_on(create_external_link_core(
        &db,
        &pid,
        "Github Link".into(),
        "http://127.0.0.1:19999/gh".into(),
        "".into(),
        "github".into(),
        "".into(),
    ))
    .unwrap();

    let links = get_external_links_core(&db, &pid).unwrap();
    assert_eq!(links.len(), 2);
    assert_eq!(links[0].link_type, "web");
    assert_eq!(links[1].link_type, "github");
}
