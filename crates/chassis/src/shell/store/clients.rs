//! The `ClientStore` implementations (file, kit database, memory). Their
//! types stay declared in the parent; the impls live here so the three
//! near-identical bodies sit side by side.

use super::{ClientStore, DbClientStore, FileClientStore, MemoryClientStore};
use crate::core::clients::{Client, ClientsFile};
use crate::core::error::Error;

impl ClientStore for FileClientStore {
    fn snapshot(&self) -> ClientsFile {
        self.state.read().expect("clients lock").clone()
    }

    fn update(
        &self,
        f: &mut dyn FnMut(&mut ClientsFile) -> Result<Client, Error>,
    ) -> Result<Client, Error> {
        let mut guard = self.state.write().expect("clients lock");
        let mut working = guard.clone();
        let client = f(&mut working)?;
        self.file.save(&working)?;
        *guard = working;
        Ok(client)
    }

    fn touch(&self, id: &str, now: &str) {
        self.state.write().expect("clients lock").touch(id, now);
    }

    fn persist(&self) -> Result<(), Error> {
        let snapshot = self.state.read().expect("clients lock").clone();
        self.file.save(&snapshot)
    }
}

#[cfg(feature = "dashboard")]
impl DbClientStore {
    pub(crate) fn open(kit: crate::storage::KitDb) -> Result<Self, Error> {
        let loaded = kit.load_clients()?;
        loaded.check_format()?;
        Ok(Self {
            kit,
            state: std::sync::RwLock::new(loaded),
        })
    }
}

#[cfg(feature = "dashboard")]
impl ClientStore for DbClientStore {
    fn snapshot(&self) -> ClientsFile {
        self.state.read().expect("clients lock").clone()
    }

    fn update(
        &self,
        f: &mut dyn FnMut(&mut ClientsFile) -> Result<Client, Error>,
    ) -> Result<Client, Error> {
        let mut guard = self.state.write().expect("clients lock");
        let mut working = guard.clone();
        let client = f(&mut working)?;
        self.kit.save_clients(&working)?;
        *guard = working;
        Ok(client)
    }

    fn touch(&self, id: &str, now: &str) {
        self.state.write().expect("clients lock").touch(id, now);
    }

    fn persist(&self) -> Result<(), Error> {
        let snapshot = self.state.read().expect("clients lock").clone();
        self.kit.save_clients(&snapshot)
    }
}

impl ClientStore for MemoryClientStore {
    fn snapshot(&self) -> ClientsFile {
        self.state.read().expect("clients lock").clone()
    }

    fn update(
        &self,
        f: &mut dyn FnMut(&mut ClientsFile) -> Result<Client, Error>,
    ) -> Result<Client, Error> {
        let mut guard = self.state.write().expect("clients lock");
        let mut working = guard.clone();
        let client = f(&mut working)?;
        *guard = working;
        Ok(client)
    }

    fn touch(&self, id: &str, now: &str) {
        self.state.write().expect("clients lock").touch(id, now);
    }

    fn persist(&self) -> Result<(), Error> {
        Ok(())
    }
}
