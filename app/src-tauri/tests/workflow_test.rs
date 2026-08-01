use app_lib::commands::knowledge::*;
use app_lib::commands::project::*;
use app_lib::commands::resource::*;
use app_lib::commands::whiteboard::*;
use app_lib::db::test_utils::create_test_db;

#[test]
fn full_crud_workflow() {
    let db = create_test_db();

    let project = create_project_core(
        &db,
        None,
        "Workflow Project".into(),
        "A test workflow".into(),
        "#fff".into(),
        "book".into(),
        "{}".into(),
    )
    .unwrap();
    assert_eq!(project.name, "Workflow Project");

    let article = create_knowledge_article_core(
        &db,
        project.id.clone(),
        "Workflow Article".into(),
        "Hello Workflow".into(),
        None,
        None,
        None,
    )
    .unwrap();
    assert_eq!(article.title, "Workflow Article");

    index_document(
        &db,
        &project.id,
        "knowledge",
        &article.id,
        &article.title,
        "Hello Workflow content for FTS5 indexing",
    )
    .unwrap();

    let search_results = search_documents_core(&db, &project.id, "Workflow", None).unwrap();
    assert!(!search_results.is_empty());
    assert_eq!(search_results[0].source_id, article.id);

    let wb = create_whiteboard_core(&db, &project.id, "Workflow Board".into(), "free".into()).unwrap();
    assert_eq!(wb.project_id, project.id);

    delete_project_core(&db, &project.id).unwrap();

    let projects = get_projects_core(&db).unwrap();
    assert!(projects.is_empty());

    let articles = get_knowledge_articles_core(&db, &project.id).unwrap();
    assert_eq!(articles.len(), 1);

    let boards = get_whiteboards_core(&db, &project.id).unwrap();
    assert_eq!(boards.len(), 1);
}
