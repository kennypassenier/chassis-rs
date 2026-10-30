//! Talking to the release host: download one asset with a size cap, read
//! `VERSION`, and verify the signed manifest. Its own module because it is
//! the only part of the updater that touches the network.

use super::*;

impl Updater {
    pub(super) async fn get(&self, name: &str) -> Result<Vec<u8>, Error> {
        let url = format!("{}/{}", self.cfg.url.trim_end_matches('/'), name);
        let res = self.http.get(&url).send().await.map_err(|e| {
            Error::dependency(
                format!("GET {url} failed: {e}"),
                "is the release host reachable from here? check update_url and DNS",
            )
        })?;
        if res.status() == reqwest::StatusCode::NOT_FOUND && name == "VERSION" {
            return Err(Error::dependency(
                format!("GET {url} answered 404"),
                "the newest release is published but not signed yet (sign-release.sh adds VERSION last); nothing to install until it is, and the next check retries",
            ));
        }
        if !res.status().is_success() {
            return Err(Error::dependency(
                format!("GET {url} answered {}", res.status()),
                "the release may be incomplete (assets are uploaded one by one); the next check retries",
            ));
        }
        let too_big = |n: u64| {
            Error::config(
                format!(
                    "{url} is {n} bytes, above update_max_download_bytes ({})",
                    self.cfg.max_download_bytes
                ),
                "nothing was downloaded; raise update_max_download_bytes if the release really is that large",
            )
        };
        if let Some(len) = res.content_length()
            && len > self.cfg.max_download_bytes
        {
            return Err(too_big(len));
        }
        let mut res = res;
        let mut out: Vec<u8> = Vec::new();
        while let Some(chunk) = res.chunk().await.map_err(|e| {
            Error::dependency(format!("reading {url}: {e}"), "the next check retries")
        })? {
            out.extend_from_slice(&chunk);
            if out.len() as u64 > self.cfg.max_download_bytes {
                return Err(too_big(out.len() as u64));
            }
        }
        Ok(out)
    }

    /// The work behind [`Updater::latest`].
    pub(super) async fn fetch_latest(&self) -> Result<Version, Error> {
        let text = String::from_utf8(self.get("VERSION").await?).map_err(|_| {
            Error::dependency(
                "VERSION is not text",
                "the release host is serving something else",
            )
        })?;
        Version::parse(&text)
    }

    /// The work behind [`Updater::verify_manifest`].
    pub(super) fn check_manifest(
        &self,
        manifest: &[u8],
        signature: &str,
        version: Version,
    ) -> Result<(), Error> {
        let sig = verify_signature(&self.cfg.pubkey, manifest, signature)?;
        check_trusted_comment(&sig, self.cfg.repo.as_deref(), version).map_err(|e| {
            Error::config(
                e.message(),
                "VERSION and the signed manifest disagree: the host may be replaying an older release under a newer version number; nothing was installed",
            )
        })?;
        Ok(())
    }
}
