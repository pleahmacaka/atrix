use std::collections::BTreeMap;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::Command;

use serde_json::{Map, Value, json};

use crate::adapters::{self, Adapter, Home, Mcp, Prompt, Skills, Source, Stdio, Transport};
use crate::compose::{Composition, Isolation, McpServer, McpTransport, SkillBody, SkillSource};
use crate::files::Desired;
use crate::install::Invocation;
use crate::provider::{FileKind, ProviderSupport, Secret};
use crate::session::{Gate, Item, ModelChoice, Reason, SessionPlan, Skipped};
use crate::{Error, Result};

#[derive(Clone, Debug, PartialEq)]
pub struct Launch {
    pub command: PathBuf,

    pub args: Vec<String>,

    pub env: BTreeMap<String, String>,

    pub secret_env: BTreeMap<String, Secret>,

    pub cwd: PathBuf,
}

impl Launch {
    pub fn envs(&self) -> impl Iterator<Item = (&str, &str)> {
        let plain = self.env.iter().map(|(k, v)| (k.as_str(), v.as_str()));
        let secret = self
            .secret_env
            .iter()
            .map(|(k, v)| (k.as_str(), v.expose()));

        plain.chain(secret)
    }

    pub fn to_command(&self) -> Command {
        let mut command = Command::new(&self.command);

        command
            .args(&self.args)
            .envs(self.envs())
            .current_dir(&self.cwd);

        command
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Prepared {
    pub launch: Launch,

    pub session: SessionPlan,

    pub skipped: Vec<Skipped>,
}

struct Build<'a> {
    composition: &'a Composition,

    adapter: &'static Adapter,

    config: Option<PathBuf>,

    launch: Launch,

    files: Desired,

    session: SessionPlan,

    skipped: Vec<Skipped>,
}

pub fn materialize(composition: &Composition, run: &Invocation, base: &Path) -> Result<Prepared> {
    let adapter = adapters::find(&composition.harness)
        .ok_or_else(|| Error::UnknownHarness(composition.harness.clone()))?;

    if adapter.source == Source::NoAcp {
        return Err(Error::NoAcp(adapter.id));
    }

    let base = std::path::absolute(base)?;

    fs::create_dir_all(&base)?;

    let mut build = Build {
        composition,
        adapter,
        config: match adapter.home {
            Home::Redirect { config, .. } => Some(PathBuf::from(config)),
            Home::Unavailable | Home::Unknown => None,
        },
        launch: Launch {
            command: run.command.clone(),
            args: run.args.clone(),
            env: run.env.clone(),
            secret_env: BTreeMap::new(),
            cwd: composition.cwd.clone(),
        },
        files: Desired::default(),
        session: SessionPlan::default(),
        skipped: Vec::new(),
    };

    build.home(&base)?;
    build.provider()?;
    build.skills()?;
    build.tools()?;
    build.instructions();
    build.session.additional_directories = composition.additional_dirs.clone();
    build.files.sync(&base)?;

    Ok(Prepared {
        launch: build.launch,
        session: build.session,
        skipped: build.skipped,
    })
}

fn path_env(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn valid_name(name: &str) -> bool {
    let mut parts = Path::new(name).components();

    !name.starts_with('.')
        && matches!(parts.next(), Some(Component::Normal(_)))
        && parts.next().is_none()
}

impl Build<'_> {
    fn skip(&mut self, item: Item, reason: Reason) {
        self.skipped.push(Skipped { item, reason });
    }

    fn os_home(&self) -> bool {
        self.composition.isolation == Isolation::ConfigAndOsHome
    }

    fn home(&mut self, base: &Path) -> Result<()> {
        let adapter = self.adapter;
        let os_home = self.os_home();
        let launch = &mut self.launch;

        launch
            .args
            .extend(adapter.args.iter().map(|a| a.to_string()));
        launch.env.extend(
            adapter
                .env
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_string())),
        );

        if let Home::Redirect { vars, .. } = adapter.home {
            for (var, sub) in vars {
                let dir = if sub.is_empty() {
                    base.to_path_buf()
                } else {
                    base.join(sub)
                };

                fs::create_dir_all(&dir)?;
                launch.env.insert(var.to_string(), path_env(&dir));
            }
        }

        if os_home {
            for var in ["HOME", "USERPROFILE"] {
                launch.env.insert(var.to_owned(), path_env(base));
            }
        }

        Ok(())
    }

    fn provider(&mut self) -> Result<()> {
        let composition = self.composition;
        let adapter = self.adapter;

        let Some(provider) = &composition.provider else {
            if let Some(model) = &composition.model {
                self.session.model = Some(ModelChoice {
                    select: adapter.model,
                    value: model.clone(),
                });
            }

            return Ok(());
        };

        let ProviderSupport::Mapped(mapping) = adapter.provider else {
            return Err(Error::ProviderUnsupported {
                harness: adapter.id,
                support: adapter.provider,
            });
        };

        let model = composition.model.as_deref().ok_or(Error::MissingModel)?;
        let plan = mapping.plan(provider, model)?;

        if !plan.files.is_empty() && self.config.is_none() {
            return Err(Error::NoHome(adapter.id));
        }

        self.launch.args.extend(plan.args);
        self.launch.env.extend(plan.env);
        self.launch.secret_env.extend(plan.secret_env);

        if let Some(config) = &self.config {
            for file in plan.files {
                self.files
                    .put(config.join(file.path), file.contents, file.kind);
            }
        }

        Ok(())
    }

    fn skill_root(&self) -> std::result::Result<PathBuf, Reason> {
        match self.adapter.skills {
            Skills::Config(rel) => self
                .config
                .as_ref()
                .map(|c| c.join(rel))
                .ok_or(Reason::NoIsolatedHome),
            Skills::OsHome(rel) if self.os_home() => Ok(PathBuf::from(rel)),
            Skills::OsHome(_) => Err(Reason::NeedsOsHomeIsolation),
            Skills::Unsupported => Err(Reason::Unsupported),
            Skills::Unknown => Err(Reason::Unknown),
        }
    }

    fn skills(&mut self) -> Result<()> {
        for skill in &self.composition.skills {
            let name = skill.name();

            if !valid_name(name) {
                return Err(Error::InvalidName(name.to_owned()));
            }

            let dir = match self.skill_root() {
                Ok(root) => root.join(name),
                Err(reason) => {
                    self.skip(Item::Skill(name.to_owned()), reason);
                    continue;
                }
            };

            match skill {
                SkillSource::Owned(owned) => match &owned.body {
                    SkillBody::Markdown(text) => {
                        self.files
                            .put(dir.join("SKILL.md"), text.as_str(), FileKind::Plain)
                    }
                    SkillBody::Dir(source) => self.files.copy_dir(source, &dir)?,
                },
                SkillSource::Imported(global) => self.files.copy_dir(&global.dir, &dir)?,
            }
        }

        Ok(())
    }

    fn tools(&mut self) -> Result<()> {
        let servers: Vec<McpServer> = self
            .composition
            .tools
            .iter()
            .map(|t| t.server().clone())
            .collect();

        match self.adapter.mcp {
            Mcp::Session { http, sse, stdio } => {
                for server in servers {
                    self.session_tool(server, http, sse, stdio);
                }
            }
            Mcp::ServersJson(rel) => self.servers_json(servers, rel)?,
            Mcp::Ignored => {
                for server in servers {
                    self.skip(Item::Tool(server.name), Reason::Unsupported);
                }
            }
        }

        Ok(())
    }

    fn session_tool(&mut self, server: McpServer, http: Transport, sse: Transport, stdio: Stdio) {
        let transport = match &server.transport {
            McpTransport::Stdio { command, .. } => {
                if stdio == Stdio::AbsoluteCommand && !Path::new(command).is_absolute() {
                    return self.absolute_tool(server);
                }

                Transport::Works
            }
            McpTransport::Http { .. } => http,
            McpTransport::Sse { .. } => sse,
        };

        let gate = match transport {
            Transport::Works => Gate::Always,
            Transport::Advertised => Gate::Advertised,
            Transport::Unsupported => {
                return self.skip(Item::Tool(server.name), Reason::TransportUnsupported);
            }
            Transport::FailsSession => {
                return self.skip(Item::Tool(server.name), Reason::TransportFailsSession);
            }
        };

        self.session.servers.push((server, gate));
    }

    fn absolute_tool(&mut self, mut server: McpServer) {
        let McpTransport::Stdio { command, .. } = &mut server.transport else {
            return;
        };

        match which::which(&*command) {
            Ok(path) => {
                *command = path_env(&path);
                self.session.servers.push((server, Gate::Always));
            }
            Err(_) => self.skip(Item::Tool(server.name), Reason::CommandNotFound),
        }
    }

    fn servers_json(&mut self, servers: Vec<McpServer>, rel: &str) -> Result<()> {
        let Some(config) = self.config.clone() else {
            for server in servers {
                self.skip(Item::Tool(server.name), Reason::NoIsolatedHome);
            }

            return Ok(());
        };

        let mut entries = Map::new();

        for server in servers {
            let entry = match &server.transport {
                McpTransport::Stdio { command, args, env } => {
                    json!({ "command": command, "args": args, "env": env })
                }
                McpTransport::Http { url, headers } => {
                    json!({ "type": "http", "url": url, "headers": headers })
                }
                McpTransport::Sse { .. } => {
                    self.skip(Item::Tool(server.name), Reason::TransportUnsupported);
                    continue;
                }
            };

            entries.insert(server.name, entry);
        }

        if entries.is_empty() {
            return Ok(());
        }

        let doc = json!({ "mcpServers": Value::Object(entries) });

        self.files.put(
            config.join(rel),
            serde_json::to_string_pretty(&doc)?,
            FileKind::OwnerOnlySecret,
        );

        Ok(())
    }

    fn instructions(&mut self) {
        let Some(text) = self.composition.instructions.clone() else {
            return;
        };

        match self.adapter.prompt {
            Prompt::Session { .. } => self.session.system_prompt = Some(text),
            Prompt::Meta { append } => {
                self.session
                    .meta
                    .insert(append.to_owned(), Value::String(text));
            }
            Prompt::File(rel) => match &self.config {
                Some(config) => self.files.put(config.join(rel), text, FileKind::Plain),
                None => self.skip(Item::Instructions, Reason::NoIsolatedHome),
            },
            Prompt::Flag(flag) => self.launch.args.extend([flag.to_owned(), text]),
            Prompt::Unknown => self.skip(Item::Instructions, Reason::Unknown),
        }
    }
}
