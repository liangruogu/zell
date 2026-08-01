use app_lib::commands::project::create_project_core;
use app_lib::commands::resource::*;
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
fn index_and_search_documents() {
    let db = create_test_db();
    let pid = setup_project(&db);

    index_document(
        &db,
        &pid,
        "knowledge",
        "article-1",
        "Getting Started",
        "This is a guide for getting started with Zell.",
    )
    .unwrap();

    let results = search_documents_core(&db, &pid, "getting", None).unwrap();
    assert!(!results.is_empty());
    assert_eq!(results[0].title, "Getting Started");
    assert_eq!(results[0].source_type, "knowledge");
}

#[test]
fn search_by_chinese_text() {
    let db = create_test_db();
    let pid = setup_project(&db);

    index_document(
        &db,
        &pid,
        "knowledge",
        "article-cn",
        "Zell 入门指南",
        "这是Zell的入门指南，包含基础知识介绍。Learn Zell basics here.",
    )
    .unwrap();

    let results = search_documents_core(&db, &pid, "basics", None).unwrap();
    assert!(!results.is_empty());
    assert_eq!(results[0].title, "Zell 入门指南");
}

#[test]
fn test_delete_document_index() {
    let db = create_test_db();
    let pid = setup_project(&db);

    index_document(
        &db,
        &pid,
        "knowledge",
        "article-del",
        "Delete Me",
        "This document will be deleted.",
    )
    .unwrap();

    delete_document_index(&db, "knowledge", "article-del").unwrap();

    let results = search_documents_core(&db, &pid, "deleted", None).unwrap();
    assert!(results.is_empty());
}

#[test]
fn search_knowledge_only() {
    let db = create_test_db();
    let pid = setup_project(&db);

    index_document(
        &db,
        &pid,
        "knowledge",
        "kn-1",
        "Knowledge Item",
        "Knowledge content here.",
    )
    .unwrap();
    index_document(
        &db,
        &pid,
        "file",
        "file-1",
        "File Item",
        "File content here.",
    )
    .unwrap();

    let results = search_knowledge_core(&db, &pid, "content", None).unwrap();
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].source_type, "knowledge");
}

#[test]
fn search_resources_only() {
    let db = create_test_db();
    let pid = setup_project(&db);

    index_document(
        &db,
        &pid,
        "file",
        "res-file",
        "Resource File",
        "Resource file content here.",
    )
    .unwrap();
    index_document(
        &db,
        &pid,
        "link",
        "res-link",
        "Resource Link",
        "Resource link content here.",
    )
    .unwrap();
    index_document(
        &db,
        &pid,
        "knowledge",
        "res-kn",
        "Resource Knowledge",
        "Knowledge should not appear.",
    )
    .unwrap();

    let results = search_resources_core(&db, &pid, "resource", None).unwrap();
    assert_eq!(results.len(), 2);
    for r in &results {
        assert!(r.source_type == "file" || r.source_type == "link");
    }
}
