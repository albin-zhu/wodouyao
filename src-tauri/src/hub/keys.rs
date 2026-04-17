//! tmux send-keys style key literal parser.
//!
//! Converts a human-authored string like `"ls Enter"` or `"C-c"` into the
//! exact byte sequence that should be written to a PTY. Tokens are split on
//! whitespace; each token is either a recognised key literal (mapped to a
//! fixed byte sequence) or ordinary text (emitted as UTF-8 bytes verbatim).
//! An ASCII space (0x20) is inserted between adjacent tokens *unless* both
//! sides are key literals, so `"ls Enter"` yields `b"ls" + b" " + b"\r"` but
//! `"Enter Enter"` yields two CRs with no separator.
//!
//! A literal escape form `{...}` is supported: the inner content is emitted
//! as plain text bytes and is never consulted in the lookup table, so
//! `"{C-c}"` becomes `b"C-c"` rather than 0x03.

/// Parse a key spec string into the byte sequence to write to a PTY.
pub fn parse_keys(input: &str) -> Vec<u8> {
    let mut out: Vec<u8> = Vec::new();
    let mut prev_was_literal = false;
    let mut first = true;

    for token in input.split_whitespace() {
        let (bytes, is_literal) = translate_token(token);

        if !first {
            // Insert a space separator between tokens, but only when at least
            // one side is plain text (unrecognised token).
            if !(prev_was_literal && is_literal) {
                out.push(b' ');
            }
        }
        out.extend_from_slice(&bytes);

        prev_was_literal = is_literal;
        first = false;
    }

    out
}

/// Translate a single whitespace-free token.
/// Returns (bytes, is_key_literal). `is_key_literal` controls whether a
/// separator space is required when joining with the neighbouring token.
fn translate_token(token: &str) -> (Vec<u8>, bool) {
    // Explicit literal escape: {...} -> inner as plain text.
    // Use byte length to locate the braces (ASCII) but keep char boundary
    // safety in mind — `token.len() - 1` is always at the closing brace.
    if token.len() >= 2 && token.starts_with('{') && token.ends_with('}') {
        let inner = &token[1..token.len() - 1];
        return (inner.as_bytes().to_vec(), false);
    }

    if let Some(bytes) = lookup_key(token) {
        return (bytes, true);
    }

    // Unrecognised -> literal text.
    (token.as_bytes().to_vec(), false)
}

/// Look up a single key literal token (case-insensitive) and return its
/// byte sequence, or None if the token isn't a recognised literal.
fn lookup_key(token: &str) -> Option<Vec<u8>> {
    // Meta/Alt prefix: M-<key> -> 0x1b followed by recursive lookup of <key>.
    // Only consider when the prefix is actually two ASCII chars (M + -);
    // otherwise splitting at byte 2 may land inside a multi-byte codepoint.
    if is_ascii_prefix(token, 2) {
        let (head, rest) = token.split_at(2);
        if head.eq_ignore_ascii_case("M-") && !rest.is_empty() {
            let mut bytes = vec![0x1b];
            let inner = lookup_key(rest).unwrap_or_else(|| rest.as_bytes().to_vec());
            bytes.extend_from_slice(&inner);
            return Some(bytes);
        }
    }

    // Control keys: C-<x>
    if is_ascii_prefix(token, 2) && token.len() >= 3 {
        let (head, rest) = token.split_at(2);
        if head.eq_ignore_ascii_case("C-") {
            return control_byte(rest).map(|b| vec![b]);
        }
    }

    // Named keys (case-insensitive).
    let lower = token.to_ascii_lowercase();
    let bytes: &[u8] = match lower.as_str() {
        "enter" | "return" => &[0x0d],
        "tab" => &[0x09],
        "escape" | "esc" => &[0x1b],
        "space" => &[0x20],
        "bspace" | "backspace" => &[0x7f],
        "up" => b"\x1b[A",
        "down" => b"\x1b[B",
        "right" => b"\x1b[C",
        "left" => b"\x1b[D",
        "pageup" | "ppage" => b"\x1b[5~",
        "pagedown" | "npage" => b"\x1b[6~",
        "home" => b"\x1b[H",
        "end" => b"\x1b[F",
        _ => return None,
    };
    Some(bytes.to_vec())
}

/// True iff the first `n` bytes of `s` are all ASCII. Implies byte index `n`
/// is a valid char boundary and `split_at(n)` is safe.
fn is_ascii_prefix(s: &str, n: usize) -> bool {
    s.len() >= n && s.as_bytes()[..n].iter().all(|b| b.is_ascii())
}

/// Map the argument of `C-<x>` to its control byte.
fn control_byte(rest: &str) -> Option<u8> {
    // Letters: C-a..C-z -> 0x01..0x1a, case-insensitive.
    if rest.len() == 1 {
        let c = rest.as_bytes()[0];
        if c.is_ascii_alphabetic() {
            let lower = c.to_ascii_lowercase();
            return Some(lower - b'a' + 1);
        }
        match c {
            b'@' => return Some(0x00),
            b'[' => return Some(0x1b),
            b'\\' => return Some(0x1c),
            b']' => return Some(0x1d),
            _ => {}
        }
    }

    // Multi-char: C-Space.
    if rest.eq_ignore_ascii_case("space") {
        return Some(0x00);
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_text_passthrough() {
        assert_eq!(parse_keys("hello"), b"hello".to_vec());
    }

    #[test]
    fn ctrl_c() {
        assert_eq!(parse_keys("C-c"), vec![0x03]);
    }

    #[test]
    fn ctrl_case_insensitive() {
        assert_eq!(parse_keys("c-C"), vec![0x03]);
        assert_eq!(parse_keys("C-A"), vec![0x01]);
    }

    #[test]
    fn enter_is_cr() {
        assert_eq!(parse_keys("Enter"), vec![0x0d]);
        assert_eq!(parse_keys("enter"), vec![0x0d]);
        assert_eq!(parse_keys("Return"), vec![0x0d]);
    }

    #[test]
    fn meta_x() {
        assert_eq!(parse_keys("M-x"), vec![0x1b, b'x']);
    }

    #[test]
    fn mixed_text_and_enter_has_separator_space() {
        // "ls" is plain text, "Enter" is a literal -> space joins them.
        assert_eq!(parse_keys("ls Enter"), vec![b'l', b's', 0x20, 0x0d]);
    }

    #[test]
    fn two_literals_no_separator() {
        // Adjacent literals must NOT have a separating space.
        assert_eq!(parse_keys("Enter Enter"), vec![0x0d, 0x0d]);
        assert_eq!(parse_keys("C-a C-b"), vec![0x01, 0x02]);
    }

    #[test]
    fn arrow_up() {
        assert_eq!(parse_keys("Up"), vec![0x1b, b'[', b'A']);
    }

    #[test]
    fn braced_literal_is_plain_text() {
        assert_eq!(parse_keys("{C-c}"), b"C-c".to_vec());
    }

    #[test]
    fn meta_enter() {
        assert_eq!(parse_keys("M-Enter"), vec![0x1b, 0x0d]);
    }

    #[test]
    fn hello_world_plain_text_joined_with_space() {
        assert_eq!(
            parse_keys("hello world"),
            vec![b'h', b'e', b'l', b'l', b'o', 0x20, b'w', b'o', b'r', b'l', b'd']
        );
    }

    #[test]
    fn ctrl_special_punctuation() {
        assert_eq!(parse_keys("C-@"), vec![0x00]);
        assert_eq!(parse_keys("C-Space"), vec![0x00]);
        assert_eq!(parse_keys("C-["), vec![0x1b]);
        assert_eq!(parse_keys("C-\\"), vec![0x1c]);
        assert_eq!(parse_keys("C-]"), vec![0x1d]);
    }

    #[test]
    fn pageup_and_home() {
        assert_eq!(parse_keys("PageUp"), b"\x1b[5~".to_vec());
        assert_eq!(parse_keys("Home"), b"\x1b[H".to_vec());
    }

    #[test]
    fn non_ascii_text_passes_through() {
        // "没有" is 6 UTF-8 bytes; naive split_at(2) would land mid-codepoint.
        assert_eq!(parse_keys("没有"), "没有".as_bytes().to_vec());
    }

    #[test]
    fn mixed_chinese_and_enter() {
        let mut expected = "你好".as_bytes().to_vec();
        expected.push(0x20);
        expected.push(0x0d);
        assert_eq!(parse_keys("你好 Enter"), expected);
    }

    #[test]
    fn braced_chinese_literal() {
        assert_eq!(parse_keys("{你好}"), "你好".as_bytes().to_vec());
    }
}
