//! Windows implementations of the Stage backend and keep-awake lease.

use windows::core::{BOOL, PWSTR};
use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::System::Power::{
    PowerClearRequest, PowerCreateRequest, PowerRequestDisplayRequired,
    PowerRequestSystemRequired, PowerSetRequest,
};
use windows::Win32::System::Threading::{
    POWER_REQUEST_CONTEXT_SIMPLE_STRING, REASON_CONTEXT, REASON_CONTEXT_0,
};
use windows::Win32::UI::WindowsAndMessaging::{
    SystemParametersInfoW, SPIF_SENDCHANGE, SPIF_UPDATEINIFILE, SPI_GETMOUSESONAR,
    SPI_SETMOUSESONAR, SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS,
};

use super::engine::{PowerLease, SettingId, SettingValue, SettingsBackend};

pub struct WindowsSettings;

impl SettingsBackend for WindowsSettings {
    fn read(&mut self, id: SettingId) -> Result<SettingValue, String> {
        match id {
            SettingId::MouseSonar => {
                let mut value = BOOL(0);
                unsafe {
                    SystemParametersInfoW(
                        SPI_GETMOUSESONAR,
                        0,
                        Some(&mut value as *mut BOOL as *mut _),
                        SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
                    )
                }
                .map_err(|e| format!("couldn't read it: {e}"))?;
                Ok(SettingValue::Bool(value.as_bool()))
            }
        }
    }

    fn write(&mut self, id: SettingId, value: &SettingValue) -> Result<(), String> {
        match (id, value) {
            (SettingId::MouseSonar, SettingValue::Bool(on)) => unsafe {
                // SPI_SETMOUSESONAR takes the BOOL in pvParam, not a pointer to it.
                SystemParametersInfoW(
                    SPI_SETMOUSESONAR,
                    0,
                    Some(usize::from(*on) as *mut _),
                    SPIF_UPDATEINIFILE | SPIF_SENDCHANGE,
                )
            }
            .map_err(|e| format!("couldn't change it: {e}")),
            (id, value) => Err(format!("{} can't be set to {value:?}", id.label())),
        }
    }
}

/// A named power request, separate from Demo's thread execution state, so
/// leaving Demo never drops Stage's keep-awake.
pub struct WindowsLease {
    handle: Option<HANDLE>,
    reason: Vec<u16>,
}

// HANDLE is a raw pointer; the lease is only used behind the Stage mutex.
unsafe impl Send for WindowsLease {}

impl WindowsLease {
    pub fn new() -> Self {
        Self {
            handle: None,
            reason: "Snipsy Stage: keeping this PC awake while presenting"
                .encode_utf16()
                .chain(Some(0))
                .collect(),
        }
    }
}

impl PowerLease for WindowsLease {
    fn acquire(&mut self) -> Result<(), String> {
        if self.handle.is_some() {
            return Ok(());
        }
        let context = REASON_CONTEXT {
            Version: 0,
            Flags: POWER_REQUEST_CONTEXT_SIMPLE_STRING,
            Reason: REASON_CONTEXT_0 {
                SimpleReasonString: PWSTR(self.reason.as_mut_ptr()),
            },
        };
        let handle = unsafe { PowerCreateRequest(&context) }.map_err(|e| e.to_string())?;
        let result = unsafe {
            PowerSetRequest(handle, PowerRequestDisplayRequired)
                .and_then(|_| PowerSetRequest(handle, PowerRequestSystemRequired))
        };
        if let Err(error) = result {
            unsafe {
                let _ = PowerClearRequest(handle, PowerRequestDisplayRequired);
                let _ = CloseHandle(handle);
            }
            return Err(error.to_string());
        }
        self.handle = Some(handle);
        Ok(())
    }

    fn release(&mut self) {
        if let Some(handle) = self.handle.take() {
            unsafe {
                let _ = PowerClearRequest(handle, PowerRequestSystemRequired);
                let _ = PowerClearRequest(handle, PowerRequestDisplayRequired);
                let _ = CloseHandle(handle);
            }
        }
    }

    fn is_held(&self) -> bool {
        self.handle.is_some()
    }
}

impl Drop for WindowsLease {
    fn drop(&mut self) {
        self.release();
    }
}
