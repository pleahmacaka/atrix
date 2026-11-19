use serde::Serialize;
use tauri::AppHandle;

use crate::desktop::system::blocking;

#[derive(Clone, PartialEq, Serialize)]
pub struct BluetoothDevice {
    pub id: String,
    pub name: String,
    pub kind: &'static str,
    pub connected: bool,
    pub audio: bool,
    pub signal: Option<u8>,
}

#[derive(Clone, Serialize)]
pub struct PairingPrompt {
    pub id: String,
    pub kind: &'static str,
    pub pin: String,
}

#[tauri::command]
pub async fn bluetooth_devices() -> Result<Vec<BluetoothDevice>, String> {
    blocking(win::paired).await
}

#[tauri::command]
pub async fn bluetooth_scan(app: AppHandle, on: bool) -> Result<(), String> {
    blocking(move || {
        if on {
            win::start_scan(app)
        } else {
            win::stop_scan();

            Ok(())
        }
    })
    .await
}

#[tauri::command]
pub async fn bluetooth_pair(app: AppHandle, id: String) -> Result<(), String> {
    blocking(move || win::pair(app, &id)).await
}

#[tauri::command]
pub fn bluetooth_pair_reply(id: String, accept: bool, pin: Option<String>) {
    win::reply(&id, accept, pin);
}

#[tauri::command]
pub async fn bluetooth_unpair(id: String) -> Result<(), String> {
    blocking(move || win::unpair(&id)).await
}

#[tauri::command]
pub async fn bluetooth_connect(id: String, on: bool) -> Result<(), String> {
    blocking(move || win::connect(&id, on)).await
}

fn classic_kind(major: u32, minor: u32) -> Option<&'static str> {
    let kind = match major {
        1 => "computer",
        2 => "phone",
        4 => match minor {
            5 | 7 | 8 | 10 => "speaker",
            18 => "gamepad",
            _ => "headphones",
        },
        5 => match (minor >> 4, minor & 0x0f) {
            (_, 1 | 2) => "gamepad",
            (1 | 3, _) => "keyboard",
            (2, _) => "mouse",
            (_, 5) => "pen",
            _ => "input",
        },
        6 => "printer",
        7 => "watch",
        8 => "gamepad",
        _ => return None,
    };

    Some(kind)
}

fn le_kind(category: u32, subcategory: u32) -> Option<&'static str> {
    let kind = match category {
        0x01 => "phone",
        0x02 => "computer",
        0x03 => "watch",
        0x0a | 0x21 | 0x22 | 0x27 => "speaker",
        0x0f => match subcategory {
            1 => "keyboard",
            2 => "mouse",
            3 | 4 => "gamepad",
            5 | 7 => "pen",
            _ => "input",
        },
        0x25 | 0x29 => "headphones",
        0x2a => "gamepad",
        _ => return None,
    };

    Some(kind)
}

fn kind_of(
    major: Option<u32>,
    minor: Option<u32>,
    category: Option<u32>,
    subcategory: Option<u32>,
) -> &'static str {
    major
        .and_then(|major| classic_kind(major, minor.unwrap_or(0)))
        .or_else(|| category.and_then(|category| le_kind(category, subcategory.unwrap_or(0))))
        .unwrap_or("other")
}

fn bars(dbm: i64) -> u8 {
    match dbm {
        -55.. => 5,
        -65.. => 4,
        -75.. => 3,
        -85.. => 2,
        _ => 1,
    }
}

mod win {
    use std::collections::HashMap;
    use std::sync::Mutex;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::mpsc::{self, Receiver, Sender};
    use std::time::Duration;

    use tauri::{AppHandle, Emitter};
    use windows::Devices::Bluetooth::{BluetoothDevice as Classic, BluetoothLEDevice};
    use windows::Devices::Enumeration::{
        DeviceInformation, DeviceInformationCustomPairing, DeviceInformationKind,
        DeviceInformationUpdate, DevicePairingKinds, DevicePairingProtectionLevel,
        DevicePairingRequestedEventArgs, DevicePairingResultStatus, DeviceUnpairingResultStatus,
        DeviceWatcher,
    };
    use windows::Foundation::{IPropertyValue, PropertyType, TypedEventHandler};
    use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_ContainerId;
    use windows::Win32::Media::Audio::{
        DEVICE_STATE, DEVICE_STATEMASK_ALL, IDeviceTopology, IMMDevice, IMMDeviceEnumerator,
        MMDeviceEnumerator, eRender,
    };
    use windows::Win32::Media::KernelStreaming::{
        IKsControl, KSIDENTIFIER, KSIDENTIFIER_0, KSIDENTIFIER_0_0, KSPROPERTY_ONESHOT_DISCONNECT,
        KSPROPERTY_ONESHOT_RECONNECT, KSPROPERTY_TYPE_GET, KSPROPSETID_BtAudio,
    };
    use windows::Win32::System::Com::StructuredStorage::{PropVariantClear, PropVariantToGUID};
    use windows::Win32::System::Com::{CLSCTX_ALL, CoCreateInstance, CoTaskMemFree, STGM_READ};
    use windows::core::{GUID, HSTRING, Interface, PWSTR};
    use windows_collections::IIterable;

    use super::{BluetoothDevice, PairingPrompt};
    use crate::desktop::system::com::Apartment;

    const CONNECTED: &str = "System.Devices.Aep.IsConnected";
    const SIGNAL: &str = "System.Devices.Aep.SignalStrength";
    const CONTAINER: &str = "System.Devices.Aep.ContainerId";
    const MAJOR: &str = "System.Devices.Aep.Bluetooth.Cod.Major";
    const MINOR: &str = "System.Devices.Aep.Bluetooth.Cod.Minor";
    const CATEGORY: &str = "System.Devices.Aep.Bluetooth.Le.Appearance.Category";
    const SUBCATEGORY: &str = "System.Devices.Aep.Bluetooth.Le.Appearance.Subcategory";
    const CONNECTABLE: &str = "System.Devices.Aep.Bluetooth.Le.IsConnectable";

    const PROPERTIES: [&str; 8] = [
        CONNECTED,
        SIGNAL,
        CONTAINER,
        MAJOR,
        MINOR,
        CATEGORY,
        SUBCATEGORY,
        CONNECTABLE,
    ];

    const BLUETOOTH_FILTER: &str = r"{2}.\\?\bth";

    const REPLY_WAIT: Duration = Duration::from_secs(90);

    struct Scan {
        generation: u64,
        watcher: DeviceWatcher,
        found: HashMap<String, DeviceInformation>,
        sent: Vec<BluetoothDevice>,
    }

    #[derive(Default)]
    struct Reply {
        accept: bool,
        pin: Option<String>,
    }

    struct Pairing {
        device: String,
        reply: Option<Sender<Reply>>,
        canceled: bool,
    }

    static SCAN: Mutex<Option<Scan>> = Mutex::new(None);
    static SCANNING: Mutex<()> = Mutex::new(());
    static GENERATION: AtomicU64 = AtomicU64::new(0);
    static PAIRING: Mutex<Option<Pairing>> = Mutex::new(None);

    fn text<E: std::fmt::Display>(error: E) -> String {
        error.to_string()
    }

    fn properties() -> IIterable<HSTRING> {
        IIterable::from(PROPERTIES.map(HSTRING::from).to_vec())
    }

    fn selector(paired: bool) -> Result<HSTRING, String> {
        let classic = Classic::GetDeviceSelectorFromPairingState(paired).map_err(text)?;
        let le = BluetoothLEDevice::GetDeviceSelectorFromPairingState(paired).map_err(text)?;

        Ok(HSTRING::from(format!("({classic}) OR ({le})")))
    }

    fn value(info: &DeviceInformation, key: &str) -> Option<IPropertyValue> {
        info.Properties()
            .ok()?
            .Lookup(&HSTRING::from(key))
            .ok()?
            .cast()
            .ok()
    }

    fn number(info: &DeviceInformation, key: &str) -> Option<i64> {
        let value = value(info, key)?;

        match value.Type().ok()? {
            PropertyType::UInt8 => value.GetUInt8().ok().map(i64::from),
            PropertyType::Int16 => value.GetInt16().ok().map(i64::from),
            PropertyType::UInt16 => value.GetUInt16().ok().map(i64::from),
            PropertyType::Int32 => value.GetInt32().ok().map(i64::from),
            PropertyType::UInt32 => value.GetUInt32().ok().map(i64::from),
            _ => None,
        }
    }

    fn flag(info: &DeviceInformation, key: &str) -> bool {
        value(info, key).is_some_and(|value| value.GetBoolean().unwrap_or(false))
    }

    fn container(info: &DeviceInformation) -> Option<GUID> {
        value(info, CONTAINER)?.GetGuid().ok()
    }

    fn device(info: &DeviceInformation, audio: &[GUID]) -> Option<BluetoothDevice> {
        let name = info.Name().ok()?.to_string();

        if name.trim().is_empty() {
            return None;
        }

        let code = |key| number(info, key).and_then(|value| u32::try_from(value).ok());

        Some(BluetoothDevice {
            id: info.Id().ok()?.to_string(),
            kind: super::kind_of(code(MAJOR), code(MINOR), code(CATEGORY), code(SUBCATEGORY)),
            connected: flag(info, CONNECTED),
            audio: container(info).is_some_and(|container| audio.contains(&container)),
            signal: number(info, SIGNAL).map(super::bars),
            name,
        })
    }

    fn lookup(id: &str) -> Result<DeviceInformation, String> {
        DeviceInformation::CreateFromIdAsyncWithKindAndAdditionalProperties(
            &HSTRING::from(id),
            &properties(),
            DeviceInformationKind::AssociationEndpoint,
        )
        .and_then(|operation| operation.join())
        .map_err(text)
    }

    fn take(raw: PWSTR) -> Option<String> {
        unsafe {
            let text = raw.to_string().ok();

            CoTaskMemFree(Some(raw.0 as *const _));

            text
        }
    }

    fn endpoint_container(endpoint: &IMMDevice) -> Option<GUID> {
        unsafe {
            let store = endpoint.OpenPropertyStore(STGM_READ).ok()?;
            let mut value = store.GetValue(&PKEY_Device_ContainerId).ok()?;
            let container = PropVariantToGUID(&value).ok();
            let _ = PropVariantClear(&mut value);

            container
        }
    }

    fn with_endpoints<T>(run: impl FnOnce(&IMMDeviceEnumerator) -> T) -> Result<T, String> {
        let _apartment = Apartment::enter().map_err(text)?;
        let enumerator: IMMDeviceEnumerator =
            unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) }.map_err(text)?;

        Ok(run(&enumerator))
    }

    fn audio_filters(enumerator: &IMMDeviceEnumerator) -> Vec<(GUID, String)> {
        unsafe {
            let Ok(endpoints) =
                enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE(DEVICE_STATEMASK_ALL))
            else {
                return Vec::new();
            };

            let mut filters = Vec::new();

            for index in 0..endpoints.GetCount().unwrap_or(0) {
                let Ok(endpoint) = endpoints.Item(index) else {
                    continue;
                };

                let Some(container) = endpoint_container(&endpoint) else {
                    continue;
                };

                let Ok(topology) = endpoint.Activate::<IDeviceTopology>(CLSCTX_ALL, None) else {
                    continue;
                };

                for connector in 0..topology.GetConnectorCount().unwrap_or(0) {
                    let filter = topology
                        .GetConnector(connector)
                        .and_then(|connector| connector.GetDeviceIdConnectedTo())
                        .ok()
                        .and_then(take);

                    if let Some(filter) = filter
                        && filter.to_lowercase().starts_with(BLUETOOTH_FILTER)
                    {
                        filters.push((container, filter));
                    }
                }
            }

            filters
        }
    }

    pub fn paired() -> Result<Vec<BluetoothDevice>, String> {
        let found = DeviceInformation::FindAllAsyncWithKindAqsFilterAndAdditionalProperties(
            &selector(true)?,
            &properties(),
            DeviceInformationKind::AssociationEndpoint,
        )
        .and_then(|operation| operation.join())
        .map_err(text)?;

        let audio: Vec<GUID> = with_endpoints(audio_filters)
            .unwrap_or_default()
            .into_iter()
            .map(|(container, _)| container)
            .collect();

        let mut devices: Vec<(Option<GUID>, BluetoothDevice)> = found
            .into_iter()
            .filter_map(|info| Some((container(&info), device(&info, &audio)?)))
            .collect();

        devices.sort_by_key(|(_, device)| !device.connected);

        let mut seen = Vec::new();

        devices.retain(|(container, _)| {
            container.is_none_or(|container| {
                let fresh = !seen.contains(&container);

                seen.push(container);

                fresh
            })
        });

        let mut devices: Vec<BluetoothDevice> =
            devices.into_iter().map(|(_, device)| device).collect();

        devices.sort_by_cached_key(|device| (!device.connected, device.name.to_lowercase()));

        Ok(devices)
    }

    fn discovered(found: &HashMap<String, DeviceInformation>) -> Vec<BluetoothDevice> {
        let mut devices: Vec<BluetoothDevice> = found
            .values()
            .filter(|info| {
                let le = info
                    .Id()
                    .is_ok_and(|id| id.to_string().starts_with("BluetoothLE#"));

                !le || flag(info, CONNECTABLE)
            })
            .filter_map(|info| device(info, &[]))
            .collect();

        devices.sort_by_cached_key(|device| (device.name.to_lowercase(), device.id.clone()));

        devices
    }

    fn change(
        app: &AppHandle,
        generation: u64,
        edit: impl FnOnce(&mut HashMap<String, DeviceInformation>),
    ) {
        let devices = {
            let mut guard = SCAN.lock().unwrap();

            let Some(scan) = guard.as_mut().filter(|scan| scan.generation == generation) else {
                return;
            };

            edit(&mut scan.found);

            let devices = discovered(&scan.found);

            if devices == scan.sent {
                return;
            }

            scan.sent = devices.clone();

            devices
        };

        let _ = app.emit("bluetooth-scan", devices);
    }

    pub fn start_scan(app: AppHandle) -> Result<(), String> {
        let _scanning = SCANNING.lock().unwrap();

        halt();

        let watcher = DeviceInformation::CreateWatcherWithKindAqsFilterAndAdditionalProperties(
            &selector(false)?,
            &properties(),
            DeviceInformationKind::AssociationEndpoint,
        )
        .map_err(text)?;

        let generation = GENERATION.fetch_add(1, Ordering::Relaxed) + 1;

        let sink = app.clone();

        watcher
            .Added(&TypedEventHandler::<DeviceWatcher, DeviceInformation>::new(
                move |_, info| {
                    if let Some(info) = info.as_ref()
                        && let Ok(id) = info.Id()
                    {
                        change(&sink, generation, |found| {
                            found.insert(id.to_string(), info.clone());
                        });
                    }

                    Ok(())
                },
            ))
            .map_err(text)?;

        let sink = app.clone();

        watcher
            .Updated(
                &TypedEventHandler::<DeviceWatcher, DeviceInformationUpdate>::new(
                    move |_, update| {
                        if let Some(update) = update.as_ref()
                            && let Ok(id) = update.Id()
                        {
                            change(&sink, generation, |found| {
                                if let Some(info) = found.get(&id.to_string()) {
                                    let _ = info.Update(update);
                                }
                            });
                        }

                        Ok(())
                    },
                ),
            )
            .map_err(text)?;

        watcher
            .Removed(
                &TypedEventHandler::<DeviceWatcher, DeviceInformationUpdate>::new(
                    move |_, update| {
                        if let Some(update) = update.as_ref()
                            && let Ok(id) = update.Id()
                        {
                            change(&app, generation, |found| {
                                found.remove(&id.to_string());
                            });
                        }

                        Ok(())
                    },
                ),
            )
            .map_err(text)?;

        *SCAN.lock().unwrap() = Some(Scan {
            generation,
            watcher: watcher.clone(),
            found: HashMap::new(),
            sent: Vec::new(),
        });

        watcher.Start().map_err(text)
    }

    pub fn stop_scan() {
        let _scanning = SCANNING.lock().unwrap();

        halt();
    }

    fn halt() {
        let scan = SCAN.lock().unwrap().take();

        if let Some(scan) = scan {
            let _ = scan.watcher.Stop();
        }
    }

    fn listen(id: &str) -> Option<Receiver<Reply>> {
        let mut slot = PAIRING.lock().unwrap();
        let pairing = slot
            .as_mut()
            .filter(|pairing| pairing.device == id && !pairing.canceled)?;
        let (sender, receiver) = mpsc::channel();

        pairing.reply = Some(sender);

        Some(receiver)
    }

    fn requested(
        app: &AppHandle,
        id: &str,
        args: &DevicePairingRequestedEventArgs,
    ) -> windows::core::Result<()> {
        let Some(receiver) = listen(id) else {
            return Ok(());
        };

        let kind = args.PairingKind()?;

        if kind == DevicePairingKinds::ConfirmOnly {
            return args.Accept();
        }

        let prompt = |name: &'static str| {
            let pin = args.Pin().map(|pin| pin.to_string()).unwrap_or_default();

            let _ = app.emit(
                "bluetooth-pairing",
                PairingPrompt {
                    id: id.into(),
                    kind: name,
                    pin,
                },
            );
        };

        if kind == DevicePairingKinds::DisplayPin {
            args.Accept()?;
            prompt("display");

            return Ok(());
        }

        let name = if kind == DevicePairingKinds::ConfirmPinMatch {
            "confirm"
        } else if kind == DevicePairingKinds::ProvidePin {
            "provide"
        } else {
            return Ok(());
        };

        let deferral = args.GetDeferral()?;

        prompt(name);

        let reply = receiver.recv_timeout(REPLY_WAIT).unwrap_or_default();

        let accepted = if !reply.accept {
            Ok(())
        } else if let Some(pin) = reply.pin.filter(|_| kind == DevicePairingKinds::ProvidePin) {
            args.AcceptWithPin(&HSTRING::from(pin))
        } else {
            args.Accept()
        };

        deferral.Complete()?;

        accepted
    }

    fn pairing_error(status: DevicePairingResultStatus) -> &'static str {
        match status {
            DevicePairingResultStatus::RejectedByHandler
            | DevicePairingResultStatus::PairingCanceled => "canceled",
            DevicePairingResultStatus::AuthenticationTimeout => "timeout",
            DevicePairingResultStatus::AuthenticationFailure
            | DevicePairingResultStatus::AuthenticationNotAllowed
            | DevicePairingResultStatus::ProtectionLevelCouldNotBeMet => "auth",
            DevicePairingResultStatus::NotReadyToPair => "not-ready",
            _ => "failed",
        }
    }

    pub fn pair(app: AppHandle, id: &str) -> Result<(), String> {
        {
            let mut slot = PAIRING.lock().unwrap();

            if slot.is_some() {
                return Err("busy".into());
            }

            *slot = Some(Pairing {
                device: id.into(),
                reply: None,
                canceled: false,
            });
        }

        let paired = attempt(app, id);

        PAIRING.lock().unwrap().take();

        paired
    }

    fn attempt(app: AppHandle, id: &str) -> Result<(), String> {
        let scanned = SCAN
            .lock()
            .unwrap()
            .as_ref()
            .and_then(|scan| scan.found.get(id).cloned());
        let info = scanned.map_or_else(|| lookup(id), Ok)?;
        let custom = info
            .Pairing()
            .and_then(|pairing| pairing.Custom())
            .map_err(text)?;
        let device = id.to_string();

        let token = custom
            .PairingRequested(&TypedEventHandler::<
                DeviceInformationCustomPairing,
                DevicePairingRequestedEventArgs,
            >::new(move |_, args| {
                if let Some(args) = args.as_ref() {
                    requested(&app, &device, args)?;
                }

                Ok(())
            }))
            .map_err(text)?;

        let kinds = DevicePairingKinds::ConfirmOnly
            | DevicePairingKinds::DisplayPin
            | DevicePairingKinds::ProvidePin
            | DevicePairingKinds::ConfirmPinMatch;

        let status = custom
            .PairWithProtectionLevelAsync(kinds, DevicePairingProtectionLevel::Default)
            .and_then(|operation| operation.join())
            .and_then(|result| result.Status());

        let _ = custom.RemovePairingRequested(token);

        match status.map_err(text)? {
            DevicePairingResultStatus::Paired | DevicePairingResultStatus::AlreadyPaired => Ok(()),
            status => Err(pairing_error(status).into()),
        }
    }

    pub fn reply(id: &str, accept: bool, pin: Option<String>) {
        let mut slot = PAIRING.lock().unwrap();

        let Some(pairing) = slot.as_mut().filter(|pairing| pairing.device == id) else {
            return;
        };

        let delivered = pairing
            .reply
            .take()
            .is_some_and(|sender| sender.send(Reply { accept, pin }).is_ok());

        if !delivered && !accept {
            pairing.canceled = true;
        }
    }

    pub fn unpair(id: &str) -> Result<(), String> {
        let status = lookup(id)?
            .Pairing()
            .and_then(|pairing| pairing.UnpairAsync())
            .and_then(|operation| operation.join())
            .and_then(|result| result.Status())
            .map_err(text)?;

        match status {
            DeviceUnpairingResultStatus::Unpaired
            | DeviceUnpairingResultStatus::AlreadyUnpaired => Ok(()),
            DeviceUnpairingResultStatus::AccessDenied => Err("denied".into()),
            _ => Err("failed".into()),
        }
    }

    fn request(enumerator: &IMMDeviceEnumerator, container: GUID, on: bool) -> bool {
        let request = if on {
            KSPROPERTY_ONESHOT_RECONNECT
        } else {
            KSPROPERTY_ONESHOT_DISCONNECT
        };
        let property = KSIDENTIFIER {
            Anonymous: KSIDENTIFIER_0 {
                Anonymous: KSIDENTIFIER_0_0 {
                    Set: KSPROPSETID_BtAudio,
                    Id: request.0 as u32,
                    Flags: KSPROPERTY_TYPE_GET,
                },
            },
        };
        let mut sent = false;

        let filters = audio_filters(enumerator);

        for (_, filter) in filters.iter().filter(|(owner, _)| *owner == container) {
            let control = unsafe {
                enumerator
                    .GetDevice(&HSTRING::from(filter.as_str()))
                    .and_then(|device| device.Activate::<IKsControl>(CLSCTX_ALL, None))
            };

            let Ok(control) = control else {
                continue;
            };

            let mut returned = 0u32;

            let result = unsafe {
                control.KsProperty(
                    &property,
                    std::mem::size_of::<KSIDENTIFIER>() as u32,
                    std::ptr::null_mut(),
                    0,
                    &mut returned,
                )
            };

            sent |= result.is_ok();
        }

        sent
    }

    pub fn connect(id: &str, on: bool) -> Result<(), String> {
        let container = container(&lookup(id)?).ok_or("unsupported")?;

        if with_endpoints(|enumerator| request(enumerator, container, on))? {
            Ok(())
        } else {
            Err("unsupported".into())
        }
    }
}
