//! The two pause modes as the command line and the wire protocol spell them.

use super::Mode;

impl Mode {
    pub fn as_str(self) -> &'static str {
        match self {
            Mode::Writes => "writes",
            Mode::Full => "full",
        }
    }

    pub fn parse(s: &str) -> Option<Mode> {
        match s {
            "writes" => Some(Mode::Writes),
            "full" => Some(Mode::Full),
            _ => None,
        }
    }
}
