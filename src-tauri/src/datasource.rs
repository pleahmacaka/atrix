use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::{Number, Value as Json};
use tauri::async_runtime::Mutex;
use tauri::{AppHandle, Manager, State};
use turso::{Connection, Value, params_from_iter};
use turso_parser::ast::{Cmd, Stmt};
use turso_parser::parser::Parser;

const EXTENSION: &str = "db";

const SYNC_FILE: &str = "sync.json";

const NAME_LIMIT: usize = 64;

#[derive(Clone, Default, Serialize, Deserialize)]
pub struct SyncConfig {
    url: String,
    token: String,
}

enum Handle {
    Local(turso::Database),
    Synced(turso::sync::Database),
}

impl Handle {
    async fn connect(&self) -> Result<Connection, String> {
        match self {
            Handle::Local(db) => db.connect(),
            Handle::Synced(db) => db.connect().await,
        }
        .map_err(failed)
    }
}

#[derive(Default)]
pub struct Datasources(Mutex<HashMap<String, Handle>>);

#[derive(Serialize)]
pub struct Rows {
    columns: Vec<String>,
    rows: Vec<Vec<Json>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Executed {
    changes: u64,
    last_insert_rowid: i64,
}

fn failed(e: impl std::fmt::Display) -> String {
    format!("ds_failed:{e}")
}

fn root(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .home_dir()
        .map_err(|e| e.to_string())?
        .join(".atrix")
        .join("data");

    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    Ok(dir)
}

fn checked(name: &str) -> Result<&str, String> {
    let valid = !name.is_empty()
        && name.len() <= NAME_LIMIT
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');

    if valid {
        Ok(name)
    } else {
        Err(format!("ds_name_invalid:{name}"))
    }
}

fn file_of(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    Ok(root(app)?.join(format!("{}.{EXTENSION}", checked(name)?)))
}

fn read_sync(app: &AppHandle) -> Result<HashMap<String, SyncConfig>, String> {
    match std::fs::read_to_string(root(app)?.join(SYNC_FILE)) {
        Ok(text) => serde_json::from_str(&text).map_err(|e| e.to_string()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(HashMap::new()),
        Err(e) => Err(e.to_string()),
    }
}

fn write_sync(app: &AppHandle, all: &HashMap<String, SyncConfig>) -> Result<(), String> {
    let text = serde_json::to_string_pretty(all).map_err(|e| e.to_string())?;

    std::fs::write(root(app)?.join(SYNC_FILE), text).map_err(|e| e.to_string())
}

async fn open(app: &AppHandle, name: &str) -> Result<Handle, String> {
    let file = file_of(app, name)?;
    let path = file.to_string_lossy();

    if let Some(sync) = read_sync(app)?.remove(name) {
        let db = turso::sync::Builder::new_remote(&path)
            .with_remote_url(sync.url)
            .with_auth_token(sync.token)
            .build()
            .await
            .map_err(failed)?;

        return Ok(Handle::Synced(db));
    }

    let db = turso::Builder::new_local(&path)
        .build()
        .await
        .map_err(failed)?;

    Ok(Handle::Local(db))
}

async fn connect(app: &AppHandle, store: &Datasources, name: &str) -> Result<Connection, String> {
    let mut open_dbs = store.0.lock().await;

    if !open_dbs.contains_key(name) {
        if !file_of(app, name)?.exists() {
            return Err(format!("ds_not_found:{name}"));
        }

        open_dbs.insert(name.to_string(), open(app, name).await?);
    }

    open_dbs[name].connect().await
}

fn single(sql: &str) -> Result<&str, String> {
    let mut statements = Parser::new(sql.as_bytes());

    match (statements.next(), statements.next()) {
        (Some(Ok(_)), None) => Ok(sql),
        (Some(Err(e)), _) => Err(failed(e)),
        (None, _) => Err("ds_empty_sql".into()),
        (Some(Ok(_)), Some(_)) => Err("ds_multiple_statements".into()),
    }
}

fn read_only(sql: &str) -> Result<(), String> {
    match Parser::new(sql.as_bytes()).next() {
        Some(Ok(Cmd::Stmt(Stmt::Select(_)) | Cmd::Explain(_) | Cmd::ExplainQueryPlan { .. })) => {
            Ok(())
        }
        Some(Err(e)) => Err(failed(e)),
        _ => Err("ds_read_only".into()),
    }
}

fn bind(value: Json) -> Value {
    match value {
        Json::Null => Value::Null,
        Json::Bool(b) => Value::Integer(b.into()),
        Json::Number(n) => n
            .as_i64()
            .map(Value::Integer)
            .unwrap_or_else(|| Value::Real(n.as_f64().unwrap_or(f64::NAN))),
        Json::String(s) => Value::Text(s),
        other => Value::Text(other.to_string()),
    }
}

fn unbind(value: Value) -> Json {
    match value {
        Value::Null => Json::Null,
        Value::Integer(i) => i.into(),
        Value::Real(r) => Number::from_f64(r).map_or(Json::Null, Json::Number),
        Value::Text(s) => Json::String(s),
        Value::Blob(b) => b.into(),
    }
}

async fn select(conn: &Connection, sql: &str, params: Vec<Json>) -> Result<Rows, String> {
    let mut statement = conn.prepare(single(sql)?).await.map_err(failed)?;
    let columns = statement.column_names();
    let mut cursor = statement
        .query(params_from_iter(params.into_iter().map(bind)))
        .await
        .map_err(failed)?;
    let mut rows = Vec::new();

    while let Some(row) = cursor.next().await.map_err(failed)? {
        let values = (0..row.column_count())
            .map(|i| row.get_value(i).map(unbind))
            .collect::<Result<_, _>>()
            .map_err(failed)?;

        rows.push(values);
    }

    Ok(Rows { columns, rows })
}

#[tauri::command]
pub fn ds_list(app: AppHandle) -> Result<Vec<String>, String> {
    let mut names = std::fs::read_dir(root(&app)?)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| {
            let path = entry.ok()?.path();

            (path.extension()? == EXTENSION)
                .then(|| path.file_stem()?.to_str().map(String::from))
                .flatten()
        })
        .collect::<Vec<_>>();

    names.sort();

    Ok(names)
}

#[tauri::command]
pub async fn ds_create(
    app: AppHandle,
    store: State<'_, Datasources>,
    name: String,
) -> Result<(), String> {
    if file_of(&app, &name)?.exists() {
        return Err(format!("ds_exists:{name}"));
    }

    let handle = open(&app, &name).await?;

    handle.connect().await?;
    store.0.lock().await.insert(name, handle);

    Ok(())
}

#[tauri::command]
pub async fn ds_delete(
    app: AppHandle,
    store: State<'_, Datasources>,
    name: String,
) -> Result<(), String> {
    let prefix = format!("{}.{EXTENSION}", checked(&name)?);

    store.0.lock().await.remove(&name);

    for entry in std::fs::read_dir(root(&app)?).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        let owned = path
            .file_name()
            .and_then(|f| f.to_str())
            .is_some_and(|f| f.starts_with(&prefix));

        if owned {
            std::fs::remove_file(&path).map_err(|e| e.to_string())?;
        }
    }

    let mut all = read_sync(&app)?;

    if all.remove(&name).is_some() {
        write_sync(&app, &all)?;
    }

    Ok(())
}

#[tauri::command]
pub async fn ds_tables(
    app: AppHandle,
    store: State<'_, Datasources>,
    name: String,
) -> Result<Vec<String>, String> {
    let conn = connect(&app, &store, &name).await?;
    let found = select(
        &conn,
        "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        Vec::new(),
    )
    .await?;

    Ok(found
        .rows
        .into_iter()
        .filter_map(|mut row| match row.pop() {
            Some(Json::String(s)) => Some(s),
            _ => None,
        })
        .collect())
}

#[tauri::command]
pub async fn ds_query(
    app: AppHandle,
    store: State<'_, Datasources>,
    name: String,
    sql: String,
    params: Vec<Json>,
) -> Result<Rows, String> {
    read_only(single(&sql)?)?;

    let conn = connect(&app, &store, &name).await?;

    select(&conn, &sql, params).await
}

#[tauri::command]
pub async fn ds_execute(
    app: AppHandle,
    store: State<'_, Datasources>,
    name: String,
    sql: String,
    params: Vec<Json>,
) -> Result<Executed, String> {
    let conn = connect(&app, &store, &name).await?;
    let changes = conn
        .execute(
            single(&sql)?,
            params_from_iter(params.into_iter().map(bind)),
        )
        .await
        .map_err(failed)?;

    Ok(Executed {
        changes,
        last_insert_rowid: conn.last_insert_rowid(),
    })
}

#[tauri::command]
pub fn ds_sync_get(app: AppHandle) -> Result<HashMap<String, SyncConfig>, String> {
    read_sync(&app)
}

#[tauri::command]
pub async fn ds_sync_set(
    app: AppHandle,
    store: State<'_, Datasources>,
    name: String,
    config: Option<SyncConfig>,
) -> Result<(), String> {
    checked(&name)?;

    let mut all = read_sync(&app)?;

    match config {
        Some(c) if !c.url.trim().is_empty() => all.insert(name.clone(), c),
        _ => all.remove(&name),
    };

    write_sync(&app, &all)?;
    store.0.lock().await.remove(&name);

    Ok(())
}

#[tauri::command]
pub async fn ds_sync(
    app: AppHandle,
    store: State<'_, Datasources>,
    name: String,
) -> Result<bool, String> {
    connect(&app, &store, &name).await?;

    let open_dbs = store.0.lock().await;

    let Some(Handle::Synced(db)) = open_dbs.get(&name) else {
        return Err(format!("ds_sync_unset:{name}"));
    };

    db.push().await.map_err(failed)?;

    db.pull().await.map_err(failed)
}
