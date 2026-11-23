//! Saves the clipboard before Snipsy pastes through it and puts it back
//! afterwards, unless something else changed the clipboard in the meantime.

use std::thread;
use std::time::{Duration, Instant};

use crate::app_settings::AppSettings;
use crate::images::DecodedImage;

/// Snapshots larger than this are not kept; the clipboard is left as pasted.
const MAX_SNAPSHOT_BYTES: usize = 256 * 1024 * 1024;

/// One clipboard format's data, as raw bytes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SavedFormat {
    pub id: u32,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Snapshot {
    pub formats: Vec<SavedFormat>,
    /// Plain text on the clipboard, if any.
    pub text: Option<String>,
    /// False when some format could not be captured (for example a GDI handle).
    pub complete: bool,
}

/// The system clipboard, behind a trait so the guard's rules can be tested.
pub trait Clipboard: Send {
    fn snapshot(&mut self) -> Result<Snapshot, String>;
    fn read_text(&mut self) -> Result<Option<String>, String>;
    /// Changes whenever the clipboard does; `None` when that can't be known.
    fn sequence(&mut self) -> Option<u64>;
    /// Writes text and returns the sequence that identifies Snipsy's write.
    fn write_text(&mut self, text: &str) -> Result<Option<u64>, String>;
    fn write_image(&mut self, image: &DecodedImage) -> Result<Option<u64>, String>;
    /// Restores `snapshot` only if the clipboard still holds the write that
    /// produced `expected`. Returns whether it restored.
    fn restore_if_unchanged(&mut self, snapshot: &Snapshot, expected: u64) -> Result<bool, String>;
}

pub fn system() -> Box<dyn Clipboard> {
    Box::new(platform::SystemClipboard)
}

pub const NO_CLIPBOARD_TEXT: &str =
    "{{clipboard}} needs text on the clipboard, but the clipboard has no text.";

/// One per delivery: snapshots once before Snipsy's first write, tracks the
/// writes, and restores in [`ClipboardGuard::finish`].
pub struct ClipboardGuard {
    backend: Box<dyn Clipboard>,
    settings: AppSettings,
    snapshot: Option<Snapshot>,
    text: Option<String>,
    written: Option<u64>,
    wrote: bool,
    external_change: bool,
    last_paste: Option<Instant>,
}

impl ClipboardGuard {
    /// `will_write`: the delivery pastes through the clipboard.
    /// `needs_text`: the snippet uses `{{clipboard}}`, which must succeed
    /// here, before anything is typed.
    pub fn begin(
        mut backend: Box<dyn Clipboard>,
        settings: AppSettings,
        will_write: bool,
        needs_text: bool,
    ) -> Result<Self, String> {
        let mut snapshot = None;
        if will_write && settings.restore_clipboard {
            match backend.snapshot() {
                Ok(saved) => snapshot = Some(saved),
                Err(error) => {
                    tracing::warn!(%error, "Couldn't save the clipboard; it won't be restored")
                }
            }
        }
        let mut text = None;
        if needs_text {
            text = match &snapshot {
                Some(saved) => saved.text.clone(),
                None => backend.read_text().map_err(|e| {
                    format!("Couldn't read the clipboard for {{{{clipboard}}}}: {e}")
                })?,
            };
            if text.is_none() {
                return Err(NO_CLIPBOARD_TEXT.into());
            }
        }
        Ok(Self {
            backend,
            settings,
            snapshot,
            text,
            written: None,
            wrote: false,
            external_change: false,
            last_paste: None,
        })
    }

    /// The clipboard text from before the delivery, for `{{clipboard}}`.
    pub fn text(&self) -> Option<&str> {
        self.text.as_deref()
    }

    fn note_external_change(&mut self) {
        if self.wrote && !self.external_change && self.backend.sequence() != self.written {
            tracing::info!("Clipboard changed during delivery; it won't be restored");
            self.external_change = true;
        }
    }

    pub fn write_text(&mut self, text: &str) -> Result<(), String> {
        self.note_external_change();
        self.wrote = true;
        self.written = self.backend.write_text(text)?;
        Ok(())
    }

    pub fn write_image(&mut self, image: &DecodedImage) -> Result<(), String> {
        self.note_external_change();
        self.wrote = true;
        self.written = self.backend.write_image(image)?;
        Ok(())
    }

    /// Call right before pressing paste.
    pub fn pasting(&mut self) {
        self.last_paste = Some(Instant::now());
    }

    /// Waits for the target to read the last paste, then restores. Not
    /// cancellable, and safe to call whether or not delivery succeeded.
    pub fn finish(&mut self) {
        if !self.wrote {
            return;
        }
        self.wrote = false;
        let Some(snapshot) = self.snapshot.take() else {
            return;
        };
        if self.external_change {
            return;
        }
        if let Some(pasted) = self.last_paste {
            let wait = Duration::from_millis(self.settings.clipboard_restore_delay_ms.into());
            if let Some(remaining) = wait.checked_sub(pasted.elapsed()) {
                thread::sleep(remaining);
            }
        }
        let Some(expected) = self.written else {
            tracing::warn!("Can't tell whether the clipboard changed; not restoring it");
            return;
        };
        match self.backend.restore_if_unchanged(&snapshot, expected) {
            Ok(true) => tracing::info!(
                formats = snapshot.formats.len(),
                complete = snapshot.complete,
                "Clipboard restored"
            ),
            Ok(false) => tracing::info!("Clipboard changed after paste; leaving it alone"),
            Err(error) => tracing::warn!(%error, "Couldn't restore the clipboard"),
        }
    }
}

impl Drop for ClipboardGuard {
    fn drop(&mut self) {
        self.finish();
    }
}

fn utf16_text(bytes: &[u8]) -> String {
    let units: Vec<u16> = bytes
        .as_chunks::<2>()
        .0
        .iter()
        .map(|pair| u16::from_le_bytes(*pair))
        .take_while(|unit| *unit != 0)
        .collect();
    String::from_utf16_lossy(&units)
}

#[cfg(target_os = "windows")]
mod platform {
    use super::*;
    use windows::core::w;
    use windows::Win32::Foundation::{GlobalFree, HANDLE, HGLOBAL, HWND};
    use windows::Win32::Graphics::Gdi::{
        DeleteEnhMetaFile, GetEnhMetaFileBits, SetEnhMetaFileBits, HENHMETAFILE,
    };
    use windows::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, EnumClipboardFormats, GetClipboardData,
        GetClipboardSequenceNumber, IsClipboardFormatAvailable, OpenClipboard,
        RegisterClipboardFormatW, SetClipboardData,
    };
    use windows::Win32::System::Memory::{
        GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DestroyWindow, HWND_MESSAGE, WINDOW_EX_STYLE, WINDOW_STYLE,
    };

    const CF_TEXT: u32 = 1;
    const CF_BITMAP: u32 = 2;
    const CF_METAFILEPICT: u32 = 3;
    const CF_OEMTEXT: u32 = 7;
    const CF_DIB: u32 = 8;
    const CF_PALETTE: u32 = 9;
    const CF_UNICODETEXT: u32 = 13;
    const CF_ENHMETAFILE: u32 = 14;
    const CF_DIBV5: u32 = 17;

    /// GDI or owner-drawn formats whose data is a handle, not bytes.
    fn is_handle_format(id: u32) -> bool {
        matches!(
            id,
            CF_BITMAP | CF_METAFILEPICT | CF_PALETTE | 0x80 | 0x82 | 0x83 | 0x8E
        ) || (0x200..=0x3FF).contains(&id)
    }

    /// Formats Windows synthesizes from another one that we do keep.
    fn is_synthesized(id: u32, has_unicode: bool, has_dib: bool) -> bool {
        match id {
            CF_TEXT | CF_OEMTEXT => has_unicode,
            CF_BITMAP | CF_PALETTE => has_dib,
            _ => false,
        }
    }

    /// The clipboard, opened. Closes (and destroys its owner window) on drop.
    struct Open {
        owner: Option<HWND>,
    }

    impl Open {
        /// Writers need an owner window: with a NULL owner, `EmptyClipboard`
        /// leaves no owner and `SetClipboardData` may fail. A message-only
        /// window never pumps messages, so it is destroyed right after closing.
        fn new(owned: bool) -> Result<Self, String> {
            let owner = if owned {
                unsafe {
                    CreateWindowExW(
                        WINDOW_EX_STYLE(0),
                        w!("STATIC"),
                        w!("Snipsy clipboard"),
                        WINDOW_STYLE(0),
                        0,
                        0,
                        0,
                        0,
                        Some(HWND_MESSAGE),
                        None,
                        None,
                        None,
                    )
                }
                .ok()
            } else {
                None
            };
            for attempt in 0..10 {
                if unsafe { OpenClipboard(owner) }.is_ok() {
                    return Ok(Self { owner });
                }
                if attempt < 9 {
                    thread::sleep(Duration::from_millis(20));
                }
            }
            if let Some(owner) = owner {
                let _ = unsafe { DestroyWindow(owner) };
            }
            Err("The clipboard is in use by another app.".into())
        }
    }

    impl Drop for Open {
        fn drop(&mut self) {
            unsafe {
                let _ = CloseClipboard();
                if let Some(owner) = self.owner {
                    let _ = DestroyWindow(owner);
                }
            }
        }
    }

    fn sequence() -> Option<u64> {
        match unsafe { GetClipboardSequenceNumber() } {
            0 => None,
            number => Some(number.into()),
        }
    }

    fn global_bytes(handle: HANDLE) -> Option<Vec<u8>> {
        let global = HGLOBAL(handle.0);
        unsafe {
            let size = GlobalSize(global);
            if size == 0 {
                return None;
            }
            let data = GlobalLock(global) as *const u8;
            if data.is_null() {
                return None;
            }
            let bytes = std::slice::from_raw_parts(data, size).to_vec();
            let _ = GlobalUnlock(global);
            Some(bytes)
        }
    }

    fn enhmetafile_bytes(handle: HANDLE) -> Option<Vec<u8>> {
        let metafile = HENHMETAFILE(handle.0);
        unsafe {
            let size = GetEnhMetaFileBits(metafile, None) as usize;
            if size == 0 {
                return None;
            }
            let mut bytes = vec![0; size];
            (GetEnhMetaFileBits(metafile, Some(&mut bytes)) as usize == size).then_some(bytes)
        }
    }

    /// Clipboard data allocated but not yet handed to the clipboard. Frees
    /// itself unless [`Pending::transfer`] succeeds.
    enum Pending {
        Global(HGLOBAL),
        Metafile(HENHMETAFILE),
    }

    impl Pending {
        fn global(bytes: &[u8]) -> Result<Self, String> {
            unsafe {
                let global = GlobalAlloc(GMEM_MOVEABLE, bytes.len().max(1))
                    .map_err(|e| format!("Out of memory for the clipboard: {e}"))?;
                let data = GlobalLock(global) as *mut u8;
                if data.is_null() {
                    let _ = GlobalFree(Some(global));
                    return Err("Couldn't lock clipboard memory.".into());
                }
                std::ptr::copy_nonoverlapping(bytes.as_ptr(), data, bytes.len());
                let _ = GlobalUnlock(global);
                Ok(Self::Global(global))
            }
        }

        fn for_format(format: &SavedFormat) -> Result<Self, String> {
            if format.id == CF_ENHMETAFILE {
                let metafile = unsafe { SetEnhMetaFileBits(&format.bytes) };
                if metafile.is_invalid() {
                    return Err("Couldn't rebuild a saved picture.".into());
                }
                return Ok(Self::Metafile(metafile));
            }
            Self::global(&format.bytes)
        }

        fn handle(&self) -> HANDLE {
            match self {
                Self::Global(global) => HANDLE(global.0),
                Self::Metafile(metafile) => HANDLE(metafile.0),
            }
        }

        /// Gives the data to the open clipboard, which then owns it.
        fn transfer(self, id: u32) -> bool {
            let placed = unsafe { SetClipboardData(id, Some(self.handle())) }.is_ok();
            if placed {
                std::mem::forget(self);
            }
            placed
        }
    }

    impl Drop for Pending {
        fn drop(&mut self) {
            unsafe {
                match self {
                    Self::Global(global) => {
                        let _ = GlobalFree(Some(*global));
                    }
                    Self::Metafile(metafile) => {
                        let _ = DeleteEnhMetaFile(Some(*metafile));
                    }
                }
            }
        }
    }

    /// Marks the open clipboard's content as Snipsy's: kept out of Win+V
    /// history and cloud clipboard sync.
    fn exclude_from_history(skip: &[u32]) {
        let zero = 0u32.to_le_bytes();
        for name in [
            w!("CanIncludeInClipboardHistory"),
            w!("CanUploadToCloudClipboard"),
        ] {
            let id = unsafe { RegisterClipboardFormatW(name) };
            if id == 0 || skip.contains(&id) {
                continue;
            }
            if let Ok(pending) = Pending::global(&zero) {
                pending.transfer(id);
            }
        }
    }

    fn utf16_bytes(text: &str) -> Vec<u8> {
        text.encode_utf16()
            .chain(std::iter::once(0))
            .flat_map(u16::to_le_bytes)
            .collect()
    }

    pub struct SystemClipboard;

    impl Clipboard for SystemClipboard {
        fn snapshot(&mut self) -> Result<Snapshot, String> {
            let _open = Open::new(false)?;
            let available = |id| unsafe { IsClipboardFormatAvailable(id) }.is_ok();
            let has_unicode = available(CF_UNICODETEXT);
            let has_dib = available(CF_DIB) || available(CF_DIBV5);
            let mut snapshot = Snapshot {
                complete: true,
                ..Snapshot::default()
            };
            let mut total = 0usize;
            let mut id = 0;
            loop {
                id = unsafe { EnumClipboardFormats(id) };
                if id == 0 {
                    break;
                }
                if is_synthesized(id, has_unicode, has_dib) {
                    continue;
                }
                if is_handle_format(id) {
                    snapshot.complete = false;
                    continue;
                }
                let bytes = unsafe { GetClipboardData(id) }.ok().and_then(|handle| {
                    if id == CF_ENHMETAFILE {
                        enhmetafile_bytes(handle)
                    } else {
                        global_bytes(handle)
                    }
                });
                let Some(bytes) = bytes else {
                    snapshot.complete = false;
                    continue;
                };
                total += bytes.len();
                if total > MAX_SNAPSHOT_BYTES {
                    return Err("The clipboard holds too much data to save.".into());
                }
                if id == CF_UNICODETEXT {
                    snapshot.text = Some(utf16_text(&bytes));
                }
                snapshot.formats.push(SavedFormat { id, bytes });
            }
            Ok(snapshot)
        }

        fn read_text(&mut self) -> Result<Option<String>, String> {
            let _open = Open::new(false)?;
            if unsafe { IsClipboardFormatAvailable(CF_UNICODETEXT) }.is_err() {
                return Ok(None);
            }
            let handle = unsafe { GetClipboardData(CF_UNICODETEXT) }
                .map_err(|e| format!("Couldn't read clipboard text: {e}"))?;
            global_bytes(handle)
                .map(|bytes| Some(utf16_text(&bytes)))
                .ok_or_else(|| "Couldn't read clipboard text.".into())
        }

        fn sequence(&mut self) -> Option<u64> {
            sequence()
        }

        fn write_text(&mut self, text: &str) -> Result<Option<u64>, String> {
            let pending = Pending::global(&utf16_bytes(text))?;
            {
                let _open = Open::new(true)?;
                unsafe { EmptyClipboard() }
                    .map_err(|e| format!("Failed to clear the clipboard: {e}"))?;
                if !pending.transfer(CF_UNICODETEXT) {
                    return Err("Failed to set clipboard text.".into());
                }
                exclude_from_history(&[]);
            }
            // Read after closing: a microsecond window in which another app's
            // write would be mistaken for ours.
            Ok(sequence())
        }

        fn write_image(&mut self, image: &DecodedImage) -> Result<Option<u64>, String> {
            use arboard::SetExtWindows;
            arboard::Clipboard::new()
                .map_err(|e| format!("Failed to access clipboard: {e}"))?
                .set()
                .exclude_from_history()
                .image(arboard::ImageData {
                    width: image.width,
                    height: image.height,
                    bytes: std::borrow::Cow::Borrowed(&image.rgba),
                })
                .map_err(|e| format!("Failed to copy image to the clipboard: {e}"))?;
            Ok(sequence())
        }

        fn restore_if_unchanged(
            &mut self,
            snapshot: &Snapshot,
            expected: u64,
        ) -> Result<bool, String> {
            // Allocate before taking the clipboard, so it is held briefly.
            let mut pending = Vec::new();
            for format in &snapshot.formats {
                match Pending::for_format(format) {
                    Ok(data) => pending.push((format.id, data)),
                    Err(error) => {
                        tracing::warn!(format = format.id, %error, "Skipping clipboard format")
                    }
                }
            }
            let _open = Open::new(true)?;
            // Checked with the clipboard open, so nothing can change it between
            // the check and the restore.
            if sequence() != Some(expected) {
                return Ok(false);
            }
            unsafe { EmptyClipboard() }
                .map_err(|e| format!("Failed to clear the clipboard: {e}"))?;
            let mut failed = 0;
            for (id, data) in pending {
                if !data.transfer(id) {
                    failed += 1;
                }
            }
            if failed > 0 {
                tracing::warn!(failed, "Some clipboard formats could not be restored");
            }
            let saved: Vec<u32> = snapshot.formats.iter().map(|format| format.id).collect();
            exclude_from_history(&saved);
            Ok(true)
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    //! Best effort: arboard can save and restore text or an image, and a hash
    //! of the content stands in for a change counter.
    use super::*;
    use std::hash::{Hash, Hasher};

    const TEXT: u32 = 1;
    const IMAGE: u32 = 2;

    fn clipboard() -> Result<arboard::Clipboard, String> {
        arboard::Clipboard::new().map_err(|e| format!("Failed to access clipboard: {e}"))
    }

    fn encode_image(image: &arboard::ImageData) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(16 + image.bytes.len());
        bytes.extend((image.width as u64).to_le_bytes());
        bytes.extend((image.height as u64).to_le_bytes());
        bytes.extend(image.bytes.iter());
        bytes
    }

    fn decode_image(bytes: &[u8]) -> Option<arboard::ImageData<'_>> {
        let width = u64::from_le_bytes(bytes.get(..8)?.try_into().ok()?) as usize;
        let height = u64::from_le_bytes(bytes.get(8..16)?.try_into().ok()?) as usize;
        Some(arboard::ImageData {
            width,
            height,
            bytes: std::borrow::Cow::Borrowed(&bytes[16..]),
        })
    }

    pub struct SystemClipboard;

    impl Clipboard for SystemClipboard {
        fn snapshot(&mut self) -> Result<Snapshot, String> {
            let mut board = clipboard()?;
            let mut snapshot = Snapshot {
                complete: false,
                ..Snapshot::default()
            };
            if let Ok(text) = board.get_text() {
                snapshot.formats.push(SavedFormat {
                    id: TEXT,
                    bytes: text.clone().into_bytes(),
                });
                snapshot.text = Some(text);
            }
            if let Ok(image) = board.get_image() {
                let bytes = encode_image(&image);
                if bytes.len() > MAX_SNAPSHOT_BYTES {
                    return Err("The clipboard holds too much data to save.".into());
                }
                snapshot.formats.push(SavedFormat { id: IMAGE, bytes });
            }
            Ok(snapshot)
        }

        fn read_text(&mut self) -> Result<Option<String>, String> {
            Ok(clipboard()?.get_text().ok())
        }

        fn sequence(&mut self) -> Option<u64> {
            let mut board = clipboard().ok()?;
            let mut hasher = std::collections::hash_map::DefaultHasher::new();
            board.get_text().ok().hash(&mut hasher);
            if let Ok(image) = board.get_image() {
                image.bytes.hash(&mut hasher);
            }
            Some(hasher.finish())
        }

        fn write_text(&mut self, text: &str) -> Result<Option<u64>, String> {
            clipboard()?
                .set_text(text)
                .map_err(|e| format!("Failed to set clipboard text: {e}"))?;
            Ok(self.sequence())
        }

        fn write_image(&mut self, image: &DecodedImage) -> Result<Option<u64>, String> {
            clipboard()?
                .set_image(arboard::ImageData {
                    width: image.width,
                    height: image.height,
                    bytes: std::borrow::Cow::Borrowed(&image.rgba),
                })
                .map_err(|e| format!("Failed to copy image to the clipboard: {e}"))?;
            Ok(self.sequence())
        }

        fn restore_if_unchanged(
            &mut self,
            snapshot: &Snapshot,
            expected: u64,
        ) -> Result<bool, String> {
            if self.sequence() != Some(expected) {
                return Ok(false);
            }
            let mut board = clipboard()?;
            let image = snapshot.formats.iter().find(|format| format.id == IMAGE);
            if let Some(image) = image.and_then(|format| decode_image(&format.bytes)) {
                board.set_image(image).map_err(|e| e.to_string())?;
            } else if let Some(text) = &snapshot.text {
                board.set_text(text.as_str()).map_err(|e| e.to_string())?;
            } else {
                board.clear().map_err(|e| e.to_string())?;
            }
            Ok(true)
        }
    }
}

#[cfg(test)]
pub mod fake {
    use super::*;
    use std::sync::{Arc, Mutex};

    /// In-memory clipboard: `contents` changes bump `sequence`, like Windows.
    #[derive(Debug, Default)]
    pub struct State {
        pub contents: Vec<SavedFormat>,
        pub sequence: u64,
        pub restores: usize,
        pub fail_snapshot: bool,
    }

    impl State {
        pub fn with_text(text: &str) -> Self {
            Self {
                contents: vec![SavedFormat {
                    id: 13,
                    bytes: text.as_bytes().to_vec(),
                }],
                sequence: 1,
                ..Self::default()
            }
        }

        /// What a user's own copy does.
        pub fn copy(&mut self, text: &str) {
            self.contents = Self::with_text(text).contents;
            self.sequence += 1;
        }

        pub fn text(&self) -> Option<String> {
            self.contents
                .iter()
                .find(|format| format.id == 13)
                .map(|format| String::from_utf8(format.bytes.clone()).unwrap())
        }
    }

    pub struct FakeClipboard(pub Arc<Mutex<State>>);

    impl Clipboard for FakeClipboard {
        fn snapshot(&mut self) -> Result<Snapshot, String> {
            let state = self.0.lock().unwrap();
            if state.fail_snapshot {
                return Err("busy".into());
            }
            Ok(Snapshot {
                formats: state.contents.clone(),
                text: state.text(),
                complete: true,
            })
        }

        fn read_text(&mut self) -> Result<Option<String>, String> {
            Ok(self.0.lock().unwrap().text())
        }

        fn sequence(&mut self) -> Option<u64> {
            Some(self.0.lock().unwrap().sequence)
        }

        fn write_text(&mut self, text: &str) -> Result<Option<u64>, String> {
            let mut state = self.0.lock().unwrap();
            state.copy(text);
            Ok(Some(state.sequence))
        }

        fn write_image(&mut self, image: &DecodedImage) -> Result<Option<u64>, String> {
            let mut state = self.0.lock().unwrap();
            state.contents = vec![SavedFormat {
                id: 8,
                bytes: vec![image.width as u8],
            }];
            state.sequence += 1;
            Ok(Some(state.sequence))
        }

        fn restore_if_unchanged(
            &mut self,
            snapshot: &Snapshot,
            expected: u64,
        ) -> Result<bool, String> {
            let mut state = self.0.lock().unwrap();
            if state.sequence != expected {
                return Ok(false);
            }
            state.contents = snapshot.formats.clone();
            state.sequence += 1;
            state.restores += 1;
            Ok(true)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::fake::{FakeClipboard, State};
    use super::*;
    use std::sync::{Arc, Mutex};

    fn settings(restore: bool) -> AppSettings {
        AppSettings {
            restore_clipboard: restore,
            clipboard_restore_delay_ms: 0,
        }
    }

    fn guard(
        state: &Arc<Mutex<State>>,
        restore: bool,
        needs_text: bool,
    ) -> Result<ClipboardGuard, String> {
        ClipboardGuard::begin(
            Box::new(FakeClipboard(state.clone())),
            settings(restore),
            true,
            needs_text,
        )
    }

    fn image() -> DecodedImage {
        DecodedImage {
            width: 7,
            height: 1,
            rgba: Vec::new(),
        }
    }

    #[test]
    fn restores_what_was_there_before_the_paste() {
        let state = Arc::new(Mutex::new(State::with_text("mine")));
        let mut guard = guard(&state, true, false).unwrap();
        guard.write_text("snippet").unwrap();
        guard.pasting();
        assert_eq!(state.lock().unwrap().text().as_deref(), Some("snippet"));
        guard.finish();
        assert_eq!(state.lock().unwrap().text().as_deref(), Some("mine"));
        assert_eq!(state.lock().unwrap().restores, 1);
    }

    #[test]
    fn restores_once_after_several_image_pastes() {
        let state = Arc::new(Mutex::new(State::with_text("mine")));
        let mut guard = guard(&state, true, false).unwrap();
        for _ in 0..3 {
            guard.write_image(&image()).unwrap();
            guard.pasting();
        }
        drop(guard);
        let state = state.lock().unwrap();
        assert_eq!(state.text().as_deref(), Some("mine"));
        assert_eq!(state.restores, 1);
    }

    #[test]
    fn a_copy_after_the_paste_is_never_clobbered() {
        let state = Arc::new(Mutex::new(State::with_text("mine")));
        let mut guard = guard(&state, true, false).unwrap();
        guard.write_text("snippet").unwrap();
        state.lock().unwrap().copy("copied mid-demo");
        guard.finish();
        assert_eq!(
            state.lock().unwrap().text().as_deref(),
            Some("copied mid-demo")
        );
        assert_eq!(state.lock().unwrap().restores, 0);
    }

    #[test]
    fn a_copy_between_image_pastes_cancels_the_restore() {
        let state = Arc::new(Mutex::new(State::with_text("mine")));
        let mut guard = guard(&state, true, false).unwrap();
        guard.write_image(&image()).unwrap();
        state.lock().unwrap().copy("copied mid-demo");
        guard.write_image(&image()).unwrap();
        guard.finish();
        assert_eq!(state.lock().unwrap().restores, 0);
    }

    #[test]
    fn disabled_or_unsaved_clipboards_are_left_as_pasted() {
        let state = Arc::new(Mutex::new(State::with_text("mine")));
        let mut off = guard(&state, false, false).unwrap();
        off.write_text("snippet").unwrap();
        off.finish();
        assert_eq!(state.lock().unwrap().text().as_deref(), Some("snippet"));

        let state = Arc::new(Mutex::new(State::with_text("mine")));
        state.lock().unwrap().fail_snapshot = true;
        let mut failed = guard(&state, true, false).unwrap();
        failed.write_text("snippet").unwrap();
        failed.finish();
        assert_eq!(state.lock().unwrap().restores, 0);
    }

    #[test]
    fn nothing_is_restored_when_nothing_was_written() {
        let state = Arc::new(Mutex::new(State::with_text("mine")));
        let mut guard = guard(&state, true, false).unwrap();
        guard.finish();
        assert_eq!(state.lock().unwrap().restores, 0);
        assert_eq!(state.lock().unwrap().sequence, 1);
    }

    #[test]
    fn clipboard_text_comes_from_before_the_delivery() {
        let state = Arc::new(Mutex::new(State::with_text("before")));
        let mut guard = guard(&state, true, true).unwrap();
        guard.write_text("snippet").unwrap();
        assert_eq!(guard.text(), Some("before"));

        // Without a snapshot the text is read directly.
        let state = Arc::new(Mutex::new(State::with_text("before")));
        assert_eq!(guard_text(&state, false), Ok("before".to_string()));

        let empty = Arc::new(Mutex::new(State::default()));
        assert_eq!(guard_text(&empty, true), Err(NO_CLIPBOARD_TEXT.to_string()));
    }

    fn guard_text(state: &Arc<Mutex<State>>, restore: bool) -> Result<String, String> {
        guard(state, restore, true).map(|guard| guard.text().unwrap().to_string())
    }

    #[test]
    fn utf16_text_stops_at_the_terminator() {
        let bytes: Vec<u8> = "hé🎉\0junk"
            .encode_utf16()
            .flat_map(u16::to_le_bytes)
            .collect();
        assert_eq!(utf16_text(&bytes), "hé🎉");
    }
}
