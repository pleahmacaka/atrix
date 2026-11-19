use std::collections::{BTreeSet, HashMap};
use std::fmt::Display;
use std::fs;
use std::io::ErrorKind;
use std::path::PathBuf;
use std::sync::Arc;

use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::{Number, Value as Json};
use tauri::async_runtime::Mutex;
use tauri::{AppHandle, Manager, State};
use turso::{Connection, Value, params_from_iter};
use turso_parser::ast::{Cmd, Stmt};
use turso_parser::parser::Parser;

use crate::error::{Error, Result};

const EXTENSION: &str = "db";

const KNOWLEDGE_FILE: &str = "knowledge.json";

const NAME_LIMIT: usize = 64;

#[derive(Default)]
pub struct Datasources(Mutex<HashMap<String, Arc<turso::Database>>>);

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

fn failed(e: impl Display) -> Error {
    Error::code("ds_failed", e)
}

fn root(app: &AppHandle) -> Result<PathBuf> {
    let dir = app.path().home_dir()?.join(".atrix").join("data");

    fs::create_dir_all(&dir)?;

    Ok(dir)
}

fn checked(name: &str) -> Result<&str> {
    let valid = !name.is_empty()
        && name.len() <= NAME_LIMIT
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');

    if valid {
        Ok(name)
    } else {
        Err(Error::code("ds_name_invalid", name))
    }
}

fn file_of(app: &AppHandle, name: &str) -> Result<PathBuf> {
    Ok(root(app)?.join(format!("{}.{EXTENSION}", checked(name)?)))
}

fn existing(app: &AppHandle, name: &str) -> Result<()> {
    if file_of(app, name)?.exists() {
        Ok(())
    } else {
        Err(Error::code("ds_not_found", name))
    }
}

fn read_json<T: DeserializeOwned + Default>(app: &AppHandle, file: &str) -> Result<T> {
    match fs::read_to_string(root(app)?.join(file)) {
        Ok(text) => Ok(serde_json::from_str(&text)?),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(T::default()),
        Err(e) => Err(e.into()),
    }
}

fn write_json(app: &AppHandle, file: &str, value: &impl Serialize) -> Result<()> {
    let text = serde_json::to_string_pretty(value)?;

    Ok(fs::write(root(app)?.join(file), text)?)
}

fn read_knowledge(app: &AppHandle) -> Result<BTreeSet<String>> {
    read_json(app, KNOWLEDGE_FILE)
}

async fn open(app: &AppHandle, name: &str) -> Result<turso::Database> {
    turso::Builder::new_local(&file_of(app, name)?.to_string_lossy())
        .build()
        .await
        .map_err(failed)
}

async fn connect(app: &AppHandle, store: &Datasources, name: &str) -> Result<Connection> {
    let mut open_dbs = store.0.lock().await;

    if !open_dbs.contains_key(name) {
        existing(app, name)?;
        open_dbs.insert(name.to_string(), Arc::new(open(app, name).await?));
    }

    open_dbs[name].connect().map_err(failed)
}

fn single(sql: &str) -> Result<&str> {
    let mut statements = Parser::new(sql.as_bytes());

    match (statements.next(), statements.next()) {
        (Some(Ok(_)), None) => Ok(sql),
        (Some(Err(e)), _) => Err(failed(e)),
        (None, _) => Err("ds_empty_sql".into()),
        (Some(Ok(_)), Some(_)) => Err("ds_multiple_statements".into()),
    }
}

fn read_only(sql: &str) -> Result<()> {
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

async fn select(conn: &Connection, sql: &str, params: Vec<Json>) -> Result<Rows> {
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

#[tauri::command(async)]
pub fn ds_list(app: AppHandle) -> Result<Vec<String>> {
    let mut names = fs::read_dir(root(&app)?)?
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
pub async fn ds_create(app: AppHandle, store: State<'_, Datasources>, name: String) -> Result<()> {
    if file_of(&app, &name)?.exists() {
        return Err(Error::code("ds_exists", name));
    }

    let handle = open(&app, &name).await?;

    handle.connect().map_err(failed)?;
    store.0.lock().await.insert(name, Arc::new(handle));

    Ok(())
}

#[tauri::command]
pub async fn ds_delete(app: AppHandle, store: State<'_, Datasources>, name: String) -> Result<()> {
    let prefix = format!("{}.{EXTENSION}", checked(&name)?);

    store.0.lock().await.remove(&name);

    for entry in fs::read_dir(root(&app)?)? {
        let path = entry?.path();
        let owned = path
            .file_name()
            .and_then(|f| f.to_str())
            .is_some_and(|f| f.starts_with(&prefix));

        if owned {
            fs::remove_file(&path)?;
        }
    }

    let mut knowledge = read_knowledge(&app)?;

    if knowledge.remove(&name) {
        write_json(&app, KNOWLEDGE_FILE, &knowledge)?;
    }

    Ok(())
}

#[tauri::command(async)]
pub fn ds_knowledge_get(app: AppHandle) -> Result<BTreeSet<String>> {
    read_knowledge(&app)
}

#[tauri::command(async)]
pub fn ds_knowledge_set(app: AppHandle, name: String, on: bool) -> Result<()> {
    existing(&app, &name)?;

    let mut knowledge = read_knowledge(&app)?;
    let changed = if on {
        knowledge.insert(name)
    } else {
        knowledge.remove(&name)
    };

    if changed {
        write_json(&app, KNOWLEDGE_FILE, &knowledge)?;
    }

    Ok(())
}

#[tauri::command]
pub async fn ds_tables(
    app: AppHandle,
    store: State<'_, Datasources>,
    name: String,
) -> Result<Vec<String>> {
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
) -> Result<Rows> {
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
) -> Result<Executed> {
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
