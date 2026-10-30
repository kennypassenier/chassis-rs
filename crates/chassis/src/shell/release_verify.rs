//! Verify a downloaded release without an `Updater` or an `App`
//! (homelab-shared-3).
//!
//! A project that fetches release assets itself (homelab's client, with
//! `gh`) needs the same refusal the kit's self-update makes: the minisign
//! signature over `SHA256SUMS` first, then the asset against that list. This
//! is that sequence as one function over plain inputs, built from the pieces
//! `Updater` uses (`verify_signature`, `hash_for`, `hash_matches`).

use crate::core::error::Error;
use crate::core::update::{Version, hash_for, hash_matches};
use crate::shell::update::{sha256_hex, verify_signature};

/// The asset name that carries the signature over `SHA256SUMS`.
pub const SIG_ASSET: &str = "SHA256SUMS.minisig";

/// Why a release is not trusted. Every variant carries a remedy through
/// [`ReleaseError::remedy`]; none of them leaves anything installed.
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub enum ReleaseError {
    /// The release carries no `SHA256SUMS.minisig` (absent or empty): an
    /// unsigned release is never installed.
    NotSigned { asset: String },
    /// The key does not parse, the signature is malformed, or it does not
    /// verify over the manifest (wrong key, or the manifest changed).
    Signature(Error),
    /// The signed manifest has no line for the asset.
    NotListed { asset: String },
    /// The asset's SHA-256 differs from the signed manifest's.
    HashMismatch {
        asset: String,
        expected: String,
        actual: String,
    },
    /// The signature is genuine but for another repository or version
    /// (a replayed older release).
    WrongRelease { comment: String, wanted: String },
}

impl ReleaseError {
    pub fn remedy(&self) -> String {
        match self {
            ReleaseError::NotSigned { .. } => {
                "sign the release (sign-releases) or wait for the author to; nothing was installed"
                    .into()
            }
            ReleaseError::Signature(e) => e.remedy.clone(),
            ReleaseError::NotListed { .. } => {
                "the release is incomplete or was built differently; do not install it".into()
            }
            ReleaseError::HashMismatch { .. } => {
                "the download is corrupted or tampered with; fetch it again, and do not install this copy".into()
            }
            ReleaseError::WrongRelease { .. } => {
                "the signature belongs to another release; the host may be replaying an older one; nothing was installed".into()
            }
        }
    }
}

impl ReleaseError {
    /// What happened, without the remedy.
    pub fn message(&self) -> String {
        match self {
            ReleaseError::NotSigned { asset } => {
                format!("the release is not signed (no {SIG_ASSET}), not trusting {asset}")
            }
            ReleaseError::Signature(e) => e.message.clone(),
            ReleaseError::NotListed { asset } => {
                format!("the signed SHA256SUMS has no entry for `{asset}`")
            }
            ReleaseError::HashMismatch {
                asset,
                expected,
                actual,
            } => format!(
                "CHECKSUM MISMATCH for {asset}: the download's SHA-256 is {actual}, the signed SHA256SUMS says {expected}"
            ),
            ReleaseError::WrongRelease { comment, wanted } => {
                format!("the release signature is for `{comment}`, not for {wanted}")
            }
        }
    }
}

impl std::fmt::Display for ReleaseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}. What now: {}", self.message(), self.remedy())
    }
}

impl std::error::Error for ReleaseError {}

impl From<ReleaseError> for Error {
    fn from(e: ReleaseError) -> Error {
        let remedy = e.remedy();
        match e {
            ReleaseError::Signature(inner) => inner,
            other => Error::config(other.message(), remedy),
        }
    }
}

/// Bind a verified signature to the release being installed: the trusted
/// comment `sign-release.sh` writes reads `<repo> v<version>`, so a genuine
/// older manifest served under a newer version number is refused. With no
/// `repo`, only the ` v<version>` suffix is demanded.
pub(crate) fn check_trusted_comment(
    sig: &minisign_verify::Signature,
    repo: Option<&str>,
    version: Version,
) -> Result<(), ReleaseError> {
    let comment = sig.trusted_comment().trim();
    let ok = match repo {
        Some(repo) => comment == format!("{repo} v{version}"),
        None => comment.ends_with(&format!(" v{version}")),
    };
    if ok {
        Ok(())
    } else {
        Err(ReleaseError::WrongRelease {
            comment: comment.to_string(),
            wanted: format!("{} v{version}", repo.unwrap_or("this service")),
        })
    }
}

/// Verify `asset_bytes` as the release asset `asset`: the signature in
/// `minisig` (the text of `SHA256SUMS.minisig`, `None` or blank when the
/// release carries none) over `sums`, made with `pubkey` (the base64 line of
/// minisign.pub), and then the bytes against the line `sums` has for `asset`.
/// The signature is checked before any hash is trusted.
pub fn verify_release_asset(
    sums: &str,
    minisig: Option<&str>,
    pubkey: &str,
    asset: &str,
    asset_bytes: &[u8],
) -> Result<(), ReleaseError> {
    verify_sums(sums, minisig, pubkey, asset)?;
    check_asset(sums, asset, asset_bytes)
}

/// The same, also demanding the signature's trusted comment to name
/// `repo` (when given) and `version`.
pub fn verify_release_asset_for(
    sums: &str,
    minisig: Option<&str>,
    pubkey: &str,
    asset: &str,
    asset_bytes: &[u8],
    repo: Option<&str>,
    version: Version,
) -> Result<(), ReleaseError> {
    let sig = verify_sums(sums, minisig, pubkey, asset)?;
    check_trusted_comment(&sig, repo, version)?;
    check_asset(sums, asset, asset_bytes)
}

fn verify_sums(
    sums: &str,
    minisig: Option<&str>,
    pubkey: &str,
    asset: &str,
) -> Result<minisign_verify::Signature, ReleaseError> {
    let Some(sig) = minisig.filter(|s| !s.trim().is_empty()) else {
        return Err(ReleaseError::NotSigned {
            asset: asset.to_string(),
        });
    };
    verify_signature(pubkey, sums.as_bytes(), sig).map_err(ReleaseError::Signature)
}

fn check_asset(sums: &str, asset: &str, asset_bytes: &[u8]) -> Result<(), ReleaseError> {
    let expected = hash_for(sums, asset).map_err(|_| ReleaseError::NotListed {
        asset: asset.to_string(),
    })?;
    let actual = sha256_hex(asset_bytes);
    if hash_matches(&expected, &actual) {
        Ok(())
    } else {
        Err(ReleaseError::HashMismatch {
            asset: asset.to_string(),
            expected,
            actual,
        })
    }
}

#[cfg(test)]
mod tests;
