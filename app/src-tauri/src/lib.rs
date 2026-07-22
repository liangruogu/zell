mod commands;
mod crypto;
mod db;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let app_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");

            log::info!("Database path: {:?}", app_dir.join("bindle.db"));

            let database =
                db::Database::new(app_dir.clone()).expect("failed to initialize database");

            app.manage(database);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::project::create_project,
            commands::project::get_projects,
            commands::project::get_project,
            commands::project::update_project,
            commands::project::delete_project,
            commands::project::get_setting,
            commands::project::set_setting,
            commands::knowledge::create_knowledge_article,
            commands::knowledge::get_knowledge_articles,
            commands::knowledge::get_knowledge_article,
            commands::knowledge::update_knowledge_article,
            commands::knowledge::delete_knowledge_article,
            commands::knowledge::reorder_knowledge_articles,
            commands::knowledge::get_article_summaries,
            commands::whiteboard::create_whiteboard,
            commands::whiteboard::get_whiteboards,
            commands::whiteboard::get_whiteboard,
            commands::whiteboard::save_whiteboard_snapshot,
            commands::whiteboard::rename_whiteboard,
            commands::whiteboard::delete_whiteboard,
            commands::link::create_external_link,
            commands::link::get_external_links,
            commands::link::update_external_link,
            commands::link::delete_external_link,
            commands::image::save_project_image,
            commands::image::resolve_project_image,
            commands::image::delete_project_image,
            commands::image::read_file_base64,
            commands::image::import_whiteboard_media,
            commands::file::import_project_file,
            commands::file::get_project_files,
            commands::file::resolve_project_file,
            commands::file::get_project_file_path,
            commands::file::update_project_file,
            commands::file::delete_project_file,
            commands::file::re_extract_file_text,
            commands::resource::sync_link,
            commands::resource::search_documents,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
