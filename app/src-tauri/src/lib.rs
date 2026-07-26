mod commands;
mod crypto;
mod db;

use crate::commands::server::ServerState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
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

            log::info!("Database path: {:?}", app_dir.join("zell.db"));

            let database =
                db::Database::new(app_dir.clone()).expect("failed to initialize database");

            app.manage(database);
            app.manage(ServerState::new());

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
            commands::conversation::create_ai_conversation,
            commands::conversation::get_ai_conversations,
            commands::conversation::save_ai_conversation,
            commands::conversation::delete_ai_conversation,
            commands::conversation::get_ai_conversation,
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
            commands::link::sync_link,
            commands::resource::search_documents,
            commands::resource::search_knowledge,
            commands::resource::search_resources,
            commands::resource::get_resource_content,
            commands::image::save_project_image,
            commands::image::save_project_image_bytes,
            commands::image::resolve_project_image,
            commands::image::delete_project_image,
            commands::file::import_project_file,
            commands::file::get_project_files,
            commands::file::resolve_project_file,
            commands::file::get_project_file_path,
            commands::file::update_project_file,
            commands::file::delete_project_file,
            commands::file::re_extract_file_text,
            commands::file::rename_project_file,
            commands::system::open_in_system,
            commands::system::get_local_ip,
            commands::system::list_system_fonts,
            commands::export::export_article,
            commands::server::start_server,
            commands::server::stop_server,
            commands::server::get_server_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
