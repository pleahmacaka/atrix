use std::collections::HashMap;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::Instant;

use acp_harness::adapters::{
    self, Adapter, Auth, AuthMethod, Home, ModelSelect, Skills, Source as Origin, Status,
};
use acp_harness::compose::{
    Composition, Isolation, McpServer, McpTransport, OwnedSkill, SkillBody, SkillSource, ToolSource,
};
use acp_harness::global::{self, Owner, Roots, Scope};
use acp_harness::install::{self as resolver, Download, Invocation, Resolution};
use acp_harness::materialize::{self, Launch, Prepared};
use acp_harness::provider::{Provider, ProviderSupport, WireApi};
use acp_harness::registry::{self, Agent, Registry};
use acp_harness::reqwest;
use acp_harness::session::{AgentCapabilities, Item, Reason, Skipped};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;
use tauri::async_runtime::spawn_blocking;
use tauri::ipc::Channel;
use tauri_plugin_log::log::info;

use crate::agents::{Agents, Frame};
use crate::error::{Error, Result};
use crate::install::{self, Found, Source};
use crate::platform;
use crate::process::{self, home};

#[derive(Default)]
pub struct Harnesses {
    registry: Mutex<Option<Registry>>,
    runs: Mutex<HashMap<String, Invocation>>,
}

enum Presence {
    Installed { run: Invocation, local: bool },
    Runner(Invocation),
    Download(Download),
    Missing(Option<&'static str>),
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Listing {
    id: &'static str,
    name: &'static str,
    version: String,
    description: String,
    website: Option<String>,
    repository: Option<String>,
    state: &'static str,
    local: bool,
    requires: Option<&'static str>,
    wires: Vec<WireApi>,
    skills: bool,
    login: Option<String>,
    vendor: Option<&'static str>,
    transcript: Option<&'static str>,
}

#[derive(Deserialize)]
#[serde(tag = "source", rename_all = "camelCase")]
pub enum SkillSpec {
    Atrix { name: String, content: String },
    Global { dir: PathBuf },
}

#[derive(Deserialize)]
#[serde(tag = "source", rename_all = "camelCase")]
pub enum ToolSpec {
    Atrix { server: McpServer },
    Global { path: PathBuf, name: String },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Spec {
    harness: String,
    home: String,
    #[serde(default)]
    carry: bool,
    #[serde(default)]
    native: bool,
    cwd: Option<PathBuf>,
    provider: Option<Provider>,
    model: Option<String>,
    #[serde(default)]
    skills: Vec<SkillSpec>,
    #[serde(default)]
    tools: Vec<ToolSpec>,
    instructions: Option<String>,
    #[serde(default)]
    additional_dirs: Vec<PathBuf>,
}

#[derive(Serialize)]
pub struct Skip {
    item: &'static str,
    name: Option<String>,
    reason: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Model {
    config_id: Option<&'static str>,
    value: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    new_session: Value,
    model: Option<Model>,
    skipped: Vec<Skip>,
}

#[derive(Serialize)]
pub struct GlobalSkill {
    name: String,
    dir: PathBuf,
    owner: &'static str,
    scope: &'static str,
}

#[derive(Serialize)]
pub struct GlobalTool {
    name: String,
    kind: &'static str,
    target: String,
    owner: &'static str,
    scope: &'static str,
    path: PathBuf,
}

#[derive(Serialize)]
pub struct Global {
    skills: Vec<GlobalSkill>,
    tools: Vec<GlobalTool>,
}

fn atrix_dir() -> PathBuf {
    home().join(".atrix")
}

fn cache_file() -> PathBuf {
    atrix_dir().join("harness").join("registry.json")
}

fn bin_dir() -> PathBuf {
    atrix_dir().join("harness").join("bin")
}

fn client() -> Result<reqwest::Client> {
    Ok(reqwest::Client::builder()
        .user_agent("atrix")
        .build()
        .map_err(acp_harness::Error::from)?)
}

fn relative(path: &str) -> Result<PathBuf> {
    let clean = Path::new(path);
    let normal = clean
        .components()
        .all(|c| matches!(c, Component::Normal(_)));

    if !normal || clean.as_os_str().is_empty() {
        return Err(Error::code("harness_home_invalid", path));
    }

    Ok(clean.to_path_buf())
}

async fn registry_of(state: &Harnesses, refresh: bool) -> Result<Registry> {
    let known = state.registry.lock()?.clone();

    if let (false, Some(known)) = (refresh, known) {
        return Ok(known);
    }

    let cache = cache_file();
    let loaded = match refresh {
        true => None,
        false => registry::load(&cache)?,
    };
    let fresh = match loaded {
        Some(cached) => cached,
        None => match registry::refresh(&client()?, &cache).await {
            Ok((fetched, _)) => fetched,
            Err(e) => registry::load(&cache)?.ok_or(e)?,
        },
    };

    *state.registry.lock()? = Some(fresh.clone());

    Ok(fresh)
}

fn launchable(adapter: &Adapter) -> bool {
    matches!(adapter.status, Status::Ready | Status::Unmaintained)
        && adapter.source != Origin::NoAcp
}

fn entries(registry: Option<&Registry>) -> Vec<(&'static Adapter, Option<Agent>)> {
    adapters::all()
        .iter()
        .filter(|a| launchable(a))
        .filter_map(|a| match a.source {
            Origin::Registry => Some((a, Some(registry?.agent(a.id)?.clone()))),
            _ => Some((a, None)),
        })
        .collect()
}

fn older(agent: &Agent) -> Option<Invocation> {
    let target = agent.distribution.binary_for(registry::platform()?)?;
    let dir = resolver::install_dir(agent, &bin_dir()).ok()?;

    fs::read_dir(dir.parent()?)
        .ok()?
        .flatten()
        .map(|version| version.path().join(&target.cmd))
        .find(|path| path.is_file())
        .map(|command| Invocation {
            command,
            args: target.args.clone(),
            env: target.env.clone(),
        })
}

fn legacy(agent: &Agent) -> Option<(Invocation, bool)> {
    let distribution = &agent.distribution;
    let binary = registry::platform()
        .and_then(|p| distribution.binary_for(p))
        .map(|t| {
            let source = Source::Binary {
                id: &agent.id,
                cmd: &t.cmd,
            };

            (source, &t.args, &t.env)
        });
    let npm = distribution.npx.as_ref().map(|p| {
        let source = Source::Npm {
            package: &p.package,
        };

        (source, &p.args, &p.env)
    });
    let uv = distribution.uvx.as_ref().map(|p| {
        let source = Source::Uv {
            package: &p.package,
        };

        (source, &p.args, &p.env)
    });

    [binary, npm, uv]
        .into_iter()
        .flatten()
        .find_map(|(source, args, env)| {
            let Found { path, local } = install::find(&source)?;
            let run = Invocation {
                command: path,
                args: args.clone(),
                env: env.clone(),
            };

            Some((run, local))
        })
}

fn requirement(agent: &Agent) -> Option<&'static str> {
    match (&agent.distribution.npx, &agent.distribution.uvx) {
        (Some(_), _) => Some("node"),
        (None, Some(_)) => Some("uv"),
        (None, None) => None,
    }
}

fn presence(adapter: &Adapter, agent: Option<&Agent>) -> Presence {
    let Some(agent) = agent else {
        return match adapter.source {
            Origin::OnPath(line) => match resolver::on_path(line) {
                Some(run) => Presence::Installed { run, local: false },
                None => Presence::Missing(None),
            },
            _ => Presence::Missing(None),
        };
    };

    let cache = bin_dir();

    if let Some(run) = resolver::installed(agent, &cache).or_else(|| older(agent)) {
        let local = run.command.starts_with(&cache);

        return Presence::Installed { run, local };
    }

    if let Some((run, local)) = legacy(agent) {
        return Presence::Installed { run, local };
    }

    match resolver::resolve(agent, &cache) {
        Ok(Resolution::Ready(run)) if companion(adapter) => {
            Presence::Installed { run, local: false }
        }
        Ok(Resolution::Ready(run)) => Presence::Runner(run),
        Ok(Resolution::NeedsDownload(download)) => Presence::Download(download),
        Err(_) => Presence::Missing(requirement(agent)),
    }
}

fn companion(adapter: &Adapter) -> bool {
    let short = ["-acp", "-cli", "-code"]
        .iter()
        .find_map(|suffix| adapter.id.strip_suffix(suffix))
        .unwrap_or(adapter.id);
    let word = adapter
        .name
        .split_whitespace()
        .next()
        .unwrap_or(adapter.id)
        .to_lowercase();

    [adapter.id, short, &word]
        .into_iter()
        .any(|name| process::which(name).is_some())
}

fn quoted(run: &Invocation, extra: &[&str]) -> String {
    let program = format!("\"{}\"", run.command.display());

    [program]
        .into_iter()
        .chain(run.args.iter().cloned())
        .chain(extra.iter().map(|a| a.to_string()))
        .collect::<Vec<_>>()
        .join(" ")
}

fn login(adapter: &Adapter, run: Option<&Invocation>) -> Option<String> {
    let Auth::Known(methods) = adapter.auth else {
        return None;
    };

    methods.iter().find_map(|method| match method {
        AuthMethod::Login(line) => Some(line.join(" ")),
        AuthMethod::Terminal(args) => run.map(|run| quoted(run, args)),
        AuthMethod::Agent(_) | AuthMethod::Env(_) => None,
    })
}

fn wires(adapter: &Adapter) -> Vec<WireApi> {
    match adapter.provider {
        ProviderSupport::Mapped(mapping) => mapping.wires(),
        _ => Vec::new(),
    }
}

fn listing(adapter: &'static Adapter, agent: Option<Agent>) -> (Listing, Option<Invocation>) {
    let found = presence(adapter, agent.as_ref());
    let (state, local, requires, run) = match &found {
        Presence::Installed { run, local } => ("installed", *local, None, Some(run)),
        Presence::Runner(run) => ("runner", false, None, Some(run)),
        Presence::Download(_) => ("download", false, None, None),
        Presence::Missing(requires) => ("missing", false, *requires, None),
    };
    let skills = matches!(adapter.skills, Skills::Config(_))
        && matches!(adapter.home, Home::Redirect { .. });

    let listing = Listing {
        id: adapter.id,
        name: adapter.name,
        version: agent
            .as_ref()
            .map(|a| a.version.clone())
            .unwrap_or_default(),
        description: agent
            .as_ref()
            .map(|a| a.description.clone())
            .unwrap_or_default(),
        website: agent.as_ref().and_then(|a| a.website.clone()),
        repository: agent.as_ref().and_then(|a| a.repository.clone()),
        state,
        local,
        requires,
        wires: wires(adapter),
        skills,
        login: login(adapter, run),
        vendor: adapter.vendor,
        transcript: adapter.transcript,
    };

    (listing, run.cloned())
}

#[tauri::command]
pub async fn harness_list(state: State<'_, Harnesses>, refresh: bool) -> Result<Vec<Listing>> {
    let started = Instant::now();
    let registry = registry_of(&state, refresh).await.ok();
    let listed: Vec<(Listing, Option<Invocation>)> = spawn_blocking(move || {
        std::thread::scope(|scope| {
            let probes: Vec<_> = entries(registry.as_ref())
                .into_iter()
                .map(|(adapter, agent)| scope.spawn(move || listing(adapter, agent)))
                .collect();

            probes.into_iter().filter_map(|p| p.join().ok()).collect()
        })
    })
    .await?;
    let mut runs = state.runs.lock()?;

    runs.clear();
    runs.extend(
        listed
            .iter()
            .filter_map(|(l, run)| Some((l.id.to_owned(), run.clone()?))),
    );
    info!("harness list {}ms", started.elapsed().as_millis());

    Ok(listed.into_iter().map(|(listing, _)| listing).collect())
}

async fn agent_of(state: &Harnesses, id: &str) -> Result<Agent> {
    registry_of(state, false)
        .await?
        .agent(id)
        .cloned()
        .ok_or_else(|| Error::code("unknown_harness", id))
}

#[tauri::command]
pub async fn harness_install(
    state: State<'_, Harnesses>,
    id: String,
    channel: Channel<String>,
) -> Result<()> {
    let agent = agent_of(&state, &id).await?;
    let binary = registry::platform().and_then(|p| agent.distribution.binary_for(p));

    if let Some(target) = binary {
        let _ = channel.send(target.archive.clone());
        let download = Download {
            target: target.clone(),
            dir: resolver::install_dir(&agent, &bin_dir())?,
        };

        resolver::download(&client()?, &download).await?;

        return Ok(());
    }

    spawn_blocking(move || {
        let source = match (&agent.distribution.npx, &agent.distribution.uvx) {
            (Some(p), _) => Source::Npm {
                package: &p.package,
            },
            (None, Some(p)) => Source::Uv {
                package: &p.package,
            },
            (None, None) => return Err(Error::code("install_unsupported", &agent.id)),
        };

        install::install(&source, &channel)
    })
    .await?
}

#[tauri::command]
pub async fn harness_uninstall(
    state: State<'_, Harnesses>,
    id: String,
    channel: Channel<String>,
) -> Result<()> {
    let agent = agent_of(&state, &id).await?;

    spawn_blocking(move || {
        let cached = resolver::install_dir(&agent, &bin_dir())?;

        if let Some(dir) = cached.parent().filter(|dir| dir.is_dir()) {
            fs::remove_dir_all(dir)?;

            return Ok(());
        }

        let distribution = &agent.distribution;
        let binary = registry::platform()
            .and_then(|p| distribution.binary_for(p))
            .map(|t| Source::Binary {
                id: &agent.id,
                cmd: &t.cmd,
            });
        let npm = distribution.npx.as_ref().map(|p| Source::Npm {
            package: &p.package,
        });
        let uv = distribution.uvx.as_ref().map(|p| Source::Uv {
            package: &p.package,
        });
        let source = [binary, npm, uv]
            .into_iter()
            .flatten()
            .find(|s| install::find(s).is_some_and(|f| f.local))
            .ok_or("harness_not_local")?;

        install::uninstall(&source, &channel)
    })
    .await?
}

fn owner(owner: Owner) -> &'static str {
    match owner {
        Owner::Shared => "shared",
        Owner::Harness(id) => id,
    }
}

fn scope(scope: Scope) -> &'static str {
    match scope {
        Scope::User => "user",
        Scope::Project => "project",
    }
}

fn roots(project: Option<PathBuf>) -> Roots {
    Roots {
        home: home(),
        project,
    }
}

#[tauri::command(async)]
pub fn harness_global(project: Option<PathBuf>) -> Global {
    let found = global::discover(&roots(project));

    Global {
        skills: found
            .skills
            .into_iter()
            .map(|s| GlobalSkill {
                name: s.name,
                dir: s.dir,
                owner: owner(s.origin.owner),
                scope: scope(s.origin.scope),
            })
            .collect(),
        tools: found
            .tools
            .into_iter()
            .map(|t| {
                let (kind, target) = match t.server.transport {
                    McpTransport::Stdio { command, .. } => ("stdio", command),
                    McpTransport::Http { url, .. } => ("http", url),
                    McpTransport::Sse { url, .. } => ("sse", url),
                };

                GlobalTool {
                    name: t.server.name,
                    kind,
                    target,
                    owner: owner(t.origin.owner),
                    scope: scope(t.origin.scope),
                    path: t.origin.path,
                }
            })
            .collect(),
    }
}

fn item(item: &Item) -> (&'static str, Option<String>) {
    match item {
        Item::Skill(name) => ("skill", Some(name.clone())),
        Item::Tool(name) => ("tool", Some(name.clone())),
        Item::Instructions => ("instructions", None),
        Item::AdditionalDirectories => ("additionalDirectories", None),
        Item::Model => ("model", None),
    }
}

fn reason(reason: Reason) -> &'static str {
    match reason {
        Reason::Unsupported => "unsupported",
        Reason::Unknown => "unknown",
        Reason::NoIsolatedHome => "noIsolatedHome",
        Reason::NeedsOsHomeIsolation => "needsOsHome",
        Reason::TransportFailsSession => "transportFailsSession",
        Reason::TransportUnsupported => "transportUnsupported",
        Reason::NotAdvertised => "notAdvertised",
        Reason::CommandNotFound => "commandNotFound",
    }
}

fn skip(skipped: &Skipped) -> Skip {
    let (item, name) = item(&skipped.item);

    Skip {
        item,
        name,
        reason: reason(skipped.reason),
    }
}

fn missing(item: &'static str, name: String) -> Skip {
    Skip {
        item,
        name: Some(name),
        reason: "missing",
    }
}

fn compose(spec: Spec, cwd: PathBuf) -> (Composition, Vec<Skip>) {
    let imports = spec
        .skills
        .iter()
        .any(|s| matches!(s, SkillSpec::Global { .. }))
        || spec
            .tools
            .iter()
            .any(|t| matches!(t, ToolSpec::Global { .. }));
    let found = if imports {
        global::discover(&roots(Some(cwd.clone())))
    } else {
        Default::default()
    };
    let mut gone = Vec::new();
    let mut composition = Composition::new(spec.harness, cwd);

    for skill in spec.skills {
        match skill {
            SkillSpec::Atrix { name, content } => {
                composition.skills.push(SkillSource::Owned(OwnedSkill {
                    name,
                    body: SkillBody::Markdown(content),
                }))
            }
            SkillSpec::Global { dir } => match found.skills.iter().find(|s| s.dir == dir) {
                Some(skill) => composition
                    .skills
                    .push(SkillSource::Imported(skill.clone())),
                None => gone.push(missing("skill", dir.to_string_lossy().into_owned())),
            },
        }
    }

    for tool in spec.tools {
        match tool {
            ToolSpec::Atrix { server } => composition.tools.push(ToolSource::Owned(server)),
            ToolSpec::Global { path, name } => {
                let known = found
                    .tools
                    .iter()
                    .find(|t| t.origin.path == path && t.server.name == name);

                match known {
                    Some(tool) => composition.tools.push(ToolSource::Imported(tool.clone())),
                    None => gone.push(missing("tool", name)),
                }
            }
        }
    }

    composition.provider = spec.provider;
    composition.model = spec.model;
    composition.instructions = spec.instructions.filter(|text| !text.trim().is_empty());
    composition.additional_dirs = spec.additional_dirs;

    (composition, gone)
}

fn prepare(spec: Spec, run: &Invocation) -> Result<(Prepared, Vec<Skip>)> {
    let base = atrix_dir().join(relative(&spec.home)?);
    let carry = spec.carry;
    let native = spec.native;
    let cwd = spec
        .cwd
        .clone()
        .filter(|dir| dir.is_dir())
        .unwrap_or_else(home);
    let (mut composition, mut skipped) = compose(spec, cwd);

    composition.carry = carry;

    if native {
        composition.isolation = Isolation::Native;
    }

    let prepared = materialize::materialize(&composition, run, &base)?;

    skipped.extend(prepared.skipped.iter().map(skip));

    Ok((prepared, skipped))
}

fn command(launch: &Launch) -> Command {
    let mut command = platform::hidden(&launch.command);

    command
        .args(&launch.args)
        .env("PATH", process::search_path())
        .envs(launch.envs())
        .current_dir(&launch.cwd);

    command
}

async fn resolve(state: &Harnesses, adapter: &'static Adapter) -> Result<Invocation> {
    let agent = match adapter.source {
        Origin::Registry => Some(agent_of(state, adapter.id).await?),
        _ => None,
    };
    let found = spawn_blocking(move || presence(adapter, agent.as_ref())).await?;
    let run = match found {
        Presence::Installed { run, .. } | Presence::Runner(run) => run,
        Presence::Download(download) => resolver::download(&client()?, &download).await?,
        Presence::Missing(_) => return Err(Error::code("harness_missing", adapter.id)),
    };

    state
        .runs
        .lock()?
        .insert(adapter.id.to_owned(), run.clone());

    Ok(run)
}

#[tauri::command]
pub async fn harness_spawn(
    state: State<'_, Harnesses>,
    agents: State<'_, Agents>,
    key: String,
    spec: Spec,
    channel: Channel<Frame>,
) -> Result<Vec<Skip>> {
    let adapter = adapters::find(&spec.harness)
        .filter(|a| launchable(a))
        .ok_or_else(|| Error::code("unknown_harness", &spec.harness))?;
    let started = Instant::now();
    let cached = state.runs.lock()?.get(adapter.id).cloned();
    let run = match cached {
        Some(run) => run,
        None => resolve(&state, adapter).await?,
    };

    info!("harness {key} resolve {}ms", started.elapsed().as_millis());

    let started = Instant::now();
    let (prepared, skipped) = spawn_blocking(move || prepare(spec, &run)).await??;

    info!(
        "harness {key} materialize {}ms",
        started.elapsed().as_millis()
    );

    let started = Instant::now();

    agents.spawn(
        key.clone(),
        command(&prepared.launch),
        prepared.session,
        channel,
    )?;
    info!("harness {key} spawn {}ms", started.elapsed().as_millis());

    Ok(skipped)
}

#[tauri::command]
pub fn harness_session(
    agents: State<'_, Agents>,
    key: String,
    capabilities: Value,
) -> Result<Session> {
    let plan = agents.plan(&key).ok_or("agent_closed")?;
    let caps: AgentCapabilities = serde_json::from_value(capabilities).unwrap_or_default();
    let params = plan.params(&caps);

    Ok(Session {
        new_session: params.new_session(Path::new("")),
        model: params.model.clone().map(|choice| Model {
            config_id: match choice.select {
                ModelSelect::ConfigOption(id) => Some(id),
                ModelSelect::ConfigCategory => None,
            },
            value: choice.value,
        }),
        skipped: params.skipped.iter().map(skip).collect(),
    })
}
