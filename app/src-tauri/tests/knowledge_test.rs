use app_lib::commands::knowledge::*;
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
fn create_and_fetch_article() {
    let db = create_test_db();
    let pid = setup_project(&db);

    let article =
        create_knowledge_article_core(&db, pid.clone(), "Hello World".into(), "".into(), None, None, None)
            .unwrap();
    assert_eq!(article.title, "Hello World");
    assert!(!article.id.is_empty());

    let articles = get_knowledge_articles_core(&db, &pid).unwrap();
    assert_eq!(articles.len(), 1);
    assert_eq!(articles[0].title, "Hello World");
}

#[test]
fn fetch_article_by_id() {
    let db = create_test_db();
    let pid = setup_project(&db);

    let article =
        create_knowledge_article_core(&db, pid, "Specific".into(), "".into(), None, None, None).unwrap();
    let fetched = get_knowledge_article_core(&db, &article.id).unwrap();
    assert_eq!(fetched.title, "Specific");
}

#[test]
fn update_article() {
    let db = create_test_db();
    let pid = setup_project(&db);

    let article = create_knowledge_article_core(
        &db,
        pid,
        "Old Title".into(),
        "Old Content".into(),
        None,
        None,
        None,
    )
    .unwrap();
    update_knowledge_article_core(
        &db,
        &article.id,
        "New Title".into(),
        "New Content".into(),
        "{}".into(),
    )
    .unwrap();

    let fetched = get_knowledge_article_core(&db, &article.id).unwrap();
    assert_eq!(fetched.title, "New Title");
    assert_eq!(fetched.content, "New Content");
}

#[test]
fn delete_article() {
    let db = create_test_db();
    let pid = setup_project(&db);

    let article =
        create_knowledge_article_core(&db, pid.clone(), "To Delete".into(), "".into(), None, None, None)
            .unwrap();
    delete_knowledge_article_core(&db, &article.id).unwrap();

    let articles = get_knowledge_articles_core(&db, &pid).unwrap();
    assert!(articles.is_empty());
}

#[test]
fn create_child_article() {
    let db = create_test_db();
    let pid = setup_project(&db);

    let parent = create_knowledge_article_core(
        &db,
        pid.clone(),
        "Parent".into(),
        "".into(),
        None,
        None,
        None,
    )
    .unwrap();
    let child = create_knowledge_article_core(
        &db,
        pid,
        "Child".into(),
        "".into(),
        Some(parent.id.clone()),
        None,
        None,
    )
    .unwrap();

    assert_eq!(child.parent_id, Some(parent.id));
}

#[test]
fn reorder_articles() {
    let db = create_test_db();
    let pid = setup_project(&db);

    let a1 = create_knowledge_article_core(&db, pid.clone(), "First".into(), "".into(), None, None, None)
        .unwrap();
    let a2 = create_knowledge_article_core(&db, pid.clone(), "Second".into(), "".into(), None, None, None)
        .unwrap();

    reorder_knowledge_articles_core(&db, &[a2.id.clone(), a1.id.clone()]).unwrap();

    let articles = get_knowledge_articles_core(&db, &pid).unwrap();
    assert_eq!(articles[0].id, a2.id);
    assert_eq!(articles[1].id, a1.id);
}

#[test]
fn fetch_article_not_found_errors() {
    let db = create_test_db();
    let result = get_knowledge_article_core(&db, "nonexistent");
    assert!(result.is_err());
}

#[test]
fn articles_isolated_by_project() {
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

    create_knowledge_article_core(&db, p1.clone(), "P1 Article".into(), "".into(), None, None, None)
        .unwrap();
    create_knowledge_article_core(&db, p2.clone(), "P2 Article".into(), "".into(), None, None, None)
        .unwrap();

    let p1_articles = get_knowledge_articles_core(&db, &p1).unwrap();
    let p2_articles = get_knowledge_articles_core(&db, &p2).unwrap();
    assert_eq!(p1_articles.len(), 1);
    assert_eq!(p2_articles.len(), 1);
    assert_eq!(p1_articles[0].title, "P1 Article");
    assert_eq!(p2_articles[0].title, "P2 Article");
}
