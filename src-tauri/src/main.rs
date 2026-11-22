#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

use tauri::{
  command, AppHandle, Manager, Runtime, State, Window,
  plugin::{Builder, TauriPlugin},
  InvokeError, Result as TauriResult,
};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

// App state for file storage
struct AppState {
  storage: Arc<Mutex<HashMap<String, String>>>,
}

impl Default for AppState {
  fn default() -> Self {
    Self {
      storage: Arc::new(Mutex::new(HashMap::new())),
    }
  }
}

// Commands that bridge to the web app
#[command]
async fn native_save_as<R: Runtime>(
  window: Window<R>,
  name: String,
  data: String,
) -> TauriResult<Option<SaveResult>> {
  use tauri::dialog::FileDialogBuilder;

  let file_path = FileDialogBuilder::new()
    .set_file_name(&name)
    .add_filter("Screenwriter Pro", &["spro"])
    .add_filter("Final Draft", &["fdx"])
    .add_filter("Fountain", &["fountain", "txt"])
    .add_filter("JSON", &["json"])
    .save_file()
    .await;

  if let Some(path) = file_path {
    std::fs::write(&path, data)?;
    return Ok(Some(SaveResult {
      path: path.to_string_lossy().to_string(),
      name: name,
    }));
  }
  Ok(None)
}

#[command]
async fn native_open<R: Runtime>(
  window: Window<R>,
  types: Vec<String>,
) -> TauriResult<Option<OpenResult>> {
  use tauri::dialog::FileDialogBuilder;

  let mut filters = Vec::new();
  for t in types {
    filters.push((t.clone().to_uppercase(), vec![t]));
  }

  let file_path = FileDialogBuilder::new()
    .add_filters(filters)
    .pick_file()
    .await;

  if let Some(path) = file_path {
    let text = std::fs::read_to_string(&path)?;
    let name = path.file_name().unwrap().to_string_lossy().to_string();
    return Ok(Some(OpenResult {
      path: path.to_string_lossy().to_string(),
      text,
      name,
    }));
  }
  Ok(None)
}

#[command]
async fn native_save<R: Runtime>(
  window: Window<R>,
  name: String,
  data: String,
  path: Option<String>,
) -> TauriResult<Option<SaveResult>> {
  use tauri::dialog::FileDialogBuilder;

  let file_path = if let Some(p) = path {
    std::path::PathBuf::from(p)
  } else {
    FileDialogBuilder::new()
      .set_file_name(&name)
      .add_filter("Screenwriter Pro", &["spro"])
      .save_file()
      .await
      .unwrap_or_else(|| std::path::PathBuf::from(&name))
  };

  std::fs::write(&file_path, data)?;
  Ok(Some(SaveResult {
    path: file_path.to_string_lossy().to_string(),
    name: file_path.file_name().unwrap().to_string_lossy().to_string(),
  }))
}

#[command]
async fn native_print<R: Runtime>(
  window: Window<R>,
  title: String,
) -> TauriResult<()> {
  window.print();
  Ok(())
}

#[command]
async fn native_store_get(
  state: State<'_, AppState>,
  key: String,
) -> TauriResult<Option<String>> {
  let storage = state.storage.lock().unwrap();
  Ok(storage.get(&format!("sp:{}", key)).cloned())
}

#[command]
async fn native_store_set(
  state: State<'_, AppState>,
  key: String,
  value: String,
) -> TauriResult<()> {
  let mut storage = state.storage.lock().unwrap();
  storage.insert(format!("sp:{}", key), value);
  Ok(())
}

#[command]
async fn native_store_del(
  state: State<'_, AppState>,
  key: String,
) -> TauriResult<()> {
  let mut storage = state.storage.lock().unwrap();
  storage.remove(&format!("sp:{}", key));
  Ok(())
}

#[derive(serde::Serialize)]
struct SaveResult {
  path: String,
  name: String,
}

#[derive(serde::Serialize)]
struct OpenResult {
  path: String,
  text: String,
  name: String,
}

fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_store::Builder::new().build())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_global_shortcut::init())
    .plugin(tauri_plugin_clipboard_manager::init())
    .manage(AppState::default())
    .invoke_handler(tauri::generate_handler![
      native_save_as,
      native_open,
      native_save,
      native_print,
      native_store_get,
      native_store_set,
      native_store_del,
    ])
    .setup(|app| {
      #[cfg(debug_assertions)]
      {
        let window = app.get_webview_window("main").unwrap();
        window.open_devtools();
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}