//! Plans fast-type keystrokes. Optional typos mistype a letter (A–Z) or digit
//! (nearby QWERTY key, doubled, swapped, or skipped) and erase it with
//! Backspace before any other kind of key, so the result always matches the
//! snippet. Optional rhythm variation jitters key delays and pauses after
//! spaces and line breaks.

use fastrand::Rng;

pub const DEFAULT_TYPE_DELAY_MS: u32 = 30;
// Match the snippet editor's sliders, so the editor always shows what runs.
const MAX_TYPO_CHANCE: u32 = 20;
const MAX_TYPE_VARIATION: u32 = 100;
const BACKSPACE_DELAY_FACTOR: f64 = 0.7;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FastTypeOptions {
    pub delay_ms: u32,
    /// Percent chance that a letter (A–Z) or digit is mistyped.
    pub typo_chance: u32,
    /// Percent the delay between keys may drift from `delay_ms`.
    pub variation: u32,
    /// Type line breaks as Shift+Enter, so chat apps add a line instead of sending.
    pub shift_enter: bool,
}

impl FastTypeOptions {
    pub fn new(
        type_delay: Option<u32>,
        typo_chance: Option<u32>,
        type_variation: Option<u32>,
        shift_enter: Option<bool>,
    ) -> Self {
        Self {
            delay_ms: type_delay.unwrap_or(DEFAULT_TYPE_DELAY_MS),
            typo_chance: typo_chance.unwrap_or(0).min(MAX_TYPO_CHANCE),
            variation: type_variation.unwrap_or(0).min(MAX_TYPE_VARIATION),
            shift_enter: shift_enter.unwrap_or(false),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    Type(char),
    Backspace,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Step {
    pub action: Action,
    /// Pause after the keystroke.
    pub delay_ms: u64,
    /// Mistyped characters on screen after the keystroke.
    pub dirty_after: usize,
}

/// Totals for one plan, for logging.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct PlanSummary {
    pub keystrokes: usize,
    pub typos: usize,
    pub planned_ms: u64,
}

pub fn summarize(steps: &[Step]) -> PlanSummary {
    PlanSummary {
        keystrokes: steps.len(),
        // Each correction ends with the Backspace that clears the last mistake.
        typos: steps
            .iter()
            .filter(|step| step.action == Action::Backspace && step.dirty_after == 0)
            .count(),
        planned_ms: steps.iter().map(|step| step.delay_ms).sum(),
    }
}

pub fn plan(text: &str, options: &FastTypeOptions, rng: &mut Rng) -> Vec<Step> {
    let target: Vec<char> = text.chars().collect();
    let mut planner = Planner {
        options: *options,
        rng,
        steps: Vec::with_capacity(target.len()),
    };
    let mut index = 0;
    // Characters retyped after a correction are not mistyped again.
    let mut clean_from = 0;
    while index < target.len() {
        if index >= clean_from && is_typo_eligible(target[index]) && planner.rolls_typo() {
            let typo = pick_typo(&target, index, planner.rng);
            planner.push_typo(&typo);
            index += typo.keep;
            clean_from = typo.clean_from;
        } else {
            let ch = target[index];
            let delay = planner.key_delay(ch);
            planner.push(Action::Type(ch), delay, 0);
            index += 1;
        }
    }
    planner.steps
}

#[derive(Debug)]
struct Typo {
    /// Keys pressed before the mistake is noticed.
    typed: Vec<char>,
    /// Leading `typed` keys that were right and stay on screen.
    keep: usize,
    /// First character that may be mistyped again.
    clean_from: usize,
}

/// Mistypes `target[index]`. Every typed key is a letter or digit, so the
/// mistake is always erased before a space, symbol, or line break is typed.
fn pick_typo(target: &[char], index: usize, rng: &mut Rng) -> Typo {
    let ch = target[index];
    let next = target.get(index + 1).copied();
    let swappable = next.is_some_and(|next| next != ch && is_typo_eligible(next));
    let (mut typed, continue_from) = match rng.u32(0..100) {
        // Doubled: "thhe"
        50..=64 if next != Some(ch) => (vec![ch, ch], index + 1),
        // Swapped: "hte"
        65..=84 if swappable => (vec![target[index + 1], ch], index + 2),
        // Skipped: "te"
        85..=99 if swappable => (vec![target[index + 1]], index + 2),
        // Nearby key: "rhe"
        _ => (vec![nearby_key(ch, rng)], index + 1),
    };

    // Typists often carry on for a key or two before noticing.
    let word_left = target[continue_from..]
        .iter()
        .take_while(|&&ch| is_typo_eligible(ch))
        .count();
    let carried_on = match rng.u32(0..100) {
        0..=54 => 0,
        55..=84 => 1,
        _ => 2,
    }
    .min(word_left);
    typed.extend_from_slice(&target[continue_from..continue_from + carried_on]);

    let keep = typed
        .iter()
        .zip(&target[index..])
        .take_while(|(typed, wanted)| typed == wanted)
        .count();
    debug_assert!(keep < typed.len());
    Typo {
        typed,
        keep,
        clean_from: continue_from + carried_on,
    }
}

struct Planner<'a> {
    options: FastTypeOptions,
    rng: &'a mut Rng,
    steps: Vec<Step>,
}

impl Planner<'_> {
    fn push(&mut self, action: Action, delay_ms: u64, dirty_after: usize) {
        self.steps.push(Step {
            action,
            delay_ms,
            dirty_after,
        });
    }

    fn rolls_typo(&mut self) -> bool {
        self.options.typo_chance > 0 && self.rng.u32(0..100) < self.options.typo_chance
    }

    fn push_typo(&mut self, typo: &Typo) {
        let last = typo.typed.len() - 1;
        for (offset, &ch) in typo.typed.iter().enumerate() {
            let delay = if offset == last {
                self.notice_pause()
            } else {
                self.key_delay(ch)
            };
            self.push(
                Action::Type(ch),
                delay,
                (offset + 1).saturating_sub(typo.keep),
            );
        }
        for remaining in (0..typo.typed.len() - typo.keep).rev() {
            let delay = self.backspace_delay();
            self.push(Action::Backspace, delay, remaining);
        }
    }

    fn base_delay(&self) -> f64 {
        f64::from(self.options.delay_ms)
    }

    fn variation(&self) -> f64 {
        f64::from(self.options.variation) / 100.0
    }

    fn jitter(&mut self, base: f64) -> f64 {
        let variation = self.variation();
        if variation == 0.0 {
            return base;
        }
        base * (1.0 + variation * (self.rng.f64() * 2.0 - 1.0))
    }

    fn key_delay(&mut self, ch: char) -> u64 {
        let base = self.base_delay();
        let variation = self.variation();
        let mut delay = self.jitter(base);
        if variation > 0.0 {
            delay += match ch {
                ' ' | '\t' => base * variation * self.rng.f64() * 3.0,
                '\n' => base * variation * (2.0 + self.rng.f64() * 6.0),
                _ => 0.0,
            };
        }
        to_ms(delay)
    }

    fn backspace_delay(&mut self) -> u64 {
        let base = self.base_delay() * BACKSPACE_DELAY_FACTOR;
        to_ms(self.jitter(base))
    }

    /// The beat where the typist spots the mistake.
    fn notice_pause(&mut self) -> u64 {
        to_ms(self.base_delay() * (4.0 + self.rng.f64() * 4.0))
    }
}

fn to_ms(value: f64) -> u64 {
    value.max(0.0).round() as u64
}

fn is_typo_eligible(ch: char) -> bool {
    !qwerty_neighbors(ch.to_ascii_lowercase()).is_empty()
}

fn nearby_key(ch: char, rng: &mut Rng) -> char {
    let neighbors = qwerty_neighbors(ch.to_ascii_lowercase()).as_bytes();
    let key = char::from(neighbors[rng.usize(..neighbors.len())]);
    if ch.is_ascii_uppercase() {
        key.to_ascii_uppercase()
    } else {
        key
    }
}

fn qwerty_neighbors(key: char) -> &'static str {
    match key {
        'q' => "wa",
        'w' => "qeas",
        'e' => "wrsd",
        'r' => "etdf",
        't' => "ryfg",
        'y' => "tugh",
        'u' => "yihj",
        'i' => "uojk",
        'o' => "ipkl",
        'p' => "ol",
        'a' => "qwsz",
        's' => "weadzx",
        'd' => "ersfxc",
        'f' => "rtdgcv",
        'g' => "tyfhvb",
        'h' => "yugjbn",
        'j' => "uihknm",
        'k' => "iojlm",
        'l' => "opk",
        'z' => "asx",
        'x' => "sdzc",
        'c' => "dfxv",
        'v' => "fgcb",
        'b' => "ghvn",
        'n' => "hjbm",
        'm' => "jkn",
        '1' => "2",
        '2' => "13",
        '3' => "24",
        '4' => "35",
        '5' => "46",
        '6' => "57",
        '7' => "68",
        '8' => "79",
        '9' => "80",
        '0' => "9",
        _ => "",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    const SAMPLES: &[&str] = &[
        "",
        "a",
        "Q",
        "7",
        "tt",
        "ab",
        "the quick brown fox",
        "Hello, World! 1234567890",
        "fn main() {\n\tprintln!(\"héllo 世界 🎉\");\n}\n",
        "aaaa bbbb zzzz 0000",
        "CRLF\r\nline\r\n",
        "x1y2z3 AbCd",
        "café naïve",
    ];

    fn options(delay_ms: u32, typo_chance: u32, variation: u32) -> FastTypeOptions {
        FastTypeOptions {
            delay_ms,
            typo_chance,
            variation,
            shift_enter: false,
        }
    }

    fn mistakes(screen: &[char], target: &[char]) -> usize {
        let correct = screen
            .iter()
            .zip(target)
            .take_while(|(shown, wanted)| shown == wanted)
            .count();
        screen.len() - correct
    }

    /// Replays a plan and checks every keystroke against the safety rules.
    fn assert_safe_plan(text: &str, steps: &[Step]) {
        let target: Vec<char> = text.chars().collect();
        let mut screen = Vec::new();
        for (position, step) in steps.iter().enumerate() {
            let dirty_before = mistakes(&screen, &target);
            match step.action {
                Action::Type(ch) => {
                    assert!(
                        dirty_before == 0 || ch.is_ascii_alphanumeric(),
                        "{text:?}: typed {ch:?} over a mistake at step {position}"
                    );
                    screen.push(ch);
                    if !ch.is_ascii_alphanumeric() {
                        assert_eq!(
                            mistakes(&screen, &target),
                            0,
                            "{text:?}: mistyped {ch:?} at step {position}"
                        );
                    }
                }
                Action::Backspace => {
                    assert!(
                        dirty_before > 0,
                        "{text:?}: erased a correct character at step {position}"
                    );
                    assert!(screen.pop().is_some_and(|ch| ch.is_ascii_alphanumeric()));
                }
            }
            assert_eq!(
                step.dirty_after,
                mistakes(&screen, &target),
                "{text:?}: mistake count at step {position}"
            );
        }
        assert_eq!(screen, target, "{text:?}: final text");
    }

    fn typo_count(steps: &[Step]) -> usize {
        steps
            .windows(2)
            .filter(|pair| {
                matches!(pair[0].action, Action::Type(_)) && pair[1].action == Action::Backspace
            })
            .count()
    }

    #[test]
    fn plans_always_end_with_the_exact_text() {
        for text in SAMPLES {
            for typo_chance in [0, 3, 20, 100] {
                for variation in [0, 50, 100] {
                    for seed in 0..100 {
                        let steps = plan(
                            text,
                            &options(30, typo_chance, variation),
                            &mut Rng::with_seed(seed),
                        );
                        assert_safe_plan(text, &steps);
                    }
                }
            }
        }
    }

    #[test]
    fn disabled_options_match_legacy_typing() {
        let text = "Hi there,\n\tworld! 🎉";
        let steps = plan(
            text,
            &FastTypeOptions::new(Some(45), None, None, None),
            &mut Rng::with_seed(7),
        );
        let legacy: Vec<Step> = text
            .chars()
            .map(|ch| Step {
                action: Action::Type(ch),
                delay_ms: 45,
                dirty_after: 0,
            })
            .collect();
        assert_eq!(steps, legacy);
    }

    #[test]
    fn summary_counts_keystrokes_typos_and_time() {
        let text = "the quick brown fox jumps over the lazy dog ".repeat(5);
        for seed in 0..50 {
            let steps = plan(&text, &options(30, 20, 50), &mut Rng::with_seed(seed));
            let summary = summarize(&steps);
            assert_eq!(summary.keystrokes, steps.len());
            assert_eq!(summary.typos, typo_count(&steps));
        }
        let clean = summarize(&plan("abc", &options(30, 0, 0), &mut Rng::with_seed(1)));
        assert_eq!(
            clean,
            PlanSummary {
                keystrokes: 3,
                typos: 0,
                planned_ms: 90
            }
        );
    }

    #[test]
    fn options_default_and_clamp() {
        assert_eq!(
            FastTypeOptions::new(None, None, None, None),
            options(30, 0, 0)
        );
        assert_eq!(
            FastTypeOptions::new(Some(5), Some(250), Some(101), None),
            options(5, 20, 100)
        );
        assert!(FastTypeOptions::new(None, None, None, Some(true)).shift_enter);
    }

    #[test]
    fn picks_every_typo_kind() {
        let target: Vec<char> = "abcd".chars().collect();
        let mut kinds = HashSet::new();
        for seed in 0..500 {
            let typo = pick_typo(&target, 1, &mut Rng::with_seed(seed));
            let kind = match (typo.typed[0], typo.typed.get(1).copied()) {
                ('b', Some('b')) => "doubled",
                ('c', Some('b')) => "swapped",
                ('c', _) => "skipped",
                (key, _) if qwerty_neighbors('b').contains(key) => "nearby",
                other => panic!("unexpected typo {other:?}"),
            };
            kinds.insert(kind);
        }
        assert_eq!(kinds.len(), 4, "{kinds:?}");
    }

    #[test]
    fn typos_only_double_or_swap_when_visible() {
        // Doubling or swapping the "ll" would look correct, so only nearby keys remain.
        let target: Vec<char> = "all".chars().collect();
        for seed in 0..200 {
            let typo = pick_typo(&target, 1, &mut Rng::with_seed(seed));
            assert!(qwerty_neighbors('l').contains(typo.typed[0]), "{typo:?}");
        }
        // Never swap with, skip into, or carry on past a space or the end.
        for (text, index) in [("a b", 0), ("z", 0)] {
            let target: Vec<char> = text.chars().collect();
            for seed in 0..200 {
                let typo = pick_typo(&target, index, &mut Rng::with_seed(seed));
                assert!(
                    typo.typed.iter().all(char::is_ascii_alphanumeric),
                    "{typo:?}"
                );
                assert_eq!(typo.clean_from, index + 1, "{typo:?}");
            }
        }
    }

    #[test]
    fn nearby_keys_are_adjacent_and_keep_case() {
        for ch in ('a'..='z').chain('A'..='Z').chain('0'..='9') {
            for seed in 0..20 {
                let key = nearby_key(ch, &mut Rng::with_seed(seed));
                assert_ne!(key, ch);
                assert!(
                    qwerty_neighbors(ch.to_ascii_lowercase()).contains(key.to_ascii_lowercase())
                );
                assert_eq!(key.is_ascii_uppercase(), ch.is_ascii_uppercase());
            }
        }
    }

    #[test]
    fn qwerty_neighbors_cover_letters_and_digits_symmetrically() {
        for key in ('a'..='z').chain('0'..='9') {
            let neighbors = qwerty_neighbors(key);
            assert!(!neighbors.is_empty(), "{key} has no neighbors");
            for neighbor in neighbors.chars() {
                assert!(
                    qwerty_neighbors(neighbor).contains(key),
                    "{key} -> {neighbor} is one-way"
                );
            }
        }
        assert!(!is_typo_eligible(' '));
        assert!(!is_typo_eligible('é'));
        assert!(!is_typo_eligible('_'));
    }

    #[test]
    fn typo_rate_tracks_the_setting() {
        let text = "the quick brown fox jumps over the lazy dog ".repeat(200);
        let letters = text.chars().filter(char::is_ascii_alphanumeric).count() as f64;
        for chance in [2, 5, 10] {
            let steps = plan(&text, &options(0, chance, 0), &mut Rng::with_seed(42));
            let rate = typo_count(&steps) as f64 / letters * 100.0;
            let chance = f64::from(chance);
            assert!(
                rate > chance * 0.7 && rate < chance * 1.2,
                "{chance}% chance produced a {rate:.2}% typo rate"
            );
        }
    }

    #[test]
    fn variation_stays_within_bounds() {
        let text = "lorem ipsum dolor\nsit amet\tconsectetur ".repeat(20);
        let base = 40.0;
        for variation in [0, 25, 100] {
            let steps = plan(&text, &options(40, 0, variation), &mut Rng::with_seed(9));
            let spread = f64::from(variation) / 100.0;
            for (step, ch) in steps.iter().zip(text.chars()) {
                let (low, high) = match ch {
                    ' ' | '\t' => (base * (1.0 - spread), base * (1.0 + 4.0 * spread)),
                    '\n' => (base * (1.0 + spread), base * (1.0 + 9.0 * spread)),
                    _ => (base * (1.0 - spread), base * (1.0 + spread)),
                };
                let delay = step.delay_ms as f64;
                assert!(
                    delay >= low.floor() && delay <= high.ceil(),
                    "{variation}% variation gave {delay}ms after {ch:?}"
                );
            }
            let distinct: HashSet<u64> = steps.iter().map(|step| step.delay_ms).collect();
            if variation == 0 {
                assert_eq!(distinct.len(), 1);
            } else {
                assert!(distinct.len() > 5, "{variation}% variation: {distinct:?}");
            }
        }
    }

    #[test]
    fn typos_pause_before_quick_backspaces() {
        let steps = plan(
            "every letter mistyped",
            &options(30, 100, 0),
            &mut Rng::with_seed(3),
        );
        assert!(typo_count(&steps) > 0);
        for (position, step) in steps.iter().enumerate() {
            let before_backspace = steps
                .get(position + 1)
                .is_some_and(|next| next.action == Action::Backspace);
            match step.action {
                Action::Backspace => assert_eq!(step.delay_ms, 21),
                Action::Type(_) if before_backspace => {
                    assert!((120..=240).contains(&step.delay_ms), "{step:?}")
                }
                Action::Type(_) => assert_eq!(step.delay_ms, 30),
            }
        }
    }
}
