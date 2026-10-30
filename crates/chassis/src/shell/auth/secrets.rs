//! `Secrets::parse` and its `Debug` impl: the one place the two startup
//! secrets are validated. Its own module so the key-handling code is easy
//! to audit apart from the request path.

use secrecy::SecretString;

use super::Secrets;
use crate::core::crypto::Key;
use crate::core::error::Error;
use crate::shell::time::random_hex;

impl std::fmt::Debug for Secrets {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("Secrets(***)")
    }
}

impl Secrets {
    /// Body of [`Secrets::parse`].
    pub(super) fn parse_checked(
        prefix: &str,
        token: Option<&str>,
        key_hex: Option<&str>,
    ) -> Result<Option<Secrets>, Error> {
        let token_env = format!("{prefix}_TOKEN");
        let key_env = format!("{prefix}_SECRET_KEY");
        match (token, key_hex) {
            (None, None) => Ok(None),
            (Some(_), None) | (None, Some(_)) => {
                let (set, missing) = if token.is_some() {
                    (token_env.clone(), key_env.clone())
                } else {
                    (key_env.clone(), token_env.clone())
                };
                Err(Error::config(
                    format!("{set} is set but {missing} is not; the dashboard needs both"),
                    format!(
                        "run `<binary> gen-secret` on a terminal to get a value for {missing}, then set it in the environment file"
                    ),
                ))
            }
            (Some(t), Some(k)) => {
                if t.len() < 16 {
                    return Err(Error::config(
                        format!("{token_env} is shorter than 16 characters"),
                        "use a long random value; `<binary> gen-secret` prints one",
                    ));
                }
                let candidate = random_hex(32)?;
                let key = Key::parse_hex(&key_env, k, &candidate)?;
                Ok(Some(Secrets {
                    login_token: SecretString::from(t.to_string()),
                    key,
                }))
            }
        }
    }
}
